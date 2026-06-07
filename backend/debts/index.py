# build: restore-urls-1
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

def normalize_phone(phone):
    """Приводит телефон к единому формату 7XXXXXXXXXX (РФ).
    Поддерживает +7, 8, 7 в начале и любые разделители."""
    if not phone:
        return ""
    digits = "".join(ch for ch in str(phone) if ch.isdigit())
    if not digits:
        return ""
    if len(digits) == 11 and digits[0] == "8":
        digits = "7" + digits[1:]
    elif len(digits) == 10:
        digits = "7" + digits
    return digits

def find_user_by_phone(conn, phone):
    """Ищет user_id по любому формату телефона (+7, 8, без кода)."""
    norm = normalize_phone(phone)
    if not norm:
        return None
    candidates = [norm]
    if norm.startswith("7") and len(norm) == 11:
        candidates.append("8" + norm[1:])
        candidates.append(norm[1:])
    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT id FROM {SCHEMA}.users
                WHERE regexp_replace(phone, '\\D', '', 'g') = ANY(%s)
                LIMIT 1""",
            (candidates,)
        )
        row = cur.fetchone()
    return row[0] if row else None

def send_push(conn, user_id, title, body_text, url="/"):
    try:
        from pywebpush import webpush, WebPushException
        vapid_private = os.environ.get("VAPID_PRIVATE_KEY", "")
        if not vapid_private or not user_id:
            print(f"[push] skip: no vapid or user_id (user={user_id})")
            return
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, endpoint, p256dh, auth_key FROM {SCHEMA}.push_subscriptions WHERE user_id = %s",
                (int(user_id),)
            )
            subs = cur.fetchall()
        if not subs:
            print(f"[push] no subscriptions for user_id={user_id}")
            return
        sent, removed, failed = 0, 0, 0
        dead_ids = []
        extra_headers = {"Urgency": "high", "TTL": "86400"}
        for sub_id, endpoint, p256dh, auth_key in subs:
            try:
                webpush(
                    subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth_key}},
                    data=json.dumps({"title": title, "body": body_text, "url": url}, ensure_ascii=False),
                    vapid_private_key=vapid_private,
                    vapid_claims={"sub": "mailto:noreply@debt-debt.ru"},
                    headers=extra_headers,
                    ttl=86400,
                    timeout=10,
                )
                sent += 1
            except WebPushException as e:
                status = getattr(getattr(e, "response", None), "status_code", None)
                if status in (403, 404, 410):
                    dead_ids.append(sub_id)
                    removed += 1
                else:
                    failed += 1
                    print(f"[push] WebPushException user={user_id} sub={sub_id} status={status}: {e}")
            except Exception as e:
                failed += 1
                print(f"[push] error user={user_id} sub={sub_id}: {e}")
        if dead_ids:
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        f"DELETE FROM {SCHEMA}.push_subscriptions WHERE id = ANY(%s)",
                        (dead_ids,)
                    )
                conn.commit()
            except Exception as e:
                print(f"[push] failed to remove dead subs: {e}")
        print(f"[push] user={user_id} sent={sent} removed={removed} failed={failed}")
    except Exception as e:
        print(f"[push] fatal: {e}")

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


FREE_MAX_ACTIVE_DEBTS = 5


def get_user_plan(conn, user_id: int) -> str:
    """Возвращает 'pro' или 'free'. Если запись отсутствует — 'free'."""
    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT plan, expires_at FROM {SCHEMA}.user_subscriptions WHERE user_id = %s LIMIT 1""",
            (user_id,)
        )
        row = cur.fetchone()
        if not row:
            return "free"
        plan, expires_at = row
        if plan == "pro" and expires_at is not None:
            cur.execute(
                f"""SELECT (expires_at < NOW()) FROM {SCHEMA}.user_subscriptions WHERE user_id = %s""",
                (user_id,)
            )
            is_expired = cur.fetchone()[0]
            if is_expired:
                return "free"
        return plan or "free"

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
        "lender_avatar_url": row[19] if len(row) > 19 else None,
        "borrower_avatar_url": row[20] if len(row) > 20 else None,
    }

def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(), "body": ""}
    try:
        return _handle(event, context)
    except Exception as e:
        import traceback
        print(f"[debts] UNHANDLED ERROR: {e}\n{traceback.format_exc()}")
        return json_resp({"error": "Внутренняя ошибка сервера. Попробуйте ещё раз"}, 500)

def _handle(event: dict, context) -> dict:
    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    headers = event.get("headers") or {}
    auth_header = headers.get("X-Authorization") or headers.get("Authorization") or ""
    # Фолбэк: токен может прийти в теле или query (чтобы избежать CORS preflight у части провайдеров)
    if not auth_header:
        try:
            _b = json.loads(event.get("body") or "{}")
            auth_header = _b.get("auth_token") or ""
        except Exception:
            auth_header = ""
    if not auth_header:
        auth_header = qs.get("auth_token") or ""

    # POST / — создать долг (исключая action-роуты ниже)
    if method == "POST" and not qs.get("action"):
        body = json.loads(event.get("body") or "{}")
        for f in ["title", "amount", "lender_name"]:
            if not body.get(f):
                return err(f"Поле '{f}' обязательно")

        token = gen_token()
        with get_conn() as conn:
            lender_user_id = get_user_id_from_token(auth_header, conn)
            # Находим заёмщика по телефону, чтобы привязать долг к его аккаунту
            borrower_user_id = find_user_by_phone(conn, body.get("borrower_phone"))
            # Лимит для free-тарифа на количество активных долгов
            if lender_user_id:
                plan = get_user_plan(conn, lender_user_id)
                if plan == "free":
                    with conn.cursor() as cur:
                        cur.execute(
                            f"""SELECT COUNT(*) FROM {SCHEMA}.debts
                                WHERE (lender_user_id = %s OR borrower_user_id = %s)
                                  AND status NOT IN ('archived', 'deleted', 'paid')""",
                            (lender_user_id, lender_user_id)
                        )
                        active_count = int(cur.fetchone()[0])
                    if active_count >= FREE_MAX_ACTIVE_DEBTS:
                        return json_resp({
                            "error": "limit_reached",
                            "limit_type": "debts",
                            "limit": FREE_MAX_ACTIVE_DEBTS,
                            "current": active_count,
                            "message": f"На бесплатном тарифе можно вести до {FREE_MAX_ACTIVE_DEBTS} активных долгов. Перейдите на Pro, чтобы снять ограничение."
                        }, 402)
            with conn.cursor() as cur:
                for _ in range(5):
                    cur.execute(f"SELECT 1 FROM {SCHEMA}.debts WHERE share_token = %s", (token,))
                    if not cur.fetchone():
                        break
                    token = gen_token()

                cur.execute(
                    f"""WITH inserted AS (
                            INSERT INTO {SCHEMA}.debts
                            (share_token, title, amount, note, due_date, lender_name, lender_phone,
                             borrower_name, borrower_phone, lender_user_id, borrower_user_id, interest_rate, interest_type)
                            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                            RETURNING *
                        )
                        SELECT d.id, d.share_token, d.title, d.amount, d.note, d.due_date,
                               d.lender_name, d.lender_phone, d.borrower_name, d.borrower_phone,
                               d.status, d.created_at, d.updated_at, d.lender_user_id, d.borrower_user_id, d.borrower_decision,
                               d.interest_rate, d.interest_type, d.borrower_dismissed,
                               ul.avatar_url, ub.avatar_url
                        FROM inserted d
                        LEFT JOIN {SCHEMA}.users ul ON ul.id = d.lender_user_id
                        LEFT JOIN {SCHEMA}.users ub ON ub.id = d.borrower_user_id""",
                    (token, body["title"], float(body["amount"]), body.get("note"),
                     body.get("due_date"), body["lender_name"], body.get("lender_phone"),
                     body.get("borrower_name"), body.get("borrower_phone"), lender_user_id, borrower_user_id,
                     body.get("interest_rate"), body.get("interest_type", "simple"))
                )
                row = cur.fetchone()
            conn.commit()
            # Отправить push найденному должнику
            try:
                if borrower_user_id:
                    lender_name = body.get("lender_name") or "Кредитор"
                    amount_str = f"{float(body['amount']):,.0f} ₽".replace(",", " ")
                    notif_title = f"💰 Новый долг от {lender_name}"
                    notif_body = f"«{body['title']}» — {amount_str}"
                    with conn.cursor() as cur:
                        cur.execute(
                            f"""INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data)
                                VALUES (%s, 'debt_created', %s, %s, %s)""",
                            (borrower_user_id, notif_title, notif_body,
                             json.dumps({"debt_id": str(row[0]), "lender_name": lender_name, "amount": float(body['amount'])}))
                        )
                    conn.commit()
                    send_push(conn, borrower_user_id, notif_title, notif_body, "/?section=borrowed")
            except Exception as e:
                print(f"[push] new-debt notify failed: {e}")
        return json_resp(row_to_debt(row), 201)

    # GET ?token=XXX — получить долг по токену (для QR-страницы)
    if method == "GET" and qs.get("token"):
        token = qs["token"].upper().strip()
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT d.id, d.share_token, d.title, d.amount, d.note, d.due_date,
                               d.lender_name, d.lender_phone, d.borrower_name, d.borrower_phone,
                               d.status, d.created_at, d.updated_at, d.lender_user_id, d.borrower_user_id, d.borrower_decision,
                               d.interest_rate, d.interest_type, d.borrower_dismissed,
                               ul.avatar_url, ub.avatar_url
                        FROM {SCHEMA}.debts d
                        LEFT JOIN {SCHEMA}.users ul ON ul.id = d.lender_user_id
                        LEFT JOIN {SCHEMA}.users ub ON ub.id = d.borrower_user_id
                        WHERE d.share_token = %s""",
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
                    f"""SELECT d.id, d.share_token, d.title, d.amount, d.note, d.due_date,
                               d.lender_name, d.lender_phone, d.borrower_name, d.borrower_phone,
                               d.status, d.created_at, d.updated_at, d.lender_user_id, d.borrower_user_id, d.borrower_decision,
                               d.interest_rate, d.interest_type, d.borrower_dismissed,
                               ul.avatar_url, ub.avatar_url
                        FROM {SCHEMA}.debts d
                        LEFT JOIN {SCHEMA}.users ul ON ul.id = d.lender_user_id
                        LEFT JOIN {SCHEMA}.users ub ON ub.id = d.borrower_user_id
                        WHERE (d.lender_user_id = %s OR d.borrower_user_id = %s)
                          AND NOT (d.borrower_user_id = %s AND d.borrower_dismissed = TRUE)
                        ORDER BY d.created_at DESC LIMIT 200""",
                    (uid, uid, uid)
                )
                rows = cur.fetchall()
                cur.execute(
                    f"""SELECT debt_id, COUNT(*) FROM {SCHEMA}.payment_requests
                        WHERE status = 'pending' AND (from_user_id = %s OR to_user_id = %s)
                        GROUP BY debt_id""",
                    (uid, uid)
                )
                pending_map = {str(r[0]): int(r[1]) for r in cur.fetchall()}
                cur.execute(
                    f"""SELECT debt_id, COUNT(*) FROM {SCHEMA}.topup_requests
                        WHERE status = 'pending' AND (from_user_id = %s OR to_user_id = %s)
                        GROUP BY debt_id""",
                    (uid, uid)
                )
                topup_map = {str(r[0]): int(r[1]) for r in cur.fetchall()}
                cur.execute(
                    f"""SELECT debt_id, COALESCE(SUM(amount), 0) FROM {SCHEMA}.payment_requests
                        WHERE status = 'accepted' AND (from_user_id = %s OR to_user_id = %s)
                        GROUP BY debt_id""",
                    (uid, uid)
                )
                paid_map = {str(r[0]): float(r[1]) for r in cur.fetchall()}
        result = []
        for r in rows:
            d = row_to_debt(r)
            d["pending_payments_count"] = pending_map.get(d["id"], 0)
            d["pending_topups_count"] = topup_map.get(d["id"], 0)
            d["paid_amount"] = paid_map.get(d["id"], 0.0)
            result.append(d)
        return json_resp(result)

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

        # due_date может менять только кредитор (по своей сессии)
        if "due_date" in body:
            with get_conn() as _conn_check:
                _uid = get_user_id_from_token(auth_header, _conn_check)
                if not _uid:
                    return err("Не авторизован", 401)
                with _conn_check.cursor() as _cur:
                    _cur.execute(f"SELECT lender_user_id FROM {SCHEMA}.debts WHERE share_token = %s", (token,))
                    _row = _cur.fetchone()
                    if not _row:
                        return err("Долг не найден", 404)
                    if _row[0] != _uid:
                        return err("Менять срок может только кредитор", 403)
            fields.append("due_date = %s")
            vals.append(body["due_date"] or None)

        if not fields:
            return err("Нечего обновлять")

        fields.append("updated_at = NOW()")
        vals.append(token)

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""WITH updated AS (
                            UPDATE {SCHEMA}.debts SET {', '.join(fields)}
                            WHERE share_token = %s
                            RETURNING *
                        )
                        SELECT d.id, d.share_token, d.title, d.amount, d.note, d.due_date,
                               d.lender_name, d.lender_phone, d.borrower_name, d.borrower_phone,
                               d.status, d.created_at, d.updated_at, d.lender_user_id, d.borrower_user_id, d.borrower_decision,
                               d.interest_rate, d.interest_type, d.borrower_dismissed,
                               ul.avatar_url, ub.avatar_url
                        FROM updated d
                        LEFT JOIN {SCHEMA}.users ul ON ul.id = d.lender_user_id
                        LEFT JOIN {SCHEMA}.users ub ON ub.id = d.borrower_user_id""",
                    vals
                )
                row = cur.fetchone()
                # Если долг архивирован — отменяем все висящие запросы на оплату
                if row and body.get("status") == "archived":
                    cur.execute(
                        f"""UPDATE {SCHEMA}.payment_requests SET status = 'cancelled'
                            WHERE debt_id = %s AND status = 'pending'""",
                        (row[0],)
                    )
                # Отправляем email и push кредитору если должник принял/отклонил
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
                    decision = body["borrower_decision"]
                    b_name = body.get("borrower_name") or str(row[8] or "Должник")
                    emoji = "✅" if decision == "accepted" else "❌"
                    status_text = "принял долг" if decision == "accepted" else "отклонил долг"
                    notif_title = f"{emoji} {b_name} {status_text}"
                    notif_body = f"«{row[2]}» — {float(row[3]):,.0f} ₽".replace(",", " ")
                    if row[13]:
                        with conn.cursor() as cur2:
                            cur2.execute(
                                f"""INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data)
                                    VALUES (%s, 'debt_decision', %s, %s, %s)""",
                                (row[13], notif_title, notif_body,
                                 json.dumps({"debt_id": str(row[0]), "decision": decision, "borrower_name": b_name}))
                            )
                    send_push(conn, row[13], notif_title, notif_body, "/?section=lent")
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
                     json.dumps({"payment_request_id": req_id, "debt_id": debt_id, "amount": float(amount), "from_name": borrower_name, "debt_title": title, "note": note or None}))
                )
            send_push(conn, lender_id, f"💳 {borrower_name} отправил платёж", f"«{title}» — {float(amount):,.0f} ₽".replace(",", " "), "/?section=notifications")
            conn.commit()
        return json_resp({"ok": True, "payment_request_id": req_id}, 201)

    # PUT ?action=pay — кредитор принимает/отклоняет платёж ИЛИ должник отменяет свой запрос
    if method == "PUT" and qs.get("action") == "pay":
        body = json.loads(event.get("body") or "{}")
        req_id = body.get("payment_request_id")
        decision = body.get("decision")  # "accepted" | "rejected" | "cancelled"
        if not req_id or decision not in ("accepted", "rejected", "cancelled"):
            return err("payment_request_id и decision обязательны")
        with get_conn() as conn:
            user_id = get_user_id_from_token(auth_header, conn)
            if not user_id:
                return err("Не авторизован", 401)
            with conn.cursor() as cur:
                # Сначала проверим, кто отправитель/получатель запроса
                cur.execute(
                    f"""SELECT from_user_id, to_user_id, debt_id, amount, status
                        FROM {SCHEMA}.payment_requests WHERE id = %s""",
                    (req_id,)
                )
                pr_row = cur.fetchone()
                if not pr_row:
                    return err("Запрос не найден", 404)
                pr_from, pr_to, pr_debt_id, pr_amount, pr_status = pr_row
                if pr_status != "pending":
                    return err("Запрос уже обработан", 409)
                # Должник может только отменить свой собственный запрос
                if decision == "cancelled":
                    if user_id != pr_from:
                        return err("Отменить запрос может только его автор", 403)
                else:
                    # accepted/rejected — только кредитор (получатель)
                    if user_id != pr_to:
                        return err("Только кредитор может принять или отклонить запрос", 403)
                cur.execute(
                    f"""UPDATE {SCHEMA}.payment_requests SET status = %s, updated_at = NOW()
                        WHERE id = %s AND status = 'pending'
                        RETURNING debt_id, from_user_id, amount""",
                    (decision, req_id)
                )
                row = cur.fetchone()
                if not row:
                    return err("Запрос не найден или уже обработан", 404)
                # Если должник отменил свой запрос — уведомим кредитора и выйдем
                if decision == "cancelled":
                    debt_id_c, from_user_id_c, amount_c = row
                    cur.execute(f"SELECT title FROM {SCHEMA}.debts WHERE id = %s", (debt_id_c,))
                    title_c = (cur.fetchone() or ["Долг"])[0]
                    cur.execute(f"SELECT full_name FROM {SCHEMA}.users WHERE id = %s", (from_user_id_c,))
                    borrower_name_c = (cur.fetchone() or ["Должник"])[0]
                    body_text_c = f"«{title_c}» — {float(amount_c):,.0f} ₽".replace(",", " ")
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data)
                            VALUES (%s, 'payment_response', %s, %s, %s)""",
                        (pr_to,
                         f"↩️ {borrower_name_c} отменил запрос на возврат",
                         body_text_c,
                         json.dumps({"debt_id": str(debt_id_c), "decision": "cancelled", "amount": float(amount_c)}))
                    )
                    send_push(conn, pr_to, f"↩️ {borrower_name_c} отменил запрос на возврат", body_text_c, "/?section=notifications")
                    conn.commit()
                    return json_resp({"ok": True, "cancelled": True})
                debt_id, from_user_id, amount = row
                # Уведомление должнику
                cur.execute(f"SELECT title FROM {SCHEMA}.debts WHERE id = %s", (debt_id,))
                title = (cur.fetchone() or ["Долг"])[0]
                cur.execute(f"SELECT full_name FROM {SCHEMA}.users WHERE id = %s", (user_id,))
                lender_name = (cur.fetchone() or ["Кредитор"])[0]
                emoji = "✅" if decision == "accepted" else "❌"
                status_text = "принял" if decision == "accepted" else "отклонил"
                notif_data_payload = {"debt_id": str(debt_id), "decision": decision, "amount": float(amount)}
                # Если кредитор подтвердил возврат — частичное или полное погашение
                new_amount = None
                fully_paid = False
                if decision == "accepted":
                    cur.execute(
                        f"SELECT amount FROM {SCHEMA}.debts WHERE id = %s AND lender_user_id = %s",
                        (debt_id, user_id)
                    )
                    cur_row = cur.fetchone()
                    if cur_row:
                        current_amount = float(cur_row[0])
                        remaining = round(current_amount - float(amount), 2)
                        if remaining <= 0.009:
                            fully_paid = True
                            cur.execute(
                                f"""UPDATE {SCHEMA}.debts SET status = 'archived', updated_at = NOW()
                                    WHERE id = %s AND lender_user_id = %s""",
                                (debt_id, user_id)
                            )
                            cur.execute(
                                f"""UPDATE {SCHEMA}.payment_requests SET status = 'cancelled'
                                    WHERE debt_id = %s AND status = 'pending'""",
                                (debt_id,)
                            )
                            new_amount = 0.0
                        else:
                            cur.execute(
                                f"""UPDATE {SCHEMA}.debts SET amount = %s, updated_at = NOW()
                                    WHERE id = %s AND lender_user_id = %s""",
                                (remaining, debt_id, user_id)
                            )
                            new_amount = remaining
                if new_amount is not None:
                    notif_data_payload["new_amount"] = new_amount
                    notif_data_payload["fully_paid"] = fully_paid
                if decision == "accepted":
                    if fully_paid:
                        body_text = f"«{title}» — погашен полностью ({float(amount):,.0f} ₽)".replace(",", " ")
                    else:
                        body_text = f"«{title}» — {float(amount):,.0f} ₽, остаток {new_amount:,.0f} ₽".replace(",", " ")
                else:
                    body_text = f"«{title}» — {float(amount):,.0f} ₽".replace(",", " ")
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data)
                        VALUES (%s, 'payment_response', %s, %s, %s)""",
                    (from_user_id,
                     f"{emoji} {lender_name} {status_text} платёж",
                     body_text,
                     json.dumps(notif_data_payload))
                )
            send_push(conn, from_user_id, f"{emoji} {lender_name} {status_text} платёж", body_text, "/?section=notifications")
            conn.commit()
        return json_resp({"ok": True, "new_amount": new_amount, "fully_paid": fully_paid})

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

    # POST ?action=topup — кредитор отправляет запрос на доложение суммы к существующему долгу
    if method == "POST" and qs.get("action") == "topup":
        body = json.loads(event.get("body") or "{}")
        debt_id = body.get("debt_id")
        amount = body.get("amount")
        note = (body.get("note") or "").strip()
        if not debt_id or not amount:
            return err("debt_id и amount обязательны")
        try:
            amount_val = float(amount)
        except Exception:
            return err("amount должен быть числом")
        if amount_val <= 0:
            return err("Сумма должна быть положительной")
        with get_conn() as conn:
            user_id = get_user_id_from_token(auth_header, conn)
            if not user_id:
                return err("Не авторизован", 401)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, lender_user_id, borrower_user_id, title FROM {SCHEMA}.debts
                        WHERE id = %s AND lender_user_id = %s AND status = 'active'""",
                    (debt_id, user_id)
                )
                debt = cur.fetchone()
                if not debt:
                    return err("Долг не найден или нет прав", 403)
                borrower_id = debt[2]
                title = debt[3]
                if not borrower_id:
                    return err("Заёмщик не зарегистрирован", 400)
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.topup_requests (debt_id, from_user_id, to_user_id, amount, note)
                        VALUES (%s, %s, %s, %s, %s) RETURNING id""",
                    (debt_id, user_id, borrower_id, amount_val, note or None)
                )
                req_id = cur.fetchone()[0]
                cur.execute(f"SELECT full_name FROM {SCHEMA}.users WHERE id = %s", (user_id,))
                lender_name = (cur.fetchone() or ["Кредитор"])[0]
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data)
                        VALUES (%s, 'topup_request', %s, %s, %s)""",
                    (borrower_id,
                     f"➕ {lender_name} хочет увеличить долг",
                     f"«{title}» — +{amount_val:,.0f} ₽".replace(",", " "),
                     json.dumps({"topup_request_id": req_id, "debt_id": str(debt_id), "amount": amount_val, "from_name": lender_name, "debt_title": title, "note": note or None}))
                )
            send_push(conn, borrower_id, f"➕ {lender_name} хочет увеличить долг", f"«{title}» — +{amount_val:,.0f} ₽".replace(",", " "), "/?section=notifications")
            conn.commit()
        return json_resp({"ok": True, "topup_request_id": req_id}, 201)

    # PUT ?action=topup — заёмщик принимает или отклоняет увеличение долга
    if method == "PUT" and qs.get("action") == "topup":
        body = json.loads(event.get("body") or "{}")
        req_id = body.get("topup_request_id")
        decision = body.get("decision")
        if not req_id or decision not in ("accepted", "rejected"):
            return err("topup_request_id и decision обязательны")
        with get_conn() as conn:
            user_id = get_user_id_from_token(auth_header, conn)
            if not user_id:
                return err("Не авторизован", 401)
            with conn.cursor() as cur:
                cur.execute(
                    f"""UPDATE {SCHEMA}.topup_requests SET status = %s, updated_at = NOW()
                        WHERE id = %s AND to_user_id = %s AND status = 'pending'
                        RETURNING debt_id, from_user_id, amount""",
                    (decision, req_id, user_id)
                )
                row = cur.fetchone()
                if not row:
                    return err("Запрос не найден или уже обработан", 404)
                debt_id, from_user_id, amount = row
                amount_val = float(amount)
                cur.execute(f"SELECT title FROM {SCHEMA}.debts WHERE id = %s", (debt_id,))
                title = (cur.fetchone() or ["Долг"])[0]
                cur.execute(f"SELECT full_name FROM {SCHEMA}.users WHERE id = %s", (user_id,))
                borrower_name = (cur.fetchone() or ["Должник"])[0]
                new_amount = None
                if decision == "accepted":
                    cur.execute(
                        f"SELECT amount FROM {SCHEMA}.debts WHERE id = %s AND lender_user_id = %s",
                        (debt_id, from_user_id)
                    )
                    cur_row = cur.fetchone()
                    if cur_row:
                        current_amount = float(cur_row[0])
                        new_amount = round(current_amount + amount_val, 2)
                        cur.execute(
                            f"""UPDATE {SCHEMA}.debts SET amount = %s, updated_at = NOW()
                                WHERE id = %s AND lender_user_id = %s""",
                            (new_amount, debt_id, from_user_id)
                        )
                emoji = "✅" if decision == "accepted" else "❌"
                status_text = "принял увеличение долга" if decision == "accepted" else "отклонил увеличение долга"
                if decision == "accepted":
                    body_text = f"«{title}» — +{amount_val:,.0f} ₽, итого {new_amount:,.0f} ₽".replace(",", " ")
                else:
                    body_text = f"«{title}» — +{amount_val:,.0f} ₽".replace(",", " ")
                notif_payload = {"debt_id": str(debt_id), "decision": decision, "amount": amount_val}
                if new_amount is not None:
                    notif_payload["new_amount"] = new_amount
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data)
                        VALUES (%s, 'topup_response', %s, %s, %s)""",
                    (from_user_id,
                     f"{emoji} {borrower_name} {status_text}",
                     body_text,
                     json.dumps(notif_payload))
                )
            send_push(conn, from_user_id, f"{emoji} {borrower_name} {status_text}", body_text, "/?section=notifications")
            conn.commit()
        return json_resp({"ok": True, "new_amount": new_amount})

    # GET ?action=topup&debt_id=UUID — список топ-ап запросов по долгу
    if method == "GET" and qs.get("action") == "topup":
        debt_id = qs.get("debt_id")
        if not debt_id:
            return err("debt_id обязателен")
        with get_conn() as conn:
            user_id = get_user_id_from_token(auth_header, conn)
            if not user_id:
                return err("Не авторизован", 401)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT tr.id, tr.amount, tr.note, tr.status, tr.created_at, u.full_name
                        FROM {SCHEMA}.topup_requests tr
                        JOIN {SCHEMA}.users u ON u.id = tr.from_user_id
                        WHERE tr.debt_id = %s
                        ORDER BY tr.created_at DESC""",
                    (debt_id,)
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
                    if lender_id:
                        send_push(
                            conn,
                            lender_id,
                            f"🗑 {borrower_name} удалил долг у себя",
                            f"«{title}» — {float(amount):,.0f} ₽".replace(",", " "),
                            "/?section=lent",
                        )
                    return json_resp({"ok": True, "dismissed": True})

                # Кредитор удаляет полностью
                if user_id != lender_id:
                    return err("Нет прав", 403)
                purge = (qs.get("purge") == "1")
                # purge=1 — физическое удаление из архива БЕЗ уведомлений второму участнику
                if purge:
                    # Сначала подчищаем все связанные записи, чтобы не словить foreign key violation
                    for related_sql in (
                        f"DELETE FROM {SCHEMA}.payment_requests WHERE debt_id = %s",
                        f"DELETE FROM {SCHEMA}.topup_requests WHERE debt_id = %s",
                        f"DELETE FROM {SCHEMA}.messages WHERE debt_id = %s",
                        f"DELETE FROM {SCHEMA}.contracts WHERE debt_id = %s",
                        f"DELETE FROM {SCHEMA}.reminders WHERE debt_id = %s",
                    ):
                        try:
                            cur.execute(related_sql, (debt_id,))
                        except Exception:
                            conn.rollback()
                            # Открываем новый курсор после отката
                            cur.close()
                            cur = conn.cursor()
                    # Удаляем уведомления, ссылающиеся на этот долг в JSON-поле data
                    try:
                        cur.execute(
                            f"DELETE FROM {SCHEMA}.notifications WHERE data->>'debt_id' = %s",
                            (str(debt_id),)
                        )
                    except Exception:
                        conn.rollback()
                        cur.close()
                        cur = conn.cursor()
                    cur.execute(f"DELETE FROM {SCHEMA}.debts WHERE id = %s", (debt_id,))
                    conn.commit()
                    return json_resp({"ok": True, "purged": True})
                if current_status in ("archived", "deleted"):
                    return err("Долг уже в архиве", 400)
                cur.execute(
                    f"""UPDATE {SCHEMA}.debts SET status = 'deleted', updated_at = NOW()
                        WHERE id = %s""",
                    (debt_id,)
                )
                # Уведомление должнику
                lender_name_for_push = None
                if borrower_id:
                    cur.execute(f"SELECT full_name FROM {SCHEMA}.users WHERE id = %s", (user_id,))
                    lender_name_for_push = (cur.fetchone() or ["Кредитор"])[0]
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data)
                            VALUES (%s, 'debt_deleted', %s, %s, %s)""",
                        (borrower_id,
                         f"🗑 {lender_name_for_push} удалил займ",
                         f"«{title}» — {float(amount):,.0f} ₽".replace(",", " "),
                         json.dumps({"debt_id": str(debt_id), "debt_title": title, "amount": float(amount), "lender_name": lender_name_for_push}))
                    )
            conn.commit()
            if borrower_id and lender_name_for_push:
                send_push(
                    conn,
                    borrower_id,
                    f"🗑 {lender_name_for_push} удалил займ",
                    f"«{title}» — {float(amount):,.0f} ₽".replace(",", " "),
                    "/?section=borrowed",
                )
        return json_resp({"ok": True})

    return err("Неизвестный маршрут", 404)