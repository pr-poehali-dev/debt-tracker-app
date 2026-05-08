"""
API для управления арендой с QR-кодами и ежемесячными платежами. v2
GET ?token=XXX — получить аренду по токену (QR-страница)
GET ?user_id=N — список аренд пользователя
POST / — создать аренду
PUT ?token=XXX — обновить (решение арендатора, статус оплаты, изменение суммы)
DELETE ?token=XXX&user_id=N — удалить аренду
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


def row_to_rental(row):
    return {
        "id": str(row[0]),
        "share_token": row[1],
        "title": row[2],
        "amount": float(row[3]),
        "note": row[4],
        "payment_day": row[5],
        "landlord_name": row[6],
        "landlord_phone": row[7],
        "tenant_name": row[8],
        "tenant_phone": row[9],
        "landlord_user_id": row[10],
        "tenant_user_id": row[11],
        "tenant_decision": row[12],
        "status": row[13],
        "current_month_status_landlord": row[14],
        "current_month_status_tenant": row[15],
        "last_payment_month": row[16],
        "pending_amount": float(row[17]) if row[17] is not None else None,
        "created_at": str(row[18]),
        "updated_at": str(row[19]),
    }


def send_email(to_email: str, subject: str, body_html: str):
    payload = json.dumps({
        "from": "Debt-Debt <noreply@debt-debt.ru>",
        "to": [to_email],
        "subject": subject,
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


def send_decision_email(to_email: str, landlord_name: str, tenant_name: str, title: str, amount: float, decision: str):
    accepted = decision == "accepted"
    color = "#22c55e" if accepted else "#f43f5e"
    status_text = "принял" if accepted else "отклонил"
    emoji = "✅" if accepted else "❌"
    body_html = f"""
    <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
      <h2 style="color:#a855f7;margin-bottom:8px">Debt-Debt</h2>
      <p style="color:#555">Привет, {landlord_name}!</p>
      <p style="color:#555"><strong>{tenant_name}</strong> {status_text} аренду:</p>
      <div style="background:#f5f0ff;border-radius:12px;padding:20px;margin:20px 0;border-left:4px solid {color}">
        <p style="margin:0 0 4px 0;font-weight:bold;color:#333">{title}</p>
        <p style="margin:4px 0 0;font-size:24px;font-weight:900;color:{color}">{emoji} {amount:,.0f} ₽/мес</p>
      </div>
      <p style="color:#999;font-size:12px;margin-top:24px">Debt-Debt — управление долгами и арендой</p>
    </div>
    """
    send_email(to_email, f"{emoji} {tenant_name} {status_text} аренду «{title}»", body_html)


def send_amount_change_email(to_email: str, tenant_name: str, landlord_name: str, title: str, old_amount: float, new_amount: float, share_token: str):
    body_html = f"""
    <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
      <h2 style="color:#a855f7;margin-bottom:8px">Debt-Debt</h2>
      <p style="color:#555">Привет, {tenant_name}!</p>
      <p style="color:#555">Арендодатель <strong>{landlord_name}</strong> изменил сумму аренды:</p>
      <div style="background:#f5f0ff;border-radius:12px;padding:20px;margin:20px 0;border-left:4px solid #f59e0b">
        <p style="margin:0 0 4px 0;font-weight:bold;color:#333">{title}</p>
        <p style="margin:4px 0;font-size:14px;color:#888">Было: {old_amount:,.0f} ₽/мес</p>
        <p style="margin:0;font-size:24px;font-weight:900;color:#f59e0b">Стало: {new_amount:,.0f} ₽/мес</p>
      </div>
      <p style="color:#555">Войдите в приложение, чтобы принять или отклонить изменение.</p>
      <a href="https://debt-debt.ru/?rental={share_token}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#a855f7;color:white;border-radius:8px;text-decoration:none;font-weight:bold">Открыть аренду</a>
      <p style="color:#999;font-size:12px;margin-top:24px">Debt-Debt — управление долгами и арендой</p>
    </div>
    """
    send_email(to_email, f"⚠️ Изменение суммы аренды «{title}»", body_html)


def handler(event: dict, context) -> dict:
    """API аренды: создание, получение, обновление, удаление"""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(), "body": ""}

    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    headers = event.get("headers") or {}
    auth_header = headers.get("X-Authorization") or headers.get("Authorization") or ""

    # POST / — создать аренду
    if method == "POST":
        body = json.loads(event.get("body") or "{}")
        for f in ["title", "amount", "payment_day", "landlord_name"]:
            if not body.get(f):
                return err(f"Поле '{f}' обязательно")

        token = gen_token()
        with get_conn() as conn:
            landlord_user_id = get_user_id_from_token(auth_header, conn)
            with conn.cursor() as cur:
                for _ in range(5):
                    cur.execute(f"SELECT 1 FROM {SCHEMA}.rentals WHERE share_token = %s", (token,))
                    if not cur.fetchone():
                        break
                    token = gen_token()

                cur.execute(
                    f"""INSERT INTO {SCHEMA}.rentals
                        (share_token, title, amount, note, payment_day, landlord_name, landlord_phone,
                         tenant_name, tenant_phone, landlord_user_id)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        RETURNING id, share_token, title, amount, note, payment_day,
                                  landlord_name, landlord_phone, tenant_name, tenant_phone,
                                  landlord_user_id, tenant_user_id, tenant_decision, status,
                                  current_month_status_landlord, current_month_status_tenant,
                                  last_payment_month, pending_amount, created_at, updated_at""",
                    (token, body["title"], float(body["amount"]), body.get("note"),
                     int(body["payment_day"]), body["landlord_name"], body.get("landlord_phone"),
                     body.get("tenant_name"), body.get("tenant_phone"), landlord_user_id)
                )
                row = cur.fetchone()
            conn.commit()
        return json_resp(row_to_rental(row), 201)

    # GET ?token=XXX — получить аренду по токену (для QR-страницы)
    if method == "GET" and qs.get("token"):
        token = qs["token"].upper().strip()
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, share_token, title, amount, note, payment_day,
                               landlord_name, landlord_phone, tenant_name, tenant_phone,
                               landlord_user_id, tenant_user_id, tenant_decision, status,
                               current_month_status_landlord, current_month_status_tenant,
                               last_payment_month, pending_amount, created_at, updated_at
                        FROM {SCHEMA}.rentals WHERE share_token = %s""",
                    (token,)
                )
                row = cur.fetchone()
        if not row:
            return err("Аренда не найдена", 404)
        return json_resp(row_to_rental(row))

    # GET ?user_id=N — список аренд пользователя
    if method == "GET" and qs.get("user_id"):
        user_id = int(qs["user_id"])
        auth_user_id = None
        with get_conn() as conn:
            auth_user_id = get_user_id_from_token(auth_header, conn)
            if auth_user_id != user_id:
                return err("Нет доступа", 403)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, share_token, title, amount, note, payment_day,
                               landlord_name, landlord_phone, tenant_name, tenant_phone,
                               landlord_user_id, tenant_user_id, tenant_decision, status,
                               current_month_status_landlord, current_month_status_tenant,
                               last_payment_month, pending_amount, created_at, updated_at
                        FROM {SCHEMA}.rentals
                        WHERE landlord_user_id = %s OR tenant_user_id = %s
                        ORDER BY created_at DESC""",
                    (user_id, user_id)
                )
                rows = cur.fetchall()
        return json_resp([row_to_rental(r) for r in rows])

    # PUT ?token=XXX — обновить аренду
    if method == "PUT" and qs.get("token"):
        token = qs["token"].upper().strip()
        body = json.loads(event.get("body") or "{}")

        with get_conn() as conn:
            auth_user_id = get_user_id_from_token(auth_header, conn)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, share_token, title, amount, note, payment_day,
                               landlord_name, landlord_phone, tenant_name, tenant_phone,
                               landlord_user_id, tenant_user_id, tenant_decision, status,
                               current_month_status_landlord, current_month_status_tenant,
                               last_payment_month, pending_amount, created_at, updated_at
                        FROM {SCHEMA}.rentals WHERE share_token = %s""",
                    (token,)
                )
                row = cur.fetchone()
                if not row:
                    return err("Аренда не найдена", 404)
                rental = row_to_rental(row)

                updates = []
                params = []

                # Решение арендатора (принять/отклонить)
                if "tenant_decision" in body:
                    decision = body["tenant_decision"]
                    updates.append("tenant_decision = %s")
                    params.append(decision)
                    # Привязать tenant_user_id если авторизован
                    if auth_user_id and not rental["tenant_user_id"]:
                        updates.append("tenant_user_id = %s")
                        params.append(auth_user_id)

                # Отметить оплату (landlord или tenant)
                if "payment_status" in body:
                    role = body.get("role", "landlord")
                    status_val = body["payment_status"]
                    current_month = date.today().strftime("%Y-%m")
                    if role == "landlord":
                        updates.append("current_month_status_landlord = %s")
                        params.append(status_val)
                    else:
                        updates.append("current_month_status_tenant = %s")
                        params.append(status_val)
                    updates.append("last_payment_month = %s")
                    params.append(current_month)

                # Изменение суммы арендодателем
                if "new_amount" in body:
                    new_amount = float(body["new_amount"])
                    updates.append("pending_amount = %s")
                    params.append(new_amount)
                    updates.append("tenant_decision = %s")
                    params.append("pending_amount")

                # Принятие/отклонение нового тарифа арендатором
                if "accept_new_amount" in body:
                    if body["accept_new_amount"]:
                        cur.execute(f"SELECT pending_amount FROM {SCHEMA}.rentals WHERE share_token = %s", (token,))
                        pa = cur.fetchone()
                        if pa and pa[0]:
                            updates.append("amount = %s")
                            params.append(float(pa[0]))
                        updates.append("pending_amount = NULL")
                        updates.append("tenant_decision = %s")
                        params.append("accepted")
                    else:
                        updates.append("pending_amount = NULL")
                        updates.append("tenant_decision = %s")
                        params.append("accepted")

                # Архивировать
                if "status" in body:
                    updates.append("status = %s")
                    params.append(body["status"])

                if updates:
                    updates.append("updated_at = NOW()")
                    params.append(token)
                    cur.execute(
                        f"UPDATE {SCHEMA}.rentals SET {', '.join(updates)} WHERE share_token = %s RETURNING id, share_token, title, amount, note, payment_day, landlord_name, landlord_phone, tenant_name, tenant_phone, landlord_user_id, tenant_user_id, tenant_decision, status, current_month_status_landlord, current_month_status_tenant, last_payment_month, pending_amount, created_at, updated_at",
                        params
                    )
                    updated = cur.fetchone()
            conn.commit()

        # Email + in-app уведомления арендодателю
        if "tenant_decision" in body and rental.get("landlord_user_id"):
            decision = body["tenant_decision"]
            tenant_name = rental["tenant_name"] or "Арендатор"
            accepted = decision == "accepted"
            notif_title = f"{'✅' if accepted else '❌'} {tenant_name} {'принял' if accepted else 'отклонил'} аренду"
            notif_body = f"«{rental['title']}» — {int(rental['amount']):,} ₽/мес".replace(",", " ")
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(f"SELECT email FROM {SCHEMA}.users WHERE id = %s", (rental["landlord_user_id"],))
                    u = cur.fetchone()
                    if u and u[0]:
                        send_decision_email(u[0], rental["landlord_name"], tenant_name,
                                            rental["title"], rental["amount"], decision)
                    cur.execute(
                        f"INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data) VALUES (%s, %s, %s, %s, %s)",
                        (rental["landlord_user_id"], "rental_decision", notif_title, notif_body,
                         json.dumps({"rental_token": token, "decision": decision}))
                    )
                conn.commit()

        if "new_amount" in body and rental.get("tenant_user_id"):
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(f"SELECT email FROM {SCHEMA}.users WHERE id = %s", (rental["tenant_user_id"],))
                    u = cur.fetchone()
                    if u and u[0]:
                        send_amount_change_email(u[0], rental["tenant_name"] or "Арендатор",
                                                 rental["landlord_name"], rental["title"],
                                                 rental["amount"], float(body["new_amount"]), token)

        return json_resp(row_to_rental(updated) if updated else {"ok": True})

    # DELETE ?token=XXX&user_id=N — удалить аренду
    if method == "DELETE" and qs.get("token"):
        token = qs["token"].upper().strip()
        with get_conn() as conn:
            auth_user_id = get_user_id_from_token(auth_header, conn)
            with conn.cursor() as cur:
                cur.execute(f"SELECT landlord_user_id, tenant_user_id FROM {SCHEMA}.rentals WHERE share_token = %s", (token,))
                row = cur.fetchone()
                if not row:
                    return err("Аренда не найдена", 404)
                if auth_user_id not in [row[0], row[1]]:
                    return err("Нет доступа", 403)
                cur.execute(f"DELETE FROM {SCHEMA}.rentals WHERE share_token = %s", (token,))
            conn.commit()
        return json_resp({"ok": True})

    return err("Неверный запрос", 400)