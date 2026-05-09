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

def calc_total(amount: float, rate, itype, due_date) -> float:
    if not rate or not due_date:
        return amount
    from datetime import date as date_cls
    today = date_cls.today()
    due = due_date if isinstance(due_date, date_cls) else date_cls.fromisoformat(str(due_date))
    days = (due - today).days
    if days <= 0:
        return amount
    years = days / 365
    rate = float(rate)
    if str(itype) == "compound":
        return round(amount * (1 + rate / 100) ** years)
    return round(amount * (1 + (rate / 100) * years))

def send_decision_email(to_email: str, lender_name: str, borrower_name: str, debt_title: str, amount: float, decision: str, interest_rate=None, interest_type=None, due_date=None):
    accepted = decision == "accepted"
    color = "#22c55e" if accepted else "#f43f5e"
    status_text = "принял" if accepted else "отклонил"
    emoji = "✅" if accepted else "❌"
    total = calc_total(amount, interest_rate, interest_type, due_date)
    interest = total - amount
    interest_line = ""
    if interest_rate and interest > 0:
        itype_label = "сложные" if str(interest_type) == "compound" else "простые"
        interest_line = f"""
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e0d0ff">
          <p style="margin:0;font-size:13px;color:#888">Тело долга: {amount:,.0f} ₽</p>
          <p style="margin:2px 0 0;font-size:13px;color:#a855f7">Проценты ({interest_rate}%, {itype_label}): +{interest:,.0f} ₽</p>
        </div>"""
    body_html = f"""
    <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
      <h2 style="color:#a855f7;margin-bottom:8px">Debt-Debt</h2>
      <p style="color:#555">Привет, {lender_name}!</p>
      <p style="color:#555"><strong>{borrower_name}</strong> {status_text} ваш долг:</p>
      <div style="background:#f5f0ff;border-radius:12px;padding:20px;margin:20px 0;border-left:4px solid {color}">
        <p style="margin:0 0 4px 0;font-weight:bold;color:#333">{debt_title}</p>
        <p style="margin:0;font-size:13px;color:#888">{"Итого к возврату" if interest_rate else "Сумма долга"}</p>
        <p style="margin:4px 0 0;font-size:24px;font-weight:900;color:{color}">{emoji} {total:,.0f} ₽</p>
        {interest_line}
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
        "interest_rate": float(row[16]) if row[16] is not None else None,
        "interest_type": row[17],
        "borrower_dismissed": bool(row[18]) if len(row) > 18 else False,
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
                         borrower_name, borrower_phone, lender_user_id, interest_rate, interest_type)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        RETURNING id, share_token, title, amount, note, due_date,
                                  lender_name, lender_phone, borrower_name, borrower_phone,
                                  status, created_at, updated_at, lender_user_id, borrower_user_id, borrower_decision,
                                  interest_rate, interest_type, borrower_dismissed""",
                    (token, body["title"], float(body["amount"]), body.get("note"),
                     body.get("due_date"), body["lender_name"], body.get("lender_phone"),
                     body.get("borrower_name"), body.get("borrower_phone"), lender_user_id,
                     body.get("interest_rate"), body.get("interest_type", "simple"))
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
                               status, created_at, updated_at, lender_user_id, borrower_user_id, borrower_decision,
                               interest_rate, interest_type, borrower_dismissed
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
            auth_user_id = get_user_id_from_token(auth_header, conn)
            if not auth_user_id:
                return err("Не авторизован", 401)
            if auth_user_id != uid:
                return err("Нет доступа", 403)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, share_token, title, amount, note, due_date,
                               lender_name, lender_phone, borrower_name, borrower_phone,
                               status, created_at, updated_at, lender_user_id, borrower_user_id, borrower_decision,
                               interest_rate, interest_type, borrower_dismissed
                        FROM {SCHEMA}.debts
                        WHERE (lender_user_id = %s OR borrower_user_id = %s)
                          AND status != 'archived'
                          AND NOT (borrower_user_id = %s AND borrower_dismissed = TRUE)
                        ORDER BY created_at DESC LIMIT 100""",
                    (uid, uid, uid)
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
                                  status, created_at, updated_at, lender_user_id, borrower_user_id, borrower_decision,
                                  interest_rate, interest_type, borrower_dismissed""",
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
                            interest_rate=row[16],
                            interest_type=row[17],
                            due_date=row[5],
                        )
            conn.commit()
        if not row:
            return err("Долг не найден", 404)
        return json_resp(row_to_debt(row))

    # POST ?action=pay — должник отправляет запрос на погашение
    if method == "POST" and qs.get("action") == "pay":
        body = json.loads(event.get("body") or "{}")
        debt_id = body.get("debt_id")
        amount = body.get("amount")
        note = (body.get("note") or "").strip()
        if not debt_id or not amount:
            return err("debt_id и amount обязательны")
        with get_conn() as conn:
            user_id = get_user_id_from_token(auth_header, conn)
            if not user_id:
                return err("Не авторизован", 401)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, lender_user_id, borrower_user_id, title FROM {SCHEMA}.debts
                        WHERE id = %s AND borrower_user_id = %s AND borrower_decision = 'accepted'""",
                    (debt_id, user_id)
                )
                debt = cur.fetchone()
                if not debt:
                    return err("Долг не найден или нет доступа", 403)
                lender_id = debt[1]
                title = debt[3]
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.payment_requests (debt_id, from_user_id, to_user_id, amount, note)
                        VALUES (%s, %s, %s, %s, %s) RETURNING id""",
                    (debt_id, user_id, lender_id, float(amount), note or None)
                )
                req_id = cur.fetchone()[0]
                # Уведомление кредитору
                cur.execute(
                    f"""SELECT u.full_name FROM {SCHEMA}.users u WHERE u.id = %s""", (user_id,)
                )
                borrower_name = (cur.fetchone() or ["Должник"])[0]
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data)
                        VALUES (%s, 'payment_request', %s, %s, %s)""",
                    (lender_id,
                     f"💳 {borrower_name} отправил платёж",
                     f"«{title}» — {float(amount):,.0f} ₽".replace(",", " "),
                     json.dumps({"payment_request_id": req_id, "debt_id": debt_id, "amount": float(amount), "from_name": borrower_name, "debt_title": title}))
                )
            conn.commit()
        return json_resp({"ok": True, "payment_request_id": req_id}, 201)

    # PUT ?action=pay — кредитор принимает или отклоняет платёж
    if method == "PUT" and qs.get("action") == "pay":
        body = json.loads(event.get("body") or "{}")
        req_id = body.get("payment_request_id")
        decision = body.get("decision")  # "accepted" | "rejected"
        if not req_id or decision not in ("accepted", "rejected"):
            return err("payment_request_id и decision обязательны")
        with get_conn() as conn:
            user_id = get_user_id_from_token(auth_header, conn)
            if not user_id:
                return err("Не авторизован", 401)
            with conn.cursor() as cur:
                cur.execute(
                    f"""UPDATE {SCHEMA}.payment_requests SET status = %s, updated_at = NOW()
                        WHERE id = %s AND to_user_id = %s AND status = 'pending'
                        RETURNING debt_id, from_user_id, amount""",
                    (decision, req_id, user_id)
                )
                row = cur.fetchone()
                if not row:
                    return err("Запрос не найден или уже обработан", 404)
                debt_id, from_user_id, amount = row
                # Уведомление должнику
                cur.execute(f"SELECT title FROM {SCHEMA}.debts WHERE id = %s", (debt_id,))
                title = (cur.fetchone() or ["Долг"])[0]
                cur.execute(f"SELECT full_name FROM {SCHEMA}.users WHERE id = %s", (user_id,))
                lender_name = (cur.fetchone() or ["Кредитор"])[0]
                emoji = "✅" if decision == "accepted" else "❌"
                status_text = "принял" if decision == "accepted" else "отклонил"
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data)
                        VALUES (%s, 'payment_response', %s, %s, %s)""",
                    (from_user_id,
                     f"{emoji} {lender_name} {status_text} платёж",
                     f"«{title}» — {float(amount):,.0f} ₽".replace(",", " "),
                     json.dumps({"debt_id": str(debt_id), "decision": decision, "amount": float(amount)}))
                )
                # Если кредитор подтвердил возврат — архивируем долг
                if decision == "accepted":
                    cur.execute(
                        f"""UPDATE {SCHEMA}.debts SET status = 'archived', updated_at = NOW()
                            WHERE id = %s AND lender_user_id = %s""",
                        (debt_id, user_id)
                    )
            conn.commit()
        return json_resp({"ok": True})

    # GET ?action=pay&debt_id=UUID — запросы на оплату по долгу
    if method == "GET" and qs.get("action") == "pay":
        debt_id = qs.get("debt_id")
        if not debt_id:
            return err("debt_id обязателен")
        with get_conn() as conn:
            user_id = get_user_id_from_token(auth_header, conn)
            if not user_id:
                return err("Не авторизован", 401)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT pr.id, pr.amount, pr.note, pr.status, pr.created_at, u.full_name
                        FROM {SCHEMA}.payment_requests pr
                        JOIN {SCHEMA}.users u ON u.id = pr.from_user_id
                        WHERE pr.debt_id = %s AND (pr.from_user_id = %s OR pr.to_user_id = %s)
                        ORDER BY pr.created_at DESC LIMIT 20""",
                    (debt_id, user_id, user_id)
                )
                rows = cur.fetchall()
        return json_resp({"requests": [
            {"id": r[0], "amount": float(r[1]), "note": r[2], "status": r[3],
             "created_at": str(r[4]), "from_name": r[5]} for r in rows
        ]})

    # DELETE ?token=XXX — удалить долг (кредитор удаляет полностью, должник скрывает у себя)
    if method == "DELETE" and qs.get("token"):
        token = qs["token"].upper().strip()
        with get_conn() as conn:
            user_id = get_user_id_from_token(auth_header, conn)
            if not user_id:
                return err("Не авторизован", 401)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, title, amount, lender_user_id, borrower_user_id, status FROM {SCHEMA}.debts
                        WHERE share_token = %s""",
                    (token,)
                )
                debt_row = cur.fetchone()
                if not debt_row:
                    return err("Долг не найден", 404)
                debt_id, title, amount, lender_id, borrower_id, current_status = debt_row

                # Должник скрывает у себя
                if user_id == borrower_id and user_id != lender_id:
                    cur.execute(
                        f"""UPDATE {SCHEMA}.debts SET borrower_dismissed = TRUE, updated_at = NOW()
                            WHERE id = %s""",
                        (debt_id,)
                    )
                    # Уведомление кредитору
                    if lender_id:
                        cur.execute(f"SELECT full_name FROM {SCHEMA}.users WHERE id = %s", (user_id,))
                        borrower_name = (cur.fetchone() or ["Должник"])[0]
                        cur.execute(
                            f"""INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data)
                                VALUES (%s, 'debt_dismissed_by_borrower', %s, %s, %s)""",
                            (lender_id,
                             f"🗑 {borrower_name} удалил долг у себя",
                             f"«{title}» — {float(amount):,.0f} ₽".replace(",", " "),
                             json.dumps({"debt_id": str(debt_id), "debt_title": title, "amount": float(amount), "borrower_name": borrower_name}))
                        )
                    conn.commit()
                    return json_resp({"ok": True, "dismissed": True})

                # Кредитор удаляет полностью
                if user_id != lender_id:
                    return err("Нет прав", 403)
                if current_status in ("archived", "deleted"):
                    return err("Долг уже в архиве", 400)
                cur.execute(
                    f"""UPDATE {SCHEMA}.debts SET status = 'deleted', updated_at = NOW()
                        WHERE id = %s""",
                    (debt_id,)
                )
                # Уведомление должнику
                if borrower_id:
                    cur.execute(f"SELECT full_name FROM {SCHEMA}.users WHERE id = %s", (user_id,))
                    lender_name = (cur.fetchone() or ["Кредитор"])[0]
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data)
                            VALUES (%s, 'debt_deleted', %s, %s, %s)""",
                        (borrower_id,
                         f"🗑 {lender_name} удалил займ",
                         f"«{title}» — {float(amount):,.0f} ₽".replace(",", " "),
                         json.dumps({"debt_id": str(debt_id), "debt_title": title, "amount": float(amount), "lender_name": lender_name}))
                    )
            conn.commit()
        return json_resp({"ok": True})

    return err("Неизвестный маршрут", 404)