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


def normalize_phone(phone):
    """Приводит телефон к единому формату 7XXXXXXXXXX (РФ)."""
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
        for sub_id, endpoint, p256dh, auth_key in subs:
            try:
                webpush(
                    subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth_key}},
                    data=json.dumps({"title": title, "body": body_text, "url": url}, ensure_ascii=False),
                    vapid_private_key=vapid_private,
                    vapid_claims={"sub": "mailto:noreply@debt-debt.ru"},
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
        "landlord_avatar_url": row[20] if len(row) > 20 else None,
        "tenant_avatar_url": row[21] if len(row) > 21 else None,
        "paid_until": row[22] if len(row) > 22 else None,
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
            # Push арендатору, если есть в системе
            try:
                tenant_id = find_user_by_phone(conn, body.get("tenant_phone"))
                if tenant_id:
                    amount_str = f"{float(body['amount']):,.0f} ₽".replace(",", " ")
                    notif_title = f"🏠 Новая аренда от {body['landlord_name']}"
                    notif_body = f"«{body['title']}» — {amount_str}/мес"
                    with conn.cursor() as cur:
                        cur.execute(
                            f"""INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data)
                                VALUES (%s, 'rental_created', %s, %s, %s)""",
                            (tenant_id, notif_title, notif_body,
                             json.dumps({"rental_id": str(row[0]), "landlord_name": body['landlord_name'], "amount": float(body['amount'])}))
                        )
                    conn.commit()
                    send_push(conn, tenant_id, notif_title, notif_body, "/?section=rental")
            except Exception as e:
                print(f"[push] new-rental notify failed: {e}")
        return json_resp(row_to_rental(row), 201)

    # GET ?token=XXX&history=1 — история платежей по аренде
    if method == "GET" and qs.get("token") and qs.get("history"):
        token = qs["token"].upper().strip()
        with get_conn() as conn:
            auth_user_id = get_user_id_from_token(auth_header, conn)
            with conn.cursor() as cur:
                cur.execute(f"SELECT id, landlord_user_id, tenant_user_id, amount FROM {SCHEMA}.rentals WHERE share_token = %s", (token,))
                row = cur.fetchone()
                if not row:
                    return err("Аренда не найдена", 404)
                if auth_user_id not in [row[1], row[2]]:
                    return err("Нет доступа", 403)
                cur.execute(
                    f"SELECT month, role, status, amount FROM {SCHEMA}.rental_payments WHERE rental_id = %s ORDER BY month DESC",
                    (row[0],)
                )
                payments = [{"month": r[0], "role": r[1], "status": r[2], "amount": float(r[3]) if r[3] else None} for r in cur.fetchall()]
        return json_resp({"payments": payments})

    # GET ?token=XXX — получить аренду по токену (для QR-страницы)
    if method == "GET" and qs.get("token"):
        token = qs["token"].upper().strip()
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT r.id, r.share_token, r.title, r.amount, r.note, r.payment_day,
                               r.landlord_name, r.landlord_phone, r.tenant_name, r.tenant_phone,
                               r.landlord_user_id, r.tenant_user_id, r.tenant_decision, r.status,
                               r.current_month_status_landlord, r.current_month_status_tenant,
                               r.last_payment_month, r.pending_amount, r.created_at, r.updated_at,
                               lu.avatar_url, tu.avatar_url
                        FROM {SCHEMA}.rentals r
                        LEFT JOIN {SCHEMA}.users lu ON lu.id = r.landlord_user_id
                        LEFT JOIN {SCHEMA}.users tu ON tu.id = r.tenant_user_id
                        WHERE r.share_token = %s""",
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
            if not auth_user_id:
                return err("Не авторизован", 401)
            if auth_user_id != user_id:
                return err("Нет доступа", 403)
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT r.id, r.share_token, r.title, r.amount, r.note, r.payment_day,
                               r.landlord_name, r.landlord_phone, r.tenant_name, r.tenant_phone,
                               r.landlord_user_id, r.tenant_user_id, r.tenant_decision, r.status,
                               r.current_month_status_landlord, r.current_month_status_tenant,
                               r.last_payment_month, r.pending_amount, r.created_at, r.updated_at,
                               lu.avatar_url, tu.avatar_url,
                               (SELECT MAX(month) FROM {SCHEMA}.rental_payments
                                  WHERE rental_id = r.id
                                  AND status = 'paid'
                                  AND role = CASE WHEN r.landlord_user_id = %s THEN 'landlord' ELSE 'tenant' END) AS paid_until
                        FROM {SCHEMA}.rentals r
                        LEFT JOIN {SCHEMA}.users lu ON lu.id = r.landlord_user_id
                        LEFT JOIN {SCHEMA}.users tu ON tu.id = r.tenant_user_id
                        WHERE r.landlord_user_id = %s OR r.tenant_user_id = %s
                        ORDER BY r.created_at DESC""",
                    (user_id, user_id, user_id)
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
                    f"""SELECT r.id, r.share_token, r.title, r.amount, r.note, r.payment_day,
                               r.landlord_name, r.landlord_phone, r.tenant_name, r.tenant_phone,
                               r.landlord_user_id, r.tenant_user_id, r.tenant_decision, r.status,
                               r.current_month_status_landlord, r.current_month_status_tenant,
                               r.last_payment_month, r.pending_amount, r.created_at, r.updated_at,
                               lu.avatar_url, tu.avatar_url
                        FROM {SCHEMA}.rentals r
                        LEFT JOIN {SCHEMA}.users lu ON lu.id = r.landlord_user_id
                        LEFT JOIN {SCHEMA}.users tu ON tu.id = r.tenant_user_id
                        WHERE r.share_token = %s""",
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

                # Отметить оплату (landlord или tenant) — поддержка произвольного месяца (предоплата)
                if "payment_status" in body:
                    role = body.get("role", "landlord")
                    status_val = body["payment_status"]
                    current_month = date.today().strftime("%Y-%m")
                    target_month = (body.get("month") or current_month).strip()
                    # Валидация формата YYYY-MM
                    try:
                        datetime.strptime(target_month, "%Y-%m")
                    except Exception:
                        return err("Неверный формат месяца")
                    # Запрещаем оплачивать прошлые месяцы (раньше текущего)
                    if target_month < current_month:
                        return err("Нельзя оплачивать прошедшие месяцы")
                    is_current = target_month == current_month
                    # Обновляем «оперативные» поля аренды только если это текущий месяц
                    if is_current:
                        if role == "landlord":
                            updates.append("current_month_status_landlord = %s")
                            params.append(status_val)
                        else:
                            updates.append("current_month_status_tenant = %s")
                            params.append(status_val)
                        updates.append("last_payment_month = %s")
                        params.append(current_month)
                    # Записать в историю платежей
                    rental_id = rental["id"]
                    if status_val == "paid":
                        cur.execute(
                            f"""INSERT INTO {SCHEMA}.rental_payments (rental_id, month, role, status, amount)
                                VALUES (%s, %s, %s, 'paid', %s)
                                ON CONFLICT (rental_id, month, role) DO UPDATE SET status='paid', amount=EXCLUDED.amount""",
                            (rental_id, target_month, role, rental["amount"])
                        )
                    else:
                        cur.execute(
                            f"DELETE FROM {SCHEMA}.rental_payments WHERE rental_id=%s AND month=%s AND role=%s",
                            (rental_id, target_month, role)
                        )
                    # Уведомление другой стороне при оплате
                    if status_val == "paid":
                        prefix = "" if is_current else f"(за {target_month}) "
                        if role == "tenant" and rental.get("landlord_user_id"):
                            notif_title = f"💰 {rental['tenant_name'] or 'Арендатор'} {prefix}оплатил аренду"
                            notif_body = f"«{rental['title']}» — {int(rental['amount']):,} ₽".replace(",", " ")
                            cur.execute(
                                f"INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data) VALUES (%s, %s, %s, %s, %s)",
                                (rental["landlord_user_id"], "payment", notif_title, notif_body, json.dumps({"rental_token": token, "month": target_month}))
                            )
                            send_push(conn, rental["landlord_user_id"], notif_title, notif_body, "/?section=rental")
                        elif role == "landlord" and rental.get("tenant_user_id"):
                            notif_title = f"💰 {rental['landlord_name']} {prefix}подтвердил получение оплаты"
                            notif_body = f"«{rental['title']}» — {int(rental['amount']):,} ₽".replace(",", " ")
                            cur.execute(
                                f"INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data) VALUES (%s, %s, %s, %s, %s)",
                                (rental["tenant_user_id"], "payment", notif_title, notif_body, json.dumps({"rental_token": token, "month": target_month}))
                            )
                            send_push(conn, rental["tenant_user_id"], notif_title, notif_body, "/?section=rental")

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
                        f"""WITH upd AS (
                                UPDATE {SCHEMA}.rentals SET {', '.join(updates)} WHERE share_token = %s
                                RETURNING *
                            )
                            SELECT r.id, r.share_token, r.title, r.amount, r.note, r.payment_day,
                                   r.landlord_name, r.landlord_phone, r.tenant_name, r.tenant_phone,
                                   r.landlord_user_id, r.tenant_user_id, r.tenant_decision, r.status,
                                   r.current_month_status_landlord, r.current_month_status_tenant,
                                   r.last_payment_month, r.pending_amount, r.created_at, r.updated_at,
                                   lu.avatar_url, tu.avatar_url
                            FROM upd r
                            LEFT JOIN {SCHEMA}.users lu ON lu.id = r.landlord_user_id
                            LEFT JOIN {SCHEMA}.users tu ON tu.id = r.tenant_user_id""",
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
                    send_push(conn, rental["landlord_user_id"], notif_title, notif_body, "/?section=rental")
                conn.commit()

        if "new_amount" in body and rental.get("tenant_user_id"):
            new_amt = float(body["new_amount"])
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(f"SELECT email FROM {SCHEMA}.users WHERE id = %s", (rental["tenant_user_id"],))
                    u = cur.fetchone()
                    if u and u[0]:
                        send_amount_change_email(u[0], rental["tenant_name"] or "Арендатор",
                                                 rental["landlord_name"], rental["title"],
                                                 rental["amount"], new_amt, token)
                    notif_title = f"💸 {rental['landlord_name']} изменил сумму аренды"
                    old_str = f"{int(rental['amount']):,}".replace(",", " ")
                    new_str = f"{int(new_amt):,}".replace(",", " ")
                    notif_body = f"«{rental['title']}» — {old_str} ₽ → {new_str} ₽"
                    cur.execute(
                        f"INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data) VALUES (%s, %s, %s, %s, %s)",
                        (rental["tenant_user_id"], "rental_amount_change", notif_title, notif_body,
                         json.dumps({"rental_token": token, "old_amount": float(rental["amount"]), "new_amount": new_amt}))
                    )
                    send_push(conn, rental["tenant_user_id"], notif_title, notif_body, "/?section=rental")
                conn.commit()

        # Push арендодателю при принятии/отклонении новой суммы
        if "accept_new_amount" in body and rental.get("landlord_user_id"):
            accepted = bool(body["accept_new_amount"])
            tenant_name = rental["tenant_name"] or "Арендатор"
            notif_title = f"{'✅' if accepted else '❌'} {tenant_name} {'принял' if accepted else 'отклонил'} новую сумму"
            notif_body = f"«{rental['title']}»"
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        f"INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data) VALUES (%s, %s, %s, %s, %s)",
                        (rental["landlord_user_id"], "rental_amount_decision", notif_title, notif_body,
                         json.dumps({"rental_token": token, "accepted": accepted}))
                    )
                    send_push(conn, rental["landlord_user_id"], notif_title, notif_body, "/?section=rental")
                conn.commit()

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