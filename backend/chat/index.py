"""
Чат между участниками долга или аренды. v2 — VAPID push
GET ?debt_id=UUID           — сообщения по долгу
GET ?rental_id=N            — сообщения по аренде
GET ?unread=1               — кол-во непрочитанных (все чаты пользователя)
POST /                      — отправить сообщение {debt_id|rental_id, text}
PUT /                       — пометить прочитанными {debt_id|rental_id}
POST ?action=subscribe      — подписаться на push {endpoint, p256dh, auth}
GET  ?action=vapid-key      — публичный VAPID ключ
"""
import json
import os
import psycopg2

SCHEMA = "t_p29977622_debt_tracker_app"

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def cors():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Authorization",
        "Content-Type": "application/json",
    }

def json_resp(data, status=200):
    return {"statusCode": status, "headers": cors(), "body": json.dumps(data, ensure_ascii=False, default=str)}

def err(msg, status=400):
    return json_resp({"error": msg}, status)

def get_user_from_token(token_str, conn):
    if not token_str:
        return None, None
    bearer = token_str.replace("Bearer ", "").strip()
    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT s.user_id, u.full_name FROM {SCHEMA}.sessions s
                JOIN {SCHEMA}.users u ON u.id = s.user_id
                WHERE s.token = %s AND s.expires_at > NOW()""",
            (bearer,)
        )
        row = cur.fetchone()
    return (row[0], row[1]) if row else (None, None)

def send_push_notification(conn, recipient_user_id, title, body_text):
    try:
        from pywebpush import webpush, WebPushException
        vapid_private = os.environ.get("VAPID_PRIVATE_KEY", "")
        vapid_public = os.environ.get("VAPID_PUBLIC_KEY", "")
        if not vapid_private or not vapid_public:
            return
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT endpoint, p256dh, auth_key FROM {SCHEMA}.push_subscriptions WHERE user_id = %s",
                (recipient_user_id,)
            )
            subs = cur.fetchall()
        for endpoint, p256dh, auth_key in subs:
            try:
                webpush(
                    subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth_key}},
                    data=json.dumps({"title": title, "body": body_text}),
                    vapid_private_key=vapid_private,
                    vapid_claims={"sub": "mailto:noreply@debt-debt.ru"}
                )
            except WebPushException:
                pass
    except Exception:
        pass

def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors(), "body": ""}

    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    headers = event.get("headers") or {}
    auth = headers.get("X-Authorization") or headers.get("Authorization") or ""

    # GET ?action=vapid-key — публичный ключ для фронтенда
    if method == "GET" and qs.get("action") == "vapid-key":
        return json_resp({"public_key": os.environ.get("VAPID_PUBLIC_KEY", "")})

    # GET ?unread=1 — общий счётчик непрочитанных
    if method == "GET" and qs.get("unread") == "1":
        with get_conn() as conn:
            user_id, _ = get_user_from_token(auth, conn)
            if not user_id:
                return err("Не авторизован", 401)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT COUNT(*) FROM {SCHEMA}.messages m
                        WHERE m.is_read = false AND m.sender_user_id != %s
                        AND (
                          (m.debt_id IS NOT NULL AND EXISTS (
                            SELECT 1 FROM {SCHEMA}.debts d
                            WHERE d.id = m.debt_id AND (d.lender_user_id = %s OR d.borrower_user_id = %s)
                          ))
                          OR
                          (m.rental_id IS NOT NULL AND EXISTS (
                            SELECT 1 FROM {SCHEMA}.rentals r
                            WHERE r.id = m.rental_id AND (r.landlord_user_id = %s OR r.tenant_user_id = %s)
                          ))
                        )""",
                    (user_id, user_id, user_id, user_id, user_id)
                )
                count = cur.fetchone()[0]
        return json_resp({"unread": count})

    # GET ?debt_id=UUID или ?rental_id=N — получить сообщения
    if method == "GET" and (qs.get("debt_id") or qs.get("rental_id")):
        debt_id = qs.get("debt_id")
        rental_id = qs.get("rental_id")

        with get_conn() as conn:
            user_id, _ = get_user_from_token(auth, conn)
            if not user_id:
                return err("Не авторизован", 401)

            with conn.cursor() as cur:
                if debt_id:
                    cur.execute(
                        f"""SELECT id FROM {SCHEMA}.debts
                            WHERE id = %s AND (lender_user_id = %s OR borrower_user_id = %s)""",
                        (debt_id, user_id, user_id)
                    )
                    if not cur.fetchone():
                        return err("Нет доступа к чату", 403)
                    cur.execute(
                        f"""SELECT id, sender_user_id, sender_name, text, created_at, is_read
                            FROM {SCHEMA}.messages
                            WHERE debt_id = %s
                            ORDER BY created_at ASC LIMIT 200""",
                        (debt_id,)
                    )
                else:
                    cur.execute(
                        f"""SELECT id FROM {SCHEMA}.rentals
                            WHERE id = %s AND (landlord_user_id = %s OR tenant_user_id = %s)""",
                        (rental_id, user_id, user_id)
                    )
                    if not cur.fetchone():
                        return err("Нет доступа к чату", 403)
                    cur.execute(
                        f"""SELECT id, sender_user_id, sender_name, text, created_at, is_read
                            FROM {SCHEMA}.messages
                            WHERE rental_id = %s
                            ORDER BY created_at ASC LIMIT 200""",
                        (int(rental_id),)
                    )
                rows = cur.fetchall()

                # Отмечаем прочитанными чужие сообщения
                if debt_id:
                    cur.execute(
                        f"""UPDATE {SCHEMA}.messages SET is_read = true
                            WHERE debt_id = %s AND sender_user_id != %s AND is_read = false""",
                        (debt_id, user_id)
                    )
                else:
                    cur.execute(
                        f"""UPDATE {SCHEMA}.messages SET is_read = true
                            WHERE rental_id = %s AND sender_user_id != %s AND is_read = false""",
                        (int(rental_id), user_id)
                    )
            conn.commit()

        messages = [
            {
                "id": r[0],
                "sender_user_id": r[1],
                "sender_name": r[2],
                "text": r[3],
                "created_at": str(r[4]),
                "is_read": r[5],
                "is_mine": r[1] == user_id,
            }
            for r in rows
        ]
        return json_resp({"messages": messages, "user_id": user_id})

    # POST / — отправить сообщение
    if method == "POST" and not qs.get("action"):
        body = json.loads(event.get("body") or "{}")
        debt_id = body.get("debt_id")
        rental_id = body.get("rental_id")
        text = (body.get("text") or "").strip()

        if not (debt_id or rental_id) or not text:
            return err("debt_id или rental_id и text обязательны")
        if len(text) > 1000:
            return err("Сообщение слишком длинное")

        with get_conn() as conn:
            user_id, user_name = get_user_from_token(auth, conn)
            if not user_id:
                return err("Не авторизован", 401)

            with conn.cursor() as cur:
                if debt_id:
                    cur.execute(
                        f"""SELECT lender_user_id, borrower_user_id, title FROM {SCHEMA}.debts
                            WHERE id = %s AND (lender_user_id = %s OR borrower_user_id = %s)""",
                        (debt_id, user_id, user_id)
                    )
                    debt_row = cur.fetchone()
                    if not debt_row:
                        return err("Нет доступа к чату", 403)
                    recipient_id = debt_row[1] if debt_row[0] == user_id else debt_row[0]
                    chat_title = debt_row[2]
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.messages (debt_id, sender_user_id, sender_name, text)
                            VALUES (%s, %s, %s, %s)
                            RETURNING id, sender_user_id, sender_name, text, created_at""",
                        (debt_id, user_id, user_name, text)
                    )
                else:
                    cur.execute(
                        f"""SELECT landlord_user_id, tenant_user_id, title FROM {SCHEMA}.rentals
                            WHERE id = %s AND (landlord_user_id = %s OR tenant_user_id = %s)""",
                        (int(rental_id), user_id, user_id)
                    )
                    rental_row = cur.fetchone()
                    if not rental_row:
                        return err("Нет доступа к чату", 403)
                    recipient_id = rental_row[1] if rental_row[0] == user_id else rental_row[0]
                    chat_title = rental_row[2]
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.messages (rental_id, sender_user_id, sender_name, text)
                            VALUES (%s, %s, %s, %s)
                            RETURNING id, sender_user_id, sender_name, text, created_at""",
                        (int(rental_id), user_id, user_name, text)
                    )
                r = cur.fetchone()
            conn.commit()

            # Push-уведомление получателю
            if recipient_id:
                send_push_notification(conn, recipient_id, f"Сообщение от {user_name}", text[:80])

        return json_resp({
            "id": r[0],
            "sender_user_id": r[1],
            "sender_name": r[2],
            "text": r[3],
            "created_at": str(r[4]),
            "is_mine": True,
        }, 201)

    # PUT / — отметить прочитанными
    if method == "PUT":
        body = json.loads(event.get("body") or "{}")
        debt_id = body.get("debt_id")
        rental_id = body.get("rental_id")

        with get_conn() as conn:
            user_id, _ = get_user_from_token(auth, conn)
            if not user_id:
                return err("Не авторизован", 401)
            with conn.cursor() as cur:
                if debt_id:
                    cur.execute(
                        f"""UPDATE {SCHEMA}.messages SET is_read = true
                            WHERE debt_id = %s AND sender_user_id != %s AND is_read = false""",
                        (debt_id, user_id)
                    )
                elif rental_id:
                    cur.execute(
                        f"""UPDATE {SCHEMA}.messages SET is_read = true
                            WHERE rental_id = %s AND sender_user_id != %s AND is_read = false""",
                        (int(rental_id), user_id)
                    )
            conn.commit()
        return json_resp({"ok": True})

    # POST ?action=subscribe — сохранить push-подписку
    if method == "POST" and qs.get("action") == "subscribe":
        body = json.loads(event.get("body") or "{}")
        endpoint = body.get("endpoint", "")
        p256dh = body.get("p256dh", "")
        auth_key = body.get("auth", "")

        if not endpoint or not p256dh or not auth_key:
            return err("endpoint, p256dh и auth обязательны")

        with get_conn() as conn:
            user_id, _ = get_user_from_token(auth, conn)
            if not user_id:
                return err("Не авторизован", 401)
            with conn.cursor() as cur:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.push_subscriptions (user_id, endpoint, p256dh, auth_key)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth_key = EXCLUDED.auth_key""",
                    (user_id, endpoint, p256dh, auth_key)
                )
            conn.commit()
        return json_resp({"ok": True})

    return err("Неизвестный маршрут", 404)