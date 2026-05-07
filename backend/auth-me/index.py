"""Получение данных текущего пользователя по токену сессии."""
import json
import os
from datetime import datetime, timezone
import psycopg2


CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
}


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    headers = event.get("headers") or {}
    auth = headers.get("X-Authorization") or headers.get("Authorization") or ""
    token = auth.replace("Bearer ", "").strip()

    if not token:
        return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Не авторизован"})}

    now = datetime.now(timezone.utc)
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()

    cur.execute(
        "SELECT u.id, u.full_name, u.phone, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = %s AND s.expires_at > %s",
        (token, now),
    )
    row = cur.fetchone()
    conn.close()

    if not row:
        return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Сессия истекла"})}

    user_id, full_name, phone, email = row
    return {
        "statusCode": 200,
        "headers": CORS,
        "body": json.dumps({"id": user_id, "full_name": full_name, "phone": phone, "email": email}),
    }
