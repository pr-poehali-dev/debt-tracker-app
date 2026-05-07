"""Проверка кода и создание аккаунта (регистрация) или сессии (вход)."""
import json
import os
import secrets
from datetime import datetime, timedelta, timezone
import psycopg2


CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    body = json.loads(event.get("body") or "{}")
    email = (body.get("email") or "").strip().lower()
    code = (body.get("code") or "").strip()
    full_name = (body.get("full_name") or "").strip()
    phone = (body.get("phone") or "").strip()

    if not email or not code:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Email и код обязательны"})}

    now = datetime.now(timezone.utc)

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()

    cur.execute(
        "SELECT id FROM verification_codes WHERE email = %s AND code = %s AND used = FALSE AND expires_at > %s ORDER BY created_at DESC LIMIT 1",
        (email, code, now),
    )
    row = cur.fetchone()
    if not row:
        conn.close()
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Неверный или истёкший код"})}

    code_id = row[0]
    cur.execute("UPDATE verification_codes SET used = TRUE WHERE id = %s", (code_id,))

    cur.execute("SELECT id, full_name, phone, email FROM users WHERE email = %s", (email,))
    user_row = cur.fetchone()

    if user_row:
        user_id, db_full_name, db_phone, db_email = user_row
    else:
        if not full_name or not phone:
            conn.close()
            return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "ФИО и телефон обязательны для регистрации"})}
        cur.execute(
            "INSERT INTO users (full_name, phone, email) VALUES (%s, %s, %s) RETURNING id, full_name, phone, email",
            (full_name, phone, email),
        )
        user_id, db_full_name, db_phone, db_email = cur.fetchone()

    token = secrets.token_hex(32)
    expires_at = now + timedelta(days=30)
    cur.execute(
        "INSERT INTO sessions (user_id, token, expires_at) VALUES (%s, %s, %s)",
        (user_id, token, expires_at),
    )
    conn.commit()
    conn.close()

    return {
        "statusCode": 200,
        "headers": CORS,
        "body": json.dumps({
            "ok": True,
            "token": token,
            "user": {"id": user_id, "full_name": db_full_name, "phone": db_phone, "email": db_email},
        }),
    }
