import os, json
import psycopg2

SCHEMA = "t_p29977622_debt_tracker_app"

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def json_resp(data, status=200):
    return {"statusCode": status, "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}, "body": json.dumps(data, default=str)}

def err(msg, status=400):
    return {"statusCode": status, "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}, "body": json.dumps({"error": msg})}

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
    auth_header = event.get("headers", {}).get("X-Authorization", "")
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
