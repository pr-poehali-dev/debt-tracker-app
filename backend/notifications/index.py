# build: restore-urls-1
import os, json
import psycopg2

SCHEMA = "t_p29977622_debt_tracker_app"

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def json_resp(data, status=200):
    return {"statusCode": status, "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}, "body": json.dumps(data, default=str)}

def err(msg, status=400):
    return {"statusCode": status, "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}, "body": json.dumps({"error": msg})}

def send_test_push(conn, user_id: int) -> dict:
    """Отправляет тестовый push текущему пользователю. Возвращает результат."""
    try:
        from pywebpush import webpush, WebPushException
    except Exception as e:
        return {"ok": False, "error": f"pywebpush not available: {e}"}
    vapid_private = os.environ.get("VAPID_PRIVATE_KEY", "")
    if not vapid_private:
        return {"ok": False, "error": "VAPID_PRIVATE_KEY not configured"}
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT id, endpoint, p256dh, auth_key FROM {SCHEMA}.push_subscriptions WHERE user_id = %s",
            (int(user_id),)
        )
        subs = cur.fetchall()
    if not subs:
        return {"ok": False, "error": "no_subscriptions", "subscriptions_count": 0}
    sent, removed, failed, errors = 0, 0, 0, []
    dead_ids = []
    extra_headers = {"Urgency": "high", "TTL": "86400"}
    for sub_id, endpoint, p256dh, auth_key in subs:
        try:
            webpush(
                subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth_key}},
                data=json.dumps({
                    "title": "🚀 Тестовый push от Debt-Debt",
                    "body": "Если ты это видишь — уведомления работают!",
                    "url": "/",
                }, ensure_ascii=False),
                vapid_private_key=vapid_private,
                vapid_claims={"sub": "mailto:noreply@debt-debt.ru"},
                headers=extra_headers,
                ttl=86400,
                timeout=10,
            )
            sent += 1
        except WebPushException as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status in (403, 404, 410):
                dead_ids.append(sub_id)
                removed += 1
            else:
                failed += 1
                errors.append(f"sub={sub_id} status={status}: {str(e)[:200]}")
        except Exception as e:
            failed += 1
            errors.append(f"sub={sub_id}: {str(e)[:200]}")
    if dead_ids:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"DELETE FROM {SCHEMA}.push_subscriptions WHERE id = ANY(%s)",
                    (dead_ids,)
                )
            conn.commit()
        except Exception as e:
            errors.append(f"cleanup: {e}")
    return {
        "ok": sent > 0,
        "subscriptions_count": len(subs),
        "sent": sent,
        "removed_dead": removed,
        "failed": failed,
        "errors": errors,
    }


def get_user_id_from_token(token_str, conn):
    if not token_str:
        return None
    bearer = token_str.replace("Bearer ", "").strip()
    with conn.cursor() as cur:
        cur.execute(f"SELECT user_id FROM {SCHEMA}.sessions WHERE token = %s AND expires_at > NOW()", (bearer,))
        row = cur.fetchone()
    return row[0] if row else None

def handler(event: dict, context) -> dict:
    """Управление уведомлениями пользователя — получение и пометка прочитанными"""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Authorization", "Access-Control-Max-Age": "86400"}, "body": ""}

    method = event.get("httpMethod", "GET")
    headers = event.get("headers", {}) or {}
    auth_header = (
        headers.get("X-Authorization")
        or headers.get("x-authorization")
        or headers.get("Authorization")
        or headers.get("authorization")
        or ""
    )
    qs = event.get("queryStringParameters") or {}

    with get_conn() as conn:
        user_id = get_user_id_from_token(auth_header, conn)
        if not user_id:
            return err("Не авторизован", 401)

        # GET — список уведомлений
        if method == "GET":
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT id, type, title, body, is_read, data, created_at FROM {SCHEMA}.notifications WHERE user_id = %s ORDER BY created_at DESC LIMIT 50",
                    (user_id,)
                )
                rows = cur.fetchall()
            notifs = [
                {"id": r[0], "type": r[1], "title": r[2], "body": r[3], "is_read": r[4], "data": r[5], "created_at": str(r[6])}
                for r in rows
            ]
            unread = sum(1 for n in notifs if not n["is_read"])
            return json_resp({"notifications": notifs, "unread": unread})

        # POST — отправить тестовый push текущему пользователю
        if method == "POST":
            action = (json.loads(event.get("body") or "{}").get("action") or "").strip()
            if action == "test_push":
                result = send_test_push(conn, user_id)
                return json_resp(result)
            return err("Неизвестное действие", 400)

        # PUT — пометить прочитанными
        if method == "PUT":
            body = json.loads(event.get("body") or "{}")
            notif_ids = body.get("ids")  # список id или None = все
            with conn.cursor() as cur:
                if notif_ids:
                    cur.execute(
                        f"UPDATE {SCHEMA}.notifications SET is_read = TRUE WHERE user_id = %s AND id = ANY(%s)",
                        (user_id, notif_ids)
                    )
                else:
                    cur.execute(
                        f"UPDATE {SCHEMA}.notifications SET is_read = TRUE WHERE user_id = %s",
                        (user_id,)
                    )
            conn.commit()
            return json_resp({"ok": True})

    return err("Неверный запрос", 400)