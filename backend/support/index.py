"""
Поддержка: тикеты пользователей и админ-панель.
GET /                        — список тикетов текущего пользователя (admin видит все)
GET ?ticket_id=N             — сообщения тикета
GET ?unread=1                — счётчик непрочитанных (для текущего пользователя; админ — для админа)
POST /                       — создать тикет {subject, text} ИЛИ ответить {ticket_id, text}
PUT /                        — пометить прочитанными {ticket_id}
"""
import json
import os
import psycopg2

SCHEMA = "t_p29977622_debt_tracker_app"
ADMIN_EMAIL = "elovyh@list.ru"


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


def get_user(token_str, conn):
    if not token_str:
        return None
    bearer = token_str.replace("Bearer ", "").strip()
    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT u.id, u.full_name, u.email FROM {SCHEMA}.sessions s
                JOIN {SCHEMA}.users u ON u.id = s.user_id
                WHERE s.token = %s AND s.expires_at > NOW()""",
            (bearer,)
        )
        row = cur.fetchone()
    if not row:
        return None
    return {"id": row[0], "name": row[1], "email": row[2], "is_admin": (row[2] or "").strip().lower() == ADMIN_EMAIL}


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors(), "body": ""}

    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    headers = event.get("headers") or {}
    token = headers.get("X-Authorization") or headers.get("x-authorization") or headers.get("Authorization") or headers.get("authorization") or ""

    conn = get_conn()
    try:
        user = get_user(token, conn)
        if not user:
            return err("unauthorized", 401)

        if method == "GET":
            if qs.get("unread"):
                with conn.cursor() as cur:
                    if user["is_admin"]:
                        cur.execute(f"SELECT COALESCE(SUM(unread_for_admin),0) FROM {SCHEMA}.support_tickets")
                    else:
                        cur.execute(f"SELECT COALESCE(SUM(unread_for_user),0) FROM {SCHEMA}.support_tickets WHERE user_id = %s", (user["id"],))
                    cnt = cur.fetchone()[0]
                return json_resp({"unread": int(cnt or 0)})

            if qs.get("ticket_id"):
                ticket_id = int(qs["ticket_id"])
                with conn.cursor() as cur:
                    cur.execute(f"SELECT id, user_id, subject, status, created_at FROM {SCHEMA}.support_tickets WHERE id = %s", (ticket_id,))
                    t = cur.fetchone()
                    if not t:
                        return err("not_found", 404)
                    if not user["is_admin"] and t[1] != user["id"]:
                        return err("forbidden", 403)
                    cur.execute(
                        f"""SELECT m.id, m.sender_role, m.text, m.created_at, COALESCE(u.full_name, 'Администратор')
                            FROM {SCHEMA}.support_messages m
                            LEFT JOIN {SCHEMA}.users u ON u.id = m.sender_user_id
                            WHERE m.ticket_id = %s ORDER BY m.id ASC""",
                        (ticket_id,)
                    )
                    msgs = [
                        {"id": r[0], "role": r[1], "text": r[2], "created_at": r[3], "author": (r[4] if r[1] != "admin" else "Администратор")}
                        for r in cur.fetchall()
                    ]
                return json_resp({"ticket": {"id": t[0], "user_id": t[1], "subject": t[2], "status": t[3], "created_at": t[4]}, "messages": msgs})

            with conn.cursor() as cur:
                if user["is_admin"]:
                    cur.execute(
                        f"""SELECT t.id, t.user_id, t.subject, t.status, t.created_at, t.updated_at, t.unread_for_admin, u.full_name, u.email
                            FROM {SCHEMA}.support_tickets t
                            JOIN {SCHEMA}.users u ON u.id = t.user_id
                            ORDER BY t.updated_at DESC"""
                    )
                    rows = cur.fetchall()
                    tickets = [
                        {"id": r[0], "user_id": r[1], "subject": r[2], "status": r[3], "created_at": r[4], "updated_at": r[5], "unread": r[6], "user_name": r[7], "user_email": r[8]}
                        for r in rows
                    ]
                else:
                    cur.execute(
                        f"""SELECT id, subject, status, created_at, updated_at, unread_for_user
                            FROM {SCHEMA}.support_tickets WHERE user_id = %s ORDER BY updated_at DESC""",
                        (user["id"],)
                    )
                    rows = cur.fetchall()
                    tickets = [
                        {"id": r[0], "subject": r[1], "status": r[2], "created_at": r[3], "updated_at": r[4], "unread": r[5]}
                        for r in rows
                    ]
            return json_resp({"tickets": tickets})

        if method == "POST":
            body = json.loads(event.get("body") or "{}")
            text = (body.get("text") or "").strip()
            if not text:
                return err("empty_text")

            with conn.cursor() as cur:
                if body.get("ticket_id"):
                    ticket_id = int(body["ticket_id"])
                    cur.execute(f"SELECT user_id FROM {SCHEMA}.support_tickets WHERE id = %s", (ticket_id,))
                    row = cur.fetchone()
                    if not row:
                        return err("not_found", 404)
                    if not user["is_admin"] and row[0] != user["id"]:
                        return err("forbidden", 403)
                    role = "admin" if user["is_admin"] else "user"
                    cur.execute(
                        f"INSERT INTO {SCHEMA}.support_messages (ticket_id, sender_role, sender_user_id, text) VALUES (%s, %s, %s, %s) RETURNING id, created_at",
                        (ticket_id, role, user["id"], text)
                    )
                    mid, created = cur.fetchone()
                    if user["is_admin"]:
                        cur.execute(f"UPDATE {SCHEMA}.support_tickets SET updated_at = NOW(), unread_for_user = unread_for_user + 1 WHERE id = %s", (ticket_id,))
                    else:
                        cur.execute(f"UPDATE {SCHEMA}.support_tickets SET updated_at = NOW(), unread_for_admin = unread_for_admin + 1 WHERE id = %s", (ticket_id,))
                    conn.commit()
                    return json_resp({"ok": True, "id": mid, "created_at": created})
                else:
                    subject = (body.get("subject") or "").strip() or "Без темы"
                    cur.execute(
                        f"INSERT INTO {SCHEMA}.support_tickets (user_id, subject, unread_for_admin) VALUES (%s, %s, 1) RETURNING id",
                        (user["id"], subject)
                    )
                    ticket_id = cur.fetchone()[0]
                    cur.execute(
                        f"INSERT INTO {SCHEMA}.support_messages (ticket_id, sender_role, sender_user_id, text) VALUES (%s, 'user', %s, %s)",
                        (ticket_id, user["id"], text)
                    )
                    conn.commit()
                    return json_resp({"ok": True, "ticket_id": ticket_id})

        if method == "PUT":
            body = json.loads(event.get("body") or "{}")
            ticket_id = int(body.get("ticket_id") or 0)
            if not ticket_id:
                return err("ticket_id_required")
            with conn.cursor() as cur:
                cur.execute(f"SELECT user_id FROM {SCHEMA}.support_tickets WHERE id = %s", (ticket_id,))
                row = cur.fetchone()
                if not row:
                    return err("not_found", 404)
                if not user["is_admin"] and row[0] != user["id"]:
                    return err("forbidden", 403)
                if user["is_admin"]:
                    cur.execute(f"UPDATE {SCHEMA}.support_tickets SET unread_for_admin = 0 WHERE id = %s", (ticket_id,))
                else:
                    cur.execute(f"UPDATE {SCHEMA}.support_tickets SET unread_for_user = 0 WHERE id = %s", (ticket_id,))
                conn.commit()
            return json_resp({"ok": True})

        return err("method_not_allowed", 405)
    finally:
        conn.close()
