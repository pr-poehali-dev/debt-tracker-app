"""
API для управления общими долгами с QR-кодами.
Поддерживает создание долга, получение по share_token, подтверждение и закрытие.
"""
import json
import os
import random
import string
import psycopg2
from datetime import datetime, date

SCHEMA = "t_p29977622_debt_tracker_app"

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-User-Id, X-Auth-Token",
        "Content-Type": "application/json",
    }

def json_resp(data, status=200):
    return {"statusCode": status, "headers": cors_headers(), "body": json.dumps(data, ensure_ascii=False, default=str)}

def err(msg, status=400):
    return json_resp({"error": msg}, status)

def gen_token(n=8):
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choices(chars, k=n))

def row_to_debt(row):
    return {
        "id": str(row[0]),
        "share_token": row[1],
        "title": row[2],
        "amount": float(row[3]),
        "note": row[4],
        "due_date": str(row[5]) if row[5] else None,
        "lender_name": row[6],
        "lender_phone": row[7],
        "borrower_name": row[8],
        "borrower_phone": row[9],
        "status": row[10],
        "created_at": str(row[11]),
        "updated_at": str(row[12]),
    }

def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(), "body": ""}

    method = event.get("httpMethod", "GET")
    path = event.get("path", "/")
    qs = event.get("queryStringParameters") or {}

    # POST /  — создать долг
    if method == "POST" and (path == "/" or path == ""):
        body = json.loads(event.get("body") or "{}")
        required = ["title", "amount", "lender_name"]
        for f in required:
            if not body.get(f):
                return err(f"Поле '{f}' обязательно")

        token = gen_token()
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Гарантируем уникальность токена
                for _ in range(5):
                    cur.execute(f"SELECT 1 FROM {SCHEMA}.debts WHERE share_token = %s", (token,))
                    if not cur.fetchone():
                        break
                    token = gen_token()

                cur.execute(
                    f"""INSERT INTO {SCHEMA}.debts
                        (share_token, title, amount, note, due_date, lender_name, lender_phone, borrower_name, borrower_phone)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id, share_token, title, amount, note, due_date,
                                  lender_name, lender_phone, borrower_name, borrower_phone,
                                  status, created_at, updated_at""",
                    (
                        token,
                        body["title"],
                        float(body["amount"]),
                        body.get("note"),
                        body.get("due_date"),
                        body["lender_name"],
                        body.get("lender_phone"),
                        body.get("borrower_name"),
                        body.get("borrower_phone"),
                    )
                )
                row = cur.fetchone()
            conn.commit()
        return json_resp(row_to_debt(row), 201)

    # GET /?token=XXX — получить долг по токену
    if method == "GET" and qs.get("token"):
        token = qs["token"].upper().strip()
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, share_token, title, amount, note, due_date,
                               lender_name, lender_phone, borrower_name, borrower_phone,
                               status, created_at, updated_at
                        FROM {SCHEMA}.debts WHERE share_token = %s""",
                    (token,)
                )
                row = cur.fetchone()
        if not row:
            return err("Долг не найден", 404)
        return json_resp(row_to_debt(row))

    # GET /?lender=name или ?borrower=name — список долгов
    if method == "GET" and (qs.get("lender") or qs.get("borrower")):
        role = "lender" if qs.get("lender") else "borrower"
        name = qs.get("lender") or qs.get("borrower")
        col = "lender_name" if role == "lender" else "borrower_name"
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, share_token, title, amount, note, due_date,
                               lender_name, lender_phone, borrower_name, borrower_phone,
                               status, created_at, updated_at
                        FROM {SCHEMA}.debts
                        WHERE {col} ILIKE %s AND status != 'archived'
                        ORDER BY created_at DESC LIMIT 50""",
                    (f"%{name}%",)
                )
                rows = cur.fetchall()
        return json_resp([row_to_debt(r) for r in rows])

    # PUT /?token=XXX — обновить (подтвердить borrower или изменить статус)
    if method == "PUT" and qs.get("token"):
        token = qs["token"].upper().strip()
        body = json.loads(event.get("body") or "{}")
        fields = []
        vals = []
        for f in ["borrower_name", "borrower_phone", "status"]:
            if f in body:
                fields.append(f"{f} = %s")
                vals.append(body[f])
        if not fields:
            return err("Нечего обновлять")
        fields.append("updated_at = NOW()")
        vals.append(token)
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""UPDATE {SCHEMA}.debts SET {', '.join(fields)}
                        WHERE share_token = %s
                        RETURNING id, share_token, title, amount, note, due_date,
                                  lender_name, lender_phone, borrower_name, borrower_phone,
                                  status, created_at, updated_at""",
                    vals
                )
                row = cur.fetchone()
            conn.commit()
        if not row:
            return err("Долг не найден", 404)
        return json_resp(row_to_debt(row))

    return err("Неизвестный маршрут", 404)
