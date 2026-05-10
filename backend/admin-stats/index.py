"""Статистика для администратора приложения."""
import os
import json
import psycopg2
from datetime import datetime, timezone

ADMIN_PHONE = "+79680066666"

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
        return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Unauthorized"})}

    now = datetime.now(timezone.utc)
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()

    cur.execute(
        "SELECT u.id, u.phone FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = %s AND s.expires_at > %s",
        (token, now),
    )
    row = cur.fetchone()

    if not row:
        conn.close()
        return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Unauthorized"})}

    user_id, user_phone = row
    digits = "".join(ch for ch in (user_phone or "") if ch.isdigit())
    admin_digits = "".join(ch for ch in ADMIN_PHONE if ch.isdigit())
    if digits != admin_digits:
        conn.close()
        return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "Forbidden"})}

    cur.execute("SELECT COUNT(*) FROM users")
    total_users = cur.fetchone()[0]

    cur.execute("SELECT COUNT(DISTINCT user_id) FROM sessions WHERE expires_at > %s", (now,))
    active_sessions = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM debts")
    total_debts = cur.fetchone()[0]

    cur.execute("""
        SELECT u.id, u.full_name, u.email, u.created_at
        FROM users u
        ORDER BY u.created_at DESC
        LIMIT 50
    """)
    users_rows = cur.fetchall()
    conn.close()

    users_list = [
        {"id": r[0], "full_name": r[1], "email": r[2], "created_at": str(r[3])}
        for r in users_rows
    ]

    return {
        "statusCode": 200,
        "headers": {**CORS, "Content-Type": "application/json"},
        "body": json.dumps({
            "total_users": total_users,
            "active_sessions": active_sessions,
            "total_debts": total_debts,
            "users": users_list,
        }),
    }