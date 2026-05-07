"""
API для управления общими долгами с QR-кодами.
GET ?token=XXX — получить долг по токену
GET ?user_id=N — список долгов пользователя
POST / — создать долг
PUT ?token=XXX — обновить (решение должника, статус)
DELETE ?token=XXX&user_id=N — удалить отклонённый долг
"""
import json
import os
import random
import string
import urllib.request
import psycopg2
from datetime import datetime, date

SCHEMA = "t_p29977622_debt_tracker_app"

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-User-Id, X-Auth-Token, Authorization, X-Authorization",
        "Content-Type": "application/json",
    }

def json_resp(data, status=200):
    return {"statusCode": status, "headers": cors_headers(), "body": json.dumps(data, ensure_ascii=False, default=str)}

def err(msg, status=400):
    return json_resp({"error": msg}, status)

def send_decision_email(to_email: str, lender_name: str, borrower_name: str, debt_title: str, amount: float, decision: str):
    accepted = decision == "accepted"
    color = "#22c55e" if accepted else "#f43f5e"
    status_text = "принял" if accepted else "отклонил"
    emoji = "✅" if accepted else "❌"
    body_html = f"""
    <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
      <h2 style="color:#a855f7;margin-bottom:8px">Debt-Debt</h2>
      <p style="color:#555">Привет, {lender_name}!</p>
      <p style="color:#555"><strong>{borrower_name}</strong> {status_text} ваш долг:</p>
      <div style="background:#f5f0ff;border-radius:12px;padding:20px;margin:20px 0;border-left:4px solid {color}">
        <p style="margin:0 0 4px 0;font-weight:bold;color:#333">{debt_title}</p>
        <p style="margin:0;font-size:24px;font-weight:900;color:{color}">{emoji} {amount:,.0f} ₽</p>
      </div>
      {"<p style='color:#555'>Теперь вы можете общаться в чате прямо в приложении.</p>" if accepted else "<p style='color:#999'>Долг остался у вас со статусом «Отклонён». Вы можете удалить его в приложении.</p>"}
      <p style="color:#999;font-size:12px;margin-top:24px">Debt-Debt — управление долгами и займами</p>
    </div>
    """
    payload = json.dumps({
        "from": "Debt-Debt <noreply@debt-debt.ru>",
        "to": [to_email],
        "subject": f"{emoji} {borrower_name} {status_text} долг «{debt_title}»",
        "html": body_html,
    }).encode()
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status
    except Exception:
        pass

def gen_token(n=8):
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choices(chars, k=n))

def get_user_id_from_token(token_str, conn):
    if not token_str:
        return None
    bearer = token_str.replace("Bearer ", "").strip()
    with conn.cursor() as cur:
        cur.execute(f"SELECT user_id FROM {SCHEMA}.sessions WHERE token = %s AND expires_at > NOW()", (bearer,))
        row = cur.fetchone()
    return row[0] if row else None

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
        "lender_user_id": row[13],
        "borrower_user_id": row[14],
        "borrower_decision": row[15],
    }

def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(), "body": ""}

    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    headers = event.get("headers") or {}
    auth_header = headers.get("X-Authorization") or headers.get("Authorization") or ""

    # POST / — создать долг
    if method == "POST":
        body = json.loads(event.get("body") or "{}")
        for f in ["title", "amount", "lender_name"]:
            if not body.get(f):
                return err(f"Поле '{f}' обязательно")

        token = gen_token()
        with get_conn() as conn:
            lender_user_id = get_user_id_from_token(auth_header, conn)
            with conn.cursor() as cur:
                for _ in range(5):
                    cur.execute(f"SELECT 1 FROM {SCHEMA}.debts WHERE share_token = %s", (token,))
                    if not cur.fetchone():
                        break
                    token = gen_token()

                cur.execute(
                    f"""INSERT INTO {SCHEMA}.debts
                        (share_token, title, amount, note, due_date, lender_name, lender_phone,
                         borrower_name, borrower_phone, lender_user_id)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        RETURNING id, share_token, title, amount, note, due_date,
                                  lender_name, lender_phone, borrower_name, borrower_phone,
                                  status, created_at, updated_at, lender_user_id, borrower_user_id, borrower_decision""",
                    (token, body["title"], float(body["amount"]), body.get("note"),
                     body.get("due_date"), body["lender_name"], body.get("lender_phone"),
                     body.get("borrower_name"), body.get("borrower_phone"), lender_user_id)
                )
                row = cur.fetchone()
            conn.commit()
        return json_resp(row_to_debt(row), 201)

    # GET ?token=XXX — получить долг по токену (для QR-страницы)
    if method == "GET" and qs.get("token"):
        token = qs["token"].upper().strip()
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, share_token, title, amount, note, due_date,
                               lender_name, lender_phone, borrower_name, borrower_phone,
                               status, created_at, updated_at, lender_user_id, borrower_user_id, borrower_decision
                        FROM {SCHEMA}.debts WHERE share_token = %s""",
                    (token,)
                )
                row = cur.fetchone()
        if not row:
            return err("Долг не найден", 404)
        return json_resp(row_to_debt(row))

    # GET ?user_id=N — список долгов пользователя (кредитор или должник)
    if method == "GET" and qs.get("user_id"):
        uid = int(qs["user_id"])
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, share_token, title, amount, note, due_date,
                               lender_name, lender_phone, borrower_name, borrower_phone,
                               status, created_at, updated_at, lender_user_id, borrower_user_id, borrower_decision
                        FROM {SCHEMA}.debts
                        WHERE (lender_user_id = %s OR borrower_user_id = %s)
                          AND status != 'archived'
                        ORDER BY created_at DESC LIMIT 100""",
                    (uid, uid)
                )
                rows = cur.fetchall()
        return json_resp([row_to_debt(r) for r in rows])

    # PUT ?token=XXX — обновить долг (решение должника, смена статуса)
    if method == "PUT" and qs.get("token"):
        token = qs["token"].upper().strip()
        body = json.loads(event.get("body") or "{}")
        fields = []
        vals = []

        for f in ["borrower_name", "borrower_phone", "status", "borrower_decision"]:
            if f in body:
                fields.append(f"{f} = %s")
                vals.append(body[f])

        # Привязываем borrower_user_id если передан
        if "borrower_user_id" in body:
            fields.append("borrower_user_id = %s")
            vals.append(body["borrower_user_id"])

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
                                  status, created_at, updated_at, lender_user_id, borrower_user_id, borrower_decision""",
                    vals
                )
                row = cur.fetchone()
                # Отправляем email кредитору если должник принял/отклонил
                if row and body.get("borrower_decision") in ("accepted", "rejected") and row[13]:
                    cur.execute(f"SELECT email FROM {SCHEMA}.users WHERE id = %s", (row[13],))
                    lender_row = cur.fetchone()
                    if lender_row:
                        send_decision_email(
                            to_email=lender_row[0],
                            lender_name=str(row[6]),
                            borrower_name=body.get("borrower_name") or str(row[8] or "Должник"),
                            debt_title=str(row[2]),
                            amount=float(row[3]),
                            decision=body["borrower_decision"],
                        )
            conn.commit()
        if not row:
            return err("Долг не найден", 404)
        return json_resp(row_to_debt(row))

    # DELETE ?token=XXX — удалить отклонённый долг (только кредитор)
    if method == "DELETE" and qs.get("token"):
        token = qs["token"].upper().strip()
        with get_conn() as conn:
            user_id = get_user_id_from_token(auth_header, conn)
            if not user_id:
                return err("Не авторизован", 401)
            with conn.cursor() as cur:
                cur.execute(
                    f"""UPDATE {SCHEMA}.debts SET status = 'archived', updated_at = NOW()
                        WHERE share_token = %s AND lender_user_id = %s
                          AND borrower_decision = 'rejected'
                        RETURNING id""",
                    (token, user_id)
                )
                row = cur.fetchone()
            conn.commit()
        if not row:
            return err("Долг не найден или нет прав", 403)
        return json_resp({"ok": True})

    return err("Неизвестный маршрут", 404)