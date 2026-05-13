"""Long-polling endpoint для real-time событий: уведомления, сообщения, платежи"""
import json
import os
import time
import psycopg2
from datetime import datetime, timezone

SCHEMA = "t_p29977622_debt_tracker_app"

POLL_INTERVAL_SEC = 0.6
MAX_WAIT_SEC = 25


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


def get_user_id(token_str, conn):
    if not token_str:
        return None
    bearer = token_str.replace("Bearer ", "").strip()
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT user_id FROM {SCHEMA}.sessions WHERE token = %s AND expires_at > NOW()",
            (bearer,)
        )
        row = cur.fetchone()
    return row[0] if row else None


def parse_since(s):
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s)
    except Exception:
        return None


def fetch_events(conn, user_id, since_dt):
    events = []
    max_ts = since_dt

    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT id, type, title, body, is_read, data, created_at
                FROM {SCHEMA}.notifications
                WHERE user_id = %s AND created_at > %s
                ORDER BY created_at ASC LIMIT 50""",
            (user_id, since_dt)
        )
        for r in cur.fetchall():
            events.append({
                "kind": "notification",
                "id": r[0],
                "type": r[1],
                "title": r[2],
                "body": r[3],
                "is_read": r[4],
                "data": r[5],
                "created_at": r[6].isoformat(),
            })
            if not max_ts or r[6] > max_ts:
                max_ts = r[6]

    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT m.id, m.debt_id, m.rental_id, m.sender_user_id, m.sender_name, m.text, m.created_at
                FROM {SCHEMA}.messages m
                LEFT JOIN {SCHEMA}.debts d ON d.id = m.debt_id
                LEFT JOIN {SCHEMA}.rentals r ON r.id = m.rental_id
                WHERE m.sender_user_id <> %s
                  AND m.created_at > %s
                  AND (
                    d.lender_user_id = %s OR d.borrower_user_id = %s
                    OR r.landlord_user_id = %s OR r.tenant_user_id = %s
                  )
                ORDER BY m.created_at ASC LIMIT 50""",
            (user_id, since_dt, user_id, user_id, user_id, user_id)
        )
        for r in cur.fetchall():
            events.append({
                "kind": "message",
                "id": r[0],
                "debt_id": str(r[1]) if r[1] else None,
                "rental_id": r[2],
                "sender_user_id": r[3],
                "sender_name": r[4],
                "text": r[5],
                "created_at": r[6].isoformat(),
            })
            if not max_ts or r[6] > max_ts:
                max_ts = r[6]

    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT id, debt_id, from_user_id, to_user_id, amount, note, status, created_at, updated_at
                FROM {SCHEMA}.payment_requests
                WHERE (from_user_id = %s OR to_user_id = %s)
                  AND updated_at > %s
                ORDER BY updated_at ASC LIMIT 50""",
            (user_id, user_id, since_dt)
        )
        for r in cur.fetchall():
            events.append({
                "kind": "payment_request",
                "id": r[0],
                "debt_id": str(r[1]),
                "from_user_id": r[2],
                "to_user_id": r[3],
                "amount": float(r[4]),
                "note": r[5],
                "status": r[6],
                "created_at": r[7].isoformat(),
                "updated_at": r[8].isoformat(),
            })
            if not max_ts or r[8] > max_ts:
                max_ts = r[8]

    return events, max_ts


def handler(event: dict, context) -> dict:
    """Long-polling real-time канал. GET ?since=ISO. Висит до 22 сек или до появления событий."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors(), "body": ""}

    headers = event.get("headers", {}) or {}
    auth = (
        headers.get("X-Authorization")
        or headers.get("x-authorization")
        or headers.get("Authorization")
        or headers.get("authorization")
        or ""
    )
    qs = event.get("queryStringParameters") or {}
    since_str = qs.get("since")

    conn = get_conn()
    try:
        user_id = get_user_id(auth, conn)
        if not user_id:
            return err("Не авторизован", 401)

        since_dt = parse_since(since_str)
        if since_dt is None:
            since_dt = datetime.now(timezone.utc)

        deadline = time.time() + MAX_WAIT_SEC
        while True:
            events_list, max_ts = fetch_events(conn, user_id, since_dt)
            if events_list:
                return json_resp({
                    "events": events_list,
                    "now": (max_ts or since_dt).isoformat(),
                })
            if time.time() >= deadline:
                return json_resp({
                    "events": [],
                    "now": since_dt.isoformat(),
                })
            time.sleep(POLL_INTERVAL_SEC)
    finally:
        try:
            conn.close()
        except Exception:
            pass