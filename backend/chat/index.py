"""
Чат между кредитором и должником по конкретному долгу.
GET ?debt_id=UUID&user_id=N — получить сообщения
POST / — отправить сообщение
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
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors(), "body": ""}

    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    headers = event.get("headers") or {}
    auth = headers.get("X-Authorization") or headers.get("Authorization") or ""

    # GET ?debt_id=UUID — получить сообщения чата
    if method == "GET" and qs.get("debt_id"):
        debt_id = qs["debt_id"]
        with get_conn() as conn:
            user_id, _ = get_user_from_token(auth, conn)
            if not user_id:
                return err("Не авторизован", 401)

            with conn.cursor() as cur:
                # Проверяем что пользователь участник этого долга
                cur.execute(
                    f"""SELECT id FROM {SCHEMA}.debts
                        WHERE id = %s AND (lender_user_id = %s OR borrower_user_id = %s)
                          AND borrower_decision = 'accepted'""",
                    (debt_id, user_id, user_id)
                )
                if not cur.fetchone():
                    return err("Нет доступа к чату", 403)

                cur.execute(
                    f"""SELECT id, sender_user_id, sender_name, text, created_at
                        FROM {SCHEMA}.messages
                        WHERE debt_id = %s
                        ORDER BY created_at ASC LIMIT 200""",
                    (debt_id,)
                )
                rows = cur.fetchall()

        messages = [
            {
                "id": r[0],
                "sender_user_id": r[1],
                "sender_name": r[2],
                "text": r[3],
                "created_at": str(r[4]),
                "is_mine": r[1] == user_id,
            }
            for r in rows
        ]
        return json_resp({"messages": messages, "user_id": user_id})

    # POST / — отправить сообщение
    if method == "POST":
        body = json.loads(event.get("body") or "{}")
        debt_id = body.get("debt_id")
        text = (body.get("text") or "").strip()

        if not debt_id or not text:
            return err("debt_id и text обязательны")
        if len(text) > 1000:
            return err("Сообщение слишком длинное")

        with get_conn() as conn:
            user_id, user_name = get_user_from_token(auth, conn)
            if not user_id:
                return err("Не авторизован", 401)

            with conn.cursor() as cur:
                # Проверяем участие и принятый статус
                cur.execute(
                    f"""SELECT id FROM {SCHEMA}.debts
                        WHERE id = %s AND (lender_user_id = %s OR borrower_user_id = %s)
                          AND borrower_decision = 'accepted'""",
                    (debt_id, user_id, user_id)
                )
                if not cur.fetchone():
                    return err("Нет доступа к чату", 403)

                cur.execute(
                    f"""INSERT INTO {SCHEMA}.messages (debt_id, sender_user_id, sender_name, text)
                        VALUES (%s, %s, %s, %s)
                        RETURNING id, sender_user_id, sender_name, text, created_at""",
                    (debt_id, user_id, user_name, text)
                )
                r = cur.fetchone()
            conn.commit()

        return json_resp({
            "id": r[0],
            "sender_user_id": r[1],
            "sender_name": r[2],
            "text": r[3],
            "created_at": str(r[4]),
            "is_mine": True,
        }, 201)

    return err("Неизвестный маршрут", 404)
