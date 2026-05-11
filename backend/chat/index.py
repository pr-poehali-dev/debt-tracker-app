"""
Чат между участниками долга или аренды. v2 — VAPID push
GET ?debt_id=UUID           — сообщения по долгу
GET ?rental_id=N            — сообщения по аренде
GET ?unread=1               — кол-во непрочитанных (все чаты пользователя)
POST /                      — отправить сообщение {debt_id|rental_id, text}
PUT /                       — пометить прочитанными {debt_id|rental_id}
POST ?action=subscribe      — подписаться на push {endpoint, p256dh, auth}
GET  ?action=vapid-key      — публичный VAPID ключ
"""
import json
import os
import psycopg2

SCHEMA = "t_p29977622_debt_tracker_app"

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

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
        return None, None
    bearer = token_str.replace("Bearer ", "").strip()
    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT s.user_id, u.full_name FROM {SCHEMA}.sessions s
                JOIN {SCHEMA}.users u ON u.id = s.user_id
                WHERE s.token = %s AND s.expires_at > NOW()""",
            (bearer,)
        )
        row = cur.fetchone()
    return (row[0], row[1]) if row else (None, None)

def send_push_notification(conn, recipient_user_id, title, body_text, url=None, tag=None):
    try:
        from pywebpush import webpush, WebPushException
        vapid_private = os.environ.get("VAPID_PRIVATE_KEY", "")
        vapid_public = os.environ.get("VAPID_PUBLIC_KEY", "")
        if not vapid_private or not vapid_public:
            return
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT endpoint, p256dh, auth_key FROM {SCHEMA}.push_subscriptions WHERE user_id = %s",
                (recipient_user_id,)
            )
            subs = cur.fetchall()
        payload = {"title": title, "body": body_text}
        if url:
            payload["url"] = url
        if tag:
            payload["tag"] = tag
        for endpoint, p256dh, auth_key in subs:
            try:
                webpush(
                    subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth_key}},
                    data=json.dumps(payload),
                    vapid_private_key=vapid_private,
                    vapid_claims={"sub": "mailto:noreply@debt-debt.ru"}
                )
            except WebPushException:
                pass
    except Exception:
        pass

def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors(), "body": ""}

    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    headers = event.get("headers") or {}
    auth = headers.get("X-Authorization") or headers.get("Authorization") or ""

    # GET ?action=vapid-key — публичный ключ для фронтенда
    if method == "GET" and qs.get("action") == "vapid-key":
        return json_resp({"public_key": os.environ.get("VAPID_PUBLIC_KEY", "")})

    # GET ?unread=1 — все чаты пользователя с последним сообщением и счётчиком непрочитанных
    if method == "GET" and qs.get("unread") == "1":
        with get_conn() as conn:
            user_id, _ = get_user_from_token(auth, conn)
            if not user_id:
                return err("Не авторизован", 401)
            with conn.cursor() as cur:
                # Все чаты, в которых есть хотя бы одно сообщение и пользователь является участником
                cur.execute(
                    f"""WITH my_messages AS (
                          SELECT m.*
                          FROM {SCHEMA}.messages m
                          WHERE
                            (m.debt_id IS NOT NULL AND EXISTS (
                              SELECT 1 FROM {SCHEMA}.debts dd
                              WHERE dd.id = m.debt_id AND (dd.lender_user_id = %s OR dd.borrower_user_id = %s)
                            ))
                            OR
                            (m.rental_id IS NOT NULL AND EXISTS (
                              SELECT 1 FROM {SCHEMA}.rentals rr
                              WHERE rr.id = m.rental_id AND (rr.landlord_user_id = %s OR rr.tenant_user_id = %s)
                            ))
                        ),
                        ranked AS (
                          SELECT
                            mm.*,
                            ROW_NUMBER() OVER (PARTITION BY COALESCE(mm.debt_id::text, mm.rental_id::text) ORDER BY mm.created_at DESC) AS rn
                          FROM my_messages mm
                        ),
                        unread_counts AS (
                          SELECT
                            COALESCE(mm.debt_id::text, mm.rental_id::text) AS key,
                            COUNT(*) FILTER (WHERE mm.is_read = false AND mm.sender_user_id != %s) AS unread
                          FROM my_messages mm
                          GROUP BY 1
                        )
                        SELECT
                          r.debt_id, r.rental_id, r.sender_name, r.text, r.created_at,
                          COALESCE(d.title, rt.title) AS chat_title,
                          COALESCE(uc.unread, 0) AS unread,
                          r.sender_user_id
                        FROM ranked r
                        LEFT JOIN {SCHEMA}.debts d ON d.id = r.debt_id
                        LEFT JOIN {SCHEMA}.rentals rt ON rt.id = r.rental_id
                        LEFT JOIN unread_counts uc ON uc.key = COALESCE(r.debt_id::text, r.rental_id::text)
                        WHERE r.rn = 1
                        ORDER BY r.created_at DESC
                        LIMIT 100""",
                    (user_id, user_id, user_id, user_id, user_id)
                )
                rows = cur.fetchall()

            chats = []
            total_unread = 0
            for debt_id, rental_id, sender_name, text, created_at, chat_title, unread, sender_user_id in rows:
                total_unread += int(unread or 0)
                chats.append({
                    "debt_id": str(debt_id) if debt_id else None,
                    "rental_id": rental_id,
                    "chat_title": chat_title,
                    "sender_name": sender_name,
                    "last_text": text,
                    "created_at": str(created_at),
                    "unread": int(unread or 0),
                    "is_mine": sender_user_id == user_id,
                })

        return json_resp({
            "unread": total_unread,
            "chats": chats
        })

    # GET ?debt_id=UUID или ?rental_id=N — получить сообщения
    if method == "GET" and (qs.get("debt_id") or qs.get("rental_id")):
        debt_id = qs.get("debt_id")
        rental_id = qs.get("rental_id")

        with get_conn() as conn:
            user_id, _ = get_user_from_token(auth, conn)
            if not user_id:
                return err("Не авторизован", 401)

            with conn.cursor() as cur:
                if debt_id:
                    cur.execute(
                        f"""SELECT id FROM {SCHEMA}.debts
                            WHERE id = %s AND (lender_user_id = %s OR borrower_user_id = %s)""",
                        (debt_id, user_id, user_id)
                    )
                    if not cur.fetchone():
                        return err("Нет доступа к чату", 403)
                    cur.execute(
                        f"""SELECT id, sender_user_id, sender_name, text, created_at, is_read
                            FROM {SCHEMA}.messages
                            WHERE debt_id = %s
                            ORDER BY created_at ASC LIMIT 200""",
                        (debt_id,)
                    )
                else:
                    cur.execute(
                        f"""SELECT id FROM {SCHEMA}.rentals
                            WHERE id = %s AND (landlord_user_id = %s OR tenant_user_id = %s)""",
                        (rental_id, user_id, user_id)
                    )
                    if not cur.fetchone():
                        return err("Нет доступа к чату", 403)
                    cur.execute(
                        f"""SELECT id, sender_user_id, sender_name, text, created_at, is_read
                            FROM {SCHEMA}.messages
                            WHERE rental_id = %s
                            ORDER BY created_at ASC LIMIT 200""",
                        (int(rental_id),)
                    )
                rows = cur.fetchall()

                # Отмечаем прочитанными чужие сообщения
                if debt_id:
                    cur.execute(
                        f"""UPDATE {SCHEMA}.messages SET is_read = true
                            WHERE debt_id = %s AND sender_user_id != %s AND is_read = false""",
                        (debt_id, user_id)
                    )
                else:
                    cur.execute(
                        f"""UPDATE {SCHEMA}.messages SET is_read = true
                            WHERE rental_id = %s AND sender_user_id != %s AND is_read = false""",
                        (int(rental_id), user_id)
                    )
            conn.commit()

        messages = [
            {
                "id": r[0],
                "sender_user_id": r[1],
                "sender_name": r[2],
                "text": r[3],
                "created_at": str(r[4]),
                "is_read": r[5],
                "is_mine": r[1] == user_id,
            }
            for r in rows
        ]
        return json_resp({"messages": messages, "user_id": user_id})

    # POST / — отправить сообщение
    if method == "POST" and not qs.get("action"):
        body = json.loads(event.get("body") or "{}")
        debt_id = body.get("debt_id")
        rental_id = body.get("rental_id")
        text = (body.get("text") or "").strip()

        if not (debt_id or rental_id) or not text:
            return err("debt_id или rental_id и text обязательны")
        if len(text) > 1000:
            return err("Сообщение слишком длинное")

        with get_conn() as conn:
            user_id, user_name = get_user_from_token(auth, conn)
            if not user_id:
                return err("Не авторизован", 401)

            with conn.cursor() as cur:
                if debt_id:
                    cur.execute(
                        f"""SELECT lender_user_id, borrower_user_id, title FROM {SCHEMA}.debts
                            WHERE id = %s AND (lender_user_id = %s OR borrower_user_id = %s)""",
                        (debt_id, user_id, user_id)
                    )
                    debt_row = cur.fetchone()
                    if not debt_row:
                        return err("Нет доступа к чату", 403)
                    recipient_id = debt_row[1] if debt_row[0] == user_id else debt_row[0]
                    chat_title = debt_row[2]
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.messages (debt_id, sender_user_id, sender_name, text)
                            VALUES (%s, %s, %s, %s)
                            RETURNING id, sender_user_id, sender_name, text, created_at""",
                        (debt_id, user_id, user_name, text)
                    )
                else:
                    cur.execute(
                        f"""SELECT landlord_user_id, tenant_user_id, title FROM {SCHEMA}.rentals
                            WHERE id = %s AND (landlord_user_id = %s OR tenant_user_id = %s)""",
                        (int(rental_id), user_id, user_id)
                    )
                    rental_row = cur.fetchone()
                    if not rental_row:
                        return err("Нет доступа к чату", 403)
                    recipient_id = rental_row[1] if rental_row[0] == user_id else rental_row[0]
                    chat_title = rental_row[2]
                    cur.execute(
                        f"""INSERT INTO {SCHEMA}.messages (rental_id, sender_user_id, sender_name, text)
                            VALUES (%s, %s, %s, %s)
                            RETURNING id, sender_user_id, sender_name, text, created_at""",
                        (int(rental_id), user_id, user_name, text)
                    )
                r = cur.fetchone()
            conn.commit()

            # Push-уведомление получателю
            if recipient_id:
                if debt_id:
                    chat_url = f"/?openChat=debt&id={debt_id}"
                    chat_tag = f"chat-debt-{debt_id}"
                else:
                    chat_url = f"/?openChat=rental&id={rental_id}"
                    chat_tag = f"chat-rental-{rental_id}"
                send_push_notification(
                    conn, recipient_id,
                    f"Сообщение от {user_name}", text[:80],
                    url=chat_url, tag=chat_tag,
                )

        return json_resp({
            "id": r[0],
            "sender_user_id": r[1],
            "sender_name": r[2],
            "text": r[3],
            "created_at": str(r[4]),
            "is_mine": True,
        }, 201)

    # PUT / — отметить прочитанными
    if method == "PUT":
        body = json.loads(event.get("body") or "{}")
        debt_id = body.get("debt_id")
        rental_id = body.get("rental_id")

        with get_conn() as conn:
            user_id, _ = get_user_from_token(auth, conn)
            if not user_id:
                return err("Не авторизован", 401)
            with conn.cursor() as cur:
                if debt_id:
                    cur.execute(
                        f"""UPDATE {SCHEMA}.messages SET is_read = true
                            WHERE debt_id = %s AND sender_user_id != %s AND is_read = false""",
                        (debt_id, user_id)
                    )
                elif rental_id:
                    cur.execute(
                        f"""UPDATE {SCHEMA}.messages SET is_read = true
                            WHERE rental_id = %s AND sender_user_id != %s AND is_read = false""",
                        (int(rental_id), user_id)
                    )
            conn.commit()
        return json_resp({"ok": True})

    # POST ?action=subscribe — сохранить push-подписку
    if method == "POST" and qs.get("action") == "subscribe":
        body = json.loads(event.get("body") or "{}")
        endpoint = body.get("endpoint", "")
        p256dh = body.get("p256dh", "")
        auth_key = body.get("auth", "")

        if not endpoint or not p256dh or not auth_key:
            return err("endpoint, p256dh и auth обязательны")

        with get_conn() as conn:
            user_id, _ = get_user_from_token(auth, conn)
            if not user_id:
                return err("Не авторизован", 401)
            with conn.cursor() as cur:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.push_subscriptions (user_id, endpoint, p256dh, auth_key)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth_key = EXCLUDED.auth_key""",
                    (user_id, endpoint, p256dh, auth_key)
                )
            conn.commit()
        return json_resp({"ok": True})

    # POST ?action=unsubscribe — удалить push-подписку
    if method == "POST" and qs.get("action") == "unsubscribe":
        body = json.loads(event.get("body") or "{}")
        endpoint = body.get("endpoint", "")
        with get_conn() as conn:
            user_id, _ = get_user_from_token(auth, conn)
            if not user_id:
                return err("Не авторизован", 401)
            with conn.cursor() as cur:
                if endpoint:
                    cur.execute(
                        f"DELETE FROM {SCHEMA}.push_subscriptions WHERE user_id = %s AND endpoint = %s",
                        (user_id, endpoint)
                    )
                else:
                    cur.execute(
                        f"DELETE FROM {SCHEMA}.push_subscriptions WHERE user_id = %s",
                        (user_id,)
                    )
            conn.commit()
        return json_resp({"ok": True})

    return err("Неизвестный маршрут", 404)