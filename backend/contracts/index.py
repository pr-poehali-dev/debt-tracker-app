"""
Договоры (займ/аренда). Хранение, генерация HTML, электронная подпись.

GET  /?debt_id=UUID         — получить договор по долгу
GET  /?id=N                 — получить договор по id
POST /                      — создать договор {contract_type, debt_id|rental_id, data}
PUT  /?id=N                 — обновить data договора (если status=draft)
POST /?action=sign&id=N     — подписать договор текущим пользователем
GET  /?action=html&id=N     — HTML-превью договора
"""
import json
import os
import psycopg2

SCHEMA = "t_p29977622_debt_tracker_app"

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def send_push(conn, user_id, title, body_text, url="/", topic=None):
    try:
        from pywebpush import webpush, WebPushException
        vapid_private = os.environ.get("VAPID_PRIVATE_KEY", "")
        if not vapid_private or not user_id:
            return
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, endpoint, p256dh, auth_key FROM {SCHEMA}.push_subscriptions WHERE user_id = %s",
                (int(user_id),)
            )
            subs = cur.fetchall()
        if not subs:
            return
        # Headers: high urgency + 24h TTL + topic для дедупа
        extra_headers = {"Urgency": "high", "TTL": "86400"}
        if topic:
            # FCM требует Base64URL без padding, ≤32 символов
            import re
            safe_topic = re.sub(r"[^A-Za-z0-9_-]", "", str(topic))[:32]
            if safe_topic:
                extra_headers["Topic"] = safe_topic
        dead_ids = []
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
            except WebPushException as e:
                status = getattr(getattr(e, "response", None), "status_code", None)
                if status in (403, 404, 410):
                    dead_ids.append(sub_id)
            except Exception as e:
                print(f"[push] error user={user_id} sub={sub_id}: {e}")
        if dead_ids:
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        f"DELETE FROM {SCHEMA}.push_subscriptions WHERE id = ANY(%s)",
                        (dead_ids,)
                    )
                conn.commit()
            except Exception:
                pass
    except Exception as e:
        print(f"[push] fatal: {e}")

def save_notification(conn, user_id, ntype, title, body, data=None):
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data, is_read)
                    VALUES (%s, %s, %s, %s, %s::jsonb, false)""",
                (user_id, ntype, title, body, json.dumps(data or {}, ensure_ascii=False))
            )
        conn.commit()
    except Exception as e:
        print(f"[notif] failed: {e}")

def cors():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Authorization",
        "Content-Type": "application/json",
    }

def json_resp(data, status=200):
    return {"statusCode": status, "headers": cors(), "body": json.dumps(data, ensure_ascii=False, default=str)}

def err(msg, status=400):
    return json_resp({"error": msg}, status)

def get_user_from_token(token_str, conn):
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

def get_user_profile(conn, user_id):
    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT id, full_name, phone, email,
                       passport_series, passport_number, passport_issued_by,
                       passport_issued_date, passport_dept_code, birth_date,
                       registration_address
                FROM {SCHEMA}.users WHERE id = %s""",
            (user_id,)
        )
        r = cur.fetchone()
    if not r:
        return None
    return {
        "id": r[0], "full_name": r[1], "phone": r[2], "email": r[3],
        "passport_series": r[4] or "", "passport_number": r[5] or "",
        "passport_issued_by": r[6] or "", "passport_issued_date": str(r[7]) if r[7] else "",
        "passport_dept_code": r[8] or "", "birth_date": str(r[9]) if r[9] else "",
        "registration_address": r[10] or "",
    }

def contract_to_dict(row):
    return {
        "id": row[0], "contract_type": row[1], "debt_id": str(row[2]) if row[2] else None,
        "rental_id": row[3], "created_by_user_id": row[4],
        "party_a_user_id": row[5], "party_b_user_id": row[6],
        "data": row[7], "status": row[8],
        "signed_by_a_at": str(row[9]) if row[9] else None,
        "signed_by_b_at": str(row[10]) if row[10] else None,
        "pdf_url": row[11], "created_at": str(row[12]),
    }

def fetch_contract(conn, contract_id):
    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT id, contract_type, debt_id, rental_id, created_by_user_id,
                       party_a_user_id, party_b_user_id, data, status,
                       signed_by_a_at, signed_by_b_at, pdf_url, created_at
                FROM {SCHEMA}.contracts WHERE id = %s""",
            (contract_id,)
        )
        r = cur.fetchone()
    return contract_to_dict(r) if r else None

def fetch_contract_by_debt(conn, debt_id):
    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT id, contract_type, debt_id, rental_id, created_by_user_id,
                       party_a_user_id, party_b_user_id, data, status,
                       signed_by_a_at, signed_by_b_at, pdf_url, created_at
                FROM {SCHEMA}.contracts WHERE debt_id = %s ORDER BY id DESC LIMIT 1""",
            (debt_id,)
        )
        r = cur.fetchone()
    return contract_to_dict(r) if r else None

def render_loan_html(contract, party_a, party_b):
    d = contract.get("data", {}) or {}
    amount = d.get("amount", 0)
    amount_text = d.get("amount_text", "")
    interest_rate = d.get("interest_rate", 0)
    due_date = d.get("due_date", "")
    contract_date = d.get("contract_date", "")
    city = d.get("city", "")

    def passport_line(p):
        if not p:
            return "_______________________"
        pieces = []
        if p.get("passport_series") or p.get("passport_number"):
            pieces.append(f"паспорт {p.get('passport_series','')} {p.get('passport_number','')}")
        if p.get("passport_issued_by"):
            pieces.append(f"выдан {p.get('passport_issued_by')}")
        if p.get("passport_issued_date"):
            pieces.append(f"{p.get('passport_issued_date')}")
        if p.get("passport_dept_code"):
            pieces.append(f"код подразделения {p.get('passport_dept_code')}")
        return ", ".join(pieces) if pieces else "_______________________"

    a_name = party_a.get("full_name", "") if party_a else d.get("lender_name", "")
    b_name = party_b.get("full_name", "") if party_b else d.get("borrower_name", "")
    a_passport = passport_line(party_a)
    b_passport = passport_line(party_b)
    a_addr = (party_a or {}).get("registration_address", "") or "_______________________"
    b_addr = (party_b or {}).get("registration_address", "") or "_______________________"
    a_phone = (party_a or {}).get("phone", "")
    b_phone = (party_b or {}).get("phone", "")

    signed_a = contract.get("signed_by_a_at") or ""
    signed_b = contract.get("signed_by_b_at") or ""

    return f"""<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Договор займа №{contract['id']}</title>
<style>
  body {{ font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; max-width: 760px; margin: 30px auto; padding: 0 30px; color: #000; }}
  h1 {{ text-align: center; font-size: 16pt; margin-bottom: 4px; }}
  .meta {{ display: flex; justify-content: space-between; margin: 20px 0; font-size: 11pt; }}
  p {{ margin: 8px 0; text-align: justify; }}
  .num {{ font-weight: bold; }}
  .signatures {{ display: flex; justify-content: space-between; gap: 40px; margin-top: 40px; }}
  .sig {{ flex: 1; border-top: 1px solid #000; padding-top: 6px; font-size: 10pt; }}
  .sig .who {{ font-weight: bold; margin-bottom: 4px; }}
  .stamp {{ color: #0a7; font-weight: bold; font-size: 10pt; margin-top: 8px; }}
  .stamp.no {{ color: #c00; }}
  ol {{ padding-left: 20px; }}
  li {{ margin: 6px 0; text-align: justify; }}
  .footer {{ margin-top: 40px; font-size: 9pt; color: #666; text-align: center; }}
</style></head><body>
<h1>ДОГОВОР ЗАЙМА № {contract['id']}</h1>
<div class="meta">
  <span>г. {city or '_______'}</span>
  <span>«{contract_date or '__'}»</span>
</div>

<p>Гражданин РФ <b>{a_name}</b>, {a_passport}, зарегистрирован по адресу: {a_addr},
тел.: {a_phone}, именуемый в дальнейшем <b>«Займодавец»</b>, с одной стороны,</p>

<p>и гражданин РФ <b>{b_name}</b>, {b_passport}, зарегистрирован по адресу: {b_addr},
тел.: {b_phone}, именуемый в дальнейшем <b>«Заёмщик»</b>, с другой стороны,</p>

<p>совместно именуемые «Стороны», заключили настоящий Договор о нижеследующем:</p>

<ol>
  <li><b>Предмет договора.</b> Займодавец передаёт в собственность Заёмщику денежные средства в размере
  <span class="num">{amount} ₽</span> ({amount_text or 'сумма прописью'}), а Заёмщик обязуется возвратить указанную сумму займа в установленный срок.</li>

  <li><b>Срок займа.</b> Заёмщик обязуется вернуть сумму займа в полном объёме не позднее <b>{due_date or '__________'}</b>.</li>

  <li><b>Проценты.</b> {"За пользование займом Заёмщик уплачивает проценты в размере <b>" + str(interest_rate) + "%</b> годовых." if interest_rate else "Заём предоставляется на беспроцентной основе."}</li>

  <li><b>Передача средств.</b> Факт передачи денежных средств подтверждается настоящим Договором и/или распиской.
  Договор считается заключённым с момента передачи денежных средств Заёмщику.</li>

  <li><b>Возврат займа.</b> Возврат суммы займа производится наличными денежными средствами или безналичным переводом
  по реквизитам, указанным Займодавцем. Сумма займа считается возвращённой в момент её фактического получения Займодавцем.</li>

  <li><b>Ответственность сторон.</b> В случае невозврата суммы займа в установленный срок Заёмщик уплачивает
  Займодавцу пени в размере 0,1% от невозвращённой суммы за каждый день просрочки.</li>

  <li><b>Разрешение споров.</b> Все споры, возникающие из настоящего Договора, разрешаются в соответствии
  с действующим законодательством Российской Федерации.</li>

  <li><b>Заключительные положения.</b> Договор составлен в двух экземплярах, имеющих равную юридическую силу,
  по одному для каждой из Сторон. Электронные копии, подписанные обеими Сторонами в сервисе Debt-Debt.ru,
  имеют силу оригинала.</li>
</ol>

<div class="signatures">
  <div class="sig">
    <div class="who">ЗАЙМОДАВЕЦ</div>
    {a_name}<br>
    {a_passport}
    <div class="stamp {'' if signed_a else 'no'}">{('✓ Подписано электронно ' + signed_a) if signed_a else '○ Подпись ожидается'}</div>
  </div>
  <div class="sig">
    <div class="who">ЗАЁМЩИК</div>
    {b_name}<br>
    {b_passport}
    <div class="stamp {'' if signed_b else 'no'}">{('✓ Подписано электронно ' + signed_b) if signed_b else '○ Подпись ожидается'}</div>
  </div>
</div>

<div class="footer">
  Сгенерировано сервисом Debt-Debt.ru · Договор № {contract['id']} · Статус: {contract.get('status','draft')}
</div>
</body></html>"""

def handler(event: dict, context) -> dict:
    """Создание, чтение и подписание договоров для долгов и аренды"""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors(), "body": ""}

    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    headers = event.get("headers") or {}
    auth = headers.get("X-Authorization") or headers.get("Authorization") or ""
    source_ip = (event.get("requestContext") or {}).get("identity", {}).get("sourceIp", "")

    # GET ?action=html&id=N — HTML-превью (публично, не требует токена для удобства печати,
    # но айди договора не угадать)
    if method == "GET" and qs.get("action") == "html" and qs.get("id"):
        with get_conn() as conn:
            c = fetch_contract(conn, int(qs["id"]))
            if not c:
                return {"statusCode": 404, "headers": {**cors(), "Content-Type": "text/html; charset=utf-8"}, "body": "<h1>Договор не найден</h1>"}
            a = get_user_profile(conn, c["party_a_user_id"])
            b = get_user_profile(conn, c["party_b_user_id"]) if c["party_b_user_id"] else None
        html = render_loan_html(c, a, b)
        return {"statusCode": 200, "headers": {**cors(), "Content-Type": "text/html; charset=utf-8"}, "body": html}

    with get_conn() as conn:
        user_id = get_user_from_token(auth, conn)
        if not user_id:
            return err("Не авторизован", 401)

        # GET ?debt_id=UUID — договор по долгу
        if method == "GET" and qs.get("debt_id"):
            c = fetch_contract_by_debt(conn, qs["debt_id"])
            if not c:
                return json_resp({"contract": None})
            if user_id not in (c["party_a_user_id"], c["party_b_user_id"], c["created_by_user_id"]):
                return err("Нет доступа", 403)
            return json_resp({"contract": c})

        # GET ?id=N
        if method == "GET" and qs.get("id"):
            c = fetch_contract(conn, int(qs["id"]))
            if not c:
                return err("Не найдено", 404)
            if user_id not in (c["party_a_user_id"], c["party_b_user_id"], c["created_by_user_id"]):
                return err("Нет доступа", 403)
            return json_resp({"contract": c})

        # POST / — создать договор
        if method == "POST" and not qs.get("action"):
            body = json.loads(event.get("body") or "{}")
            ctype = body.get("contract_type") or "loan"
            debt_id = body.get("debt_id")
            rental_id = body.get("rental_id")
            data = body.get("data") or {}
            party_b_user_id = body.get("party_b_user_id")

            if not debt_id and not rental_id:
                return err("Нужен debt_id или rental_id")

            # Определяем стороны из связанной сущности, если можно
            party_a = user_id
            party_b = party_b_user_id
            if debt_id:
                with conn.cursor() as cur:
                    cur.execute(
                        f"SELECT lender_user_id, borrower_user_id FROM {SCHEMA}.debts WHERE id = %s",
                        (debt_id,)
                    )
                    row = cur.fetchone()
                if not row:
                    return err("Долг не найден", 404)
                if user_id not in (row[0], row[1]):
                    return err("Нет доступа к долгу", 403)
                party_a = row[0] or user_id
                party_b = row[1] or party_b_user_id

            with conn.cursor() as cur:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.contracts
                        (contract_type, debt_id, rental_id, created_by_user_id,
                         party_a_user_id, party_b_user_id, data, status)
                        VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, 'draft')
                        RETURNING id""",
                    (ctype, debt_id, rental_id, user_id, party_a, party_b,
                     json.dumps(data, ensure_ascii=False))
                )
                cid = cur.fetchone()[0]
            conn.commit()

            # Уведомим вторую сторону, что для неё подготовлен договор
            other_id = None
            if user_id == party_a and party_b:
                other_id = party_b
            elif user_id == party_b and party_a:
                other_id = party_a
            if other_id:
                with conn.cursor() as cur:
                    cur.execute(f"SELECT full_name FROM {SCHEMA}.users WHERE id = %s", (user_id,))
                    nm = cur.fetchone()
                creator_name = (nm[0] if nm else "Партнёр")
                title = "Подготовлен договор займа"
                body = f"{creator_name} оформил договор и ждёт твою подпись"
                deep_url = f"/?openDebt={debt_id}&contract=1" if debt_id else "/"
                save_notification(conn, other_id, "contract_created", title, body,
                                  {"contract_id": cid, "debt_id": str(debt_id) if debt_id else None,
                                   "rental_id": rental_id, "deep_url": deep_url})
                send_push(conn, other_id, title, body, url=deep_url)

            return json_resp({"id": cid, "ok": True}, 201)

        # PUT ?id=N — обновить data (только в draft)
        if method == "PUT" and qs.get("id"):
            body = json.loads(event.get("body") or "{}")
            data = body.get("data") or {}
            cid = int(qs["id"])
            c = fetch_contract(conn, cid)
            if not c:
                return err("Не найдено", 404)
            if user_id != c["created_by_user_id"]:
                return err("Может изменить только создатель", 403)
            if c["status"] != "draft":
                return err("Договор уже подписан, изменения невозможны", 409)
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {SCHEMA}.contracts SET data = %s::jsonb, updated_at = NOW() WHERE id = %s",
                    (json.dumps(data, ensure_ascii=False), cid)
                )
            conn.commit()
            return json_resp({"ok": True})

        # POST ?action=sign&id=N — подписать
        if method == "POST" and qs.get("action") == "sign" and qs.get("id"):
            cid = int(qs["id"])
            c = fetch_contract(conn, cid)
            if not c:
                return err("Не найдено", 404)

            is_a = user_id == c["party_a_user_id"]
            is_b = user_id == c["party_b_user_id"]
            if not (is_a or is_b):
                return err("Только стороны договора могут подписать", 403)

            was_a_signed = bool(c["signed_by_a_at"])
            was_b_signed = bool(c["signed_by_b_at"])

            with conn.cursor() as cur:
                if is_a and not was_a_signed:
                    cur.execute(
                        f"""UPDATE {SCHEMA}.contracts
                            SET signed_by_a_at = NOW(), signed_by_a_ip = %s, updated_at = NOW()
                            WHERE id = %s""",
                        (source_ip, cid)
                    )
                if is_b and not was_b_signed:
                    cur.execute(
                        f"""UPDATE {SCHEMA}.contracts
                            SET signed_by_b_at = NOW(), signed_by_b_ip = %s, updated_at = NOW()
                            WHERE id = %s""",
                        (source_ip, cid)
                    )
                # Если обе подписи есть — переводим в active
                cur.execute(
                    f"""UPDATE {SCHEMA}.contracts SET status = 'active'
                        WHERE id = %s AND signed_by_a_at IS NOT NULL AND signed_by_b_at IS NOT NULL""",
                    (cid,)
                )
            conn.commit()

            updated = fetch_contract(conn, cid)
            # Имя подписавшего
            with conn.cursor() as cur:
                cur.execute(f"SELECT full_name FROM {SCHEMA}.users WHERE id = %s", (user_id,))
                nm = cur.fetchone()
            signer_name = (nm[0] if nm else "Партнёр")

            other_id = c["party_b_user_id"] if is_a else c["party_a_user_id"]
            fully_signed = bool(updated and updated.get("signed_by_a_at") and updated.get("signed_by_b_at"))

            deep_url = f"/?openDebt={c['debt_id']}&contract=1" if c["debt_id"] else "/"

            if other_id:
                if fully_signed:
                    title = "Договор подписан полностью"
                    body = f"{signer_name} подписал договор. Документ вступил в силу"
                    ntype = "contract_active"
                else:
                    title = f"{signer_name} подписал договор"
                    body = "Твоя подпись ожидается"
                    ntype = "contract_signed"
                save_notification(conn, other_id, ntype, title, body,
                                  {"contract_id": cid,
                                   "debt_id": str(c["debt_id"]) if c["debt_id"] else None,
                                   "rental_id": c["rental_id"],
                                   "deep_url": deep_url})
                send_push(conn, other_id, title, body, url=deep_url)

            # Если обе стороны подписали — продублируем уведомление подписавшему
            if fully_signed:
                save_notification(conn, user_id, "contract_active",
                                  "Договор подписан полностью",
                                  "Документ вступил в силу",
                                  {"contract_id": cid,
                                   "debt_id": str(c["debt_id"]) if c["debt_id"] else None,
                                   "rental_id": c["rental_id"],
                                   "deep_url": deep_url})

            return json_resp({"ok": True, "contract": updated})

    return err("Неизвестный маршрут", 404)