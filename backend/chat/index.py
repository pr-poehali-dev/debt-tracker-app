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
import uuid
import base64
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
        if not vapid_private or not vapid_public or not recipient_user_id:
            print(f"[push] skip: no vapid keys or user_id (user={recipient_user_id})")
            return
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, endpoint, p256dh, auth_key FROM {SCHEMA}.push_subscriptions WHERE user_id = %s",
                (recipient_user_id,)
            )
            subs = cur.fetchall()
        if not subs:
            print(f"[push] no subscriptions for user_id={recipient_user_id}")
            return
        payload = {"title": title, "body": body_text}
        if url:
            payload["url"] = url
        if tag:
            payload["tag"] = tag
        sent, removed, failed = 0, 0, 0
        dead_ids = []
        for sub_id, endpoint, p256dh, auth_key in subs:
            try:
                webpush(
                    subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth_key}},
                    data=json.dumps(payload, ensure_ascii=False),
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
                    print(f"[push] WebPushException user={recipient_user_id} sub={sub_id} status={status}: {e}")
            except Exception as e:
                failed += 1
                print(f"[push] error user={recipient_user_id} sub={sub_id}: {e}")
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
        print(f"[push] user={recipient_user_id} sent={sent} removed={removed} failed={failed}")
    except Exception as e:
        print(f"[push] fatal: {e}")

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
                        f"""SELECT id, sender_user_id, sender_name, text, created_at, is_read,
                                   attachment_url, attachment_type, attachment_name, attachment_size
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
                        f"""SELECT id, sender_user_id, sender_name, text, created_at, is_read,
                                   attachment_url, attachment_type, attachment_name, attachment_size
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
                "text": r[3] or "",
                "created_at": str(r[4]),
                "is_read": r[5],
                "is_mine": r[1] == user_id,
                "attachment_url": r[6],
                "attachment_type": r[7],
                "attachment_name": r[8],
                "attachment_size": r[9],
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
        attachment_url = body.get("attachment_url") or None
        attachment_type = body.get("attachment_type") or None
        attachment_name = body.get("attachment_name") or None
        attachment_size = body.get("attachment_size") or None

        if not (debt_id or rental_id):
            return err("debt_id или rental_id обязательны")
        if not text and not attachment_url:
            return err("text или attachment_url обязательны")
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
                        f"""INSERT INTO {SCHEMA}.messages (debt_id, sender_user_id, sender_name, text,
                                                           attachment_url, attachment_type, attachment_name, attachment_size)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                            RETURNING id, sender_user_id, sender_name, text, created_at,
                                      attachment_url, attachment_type, attachment_name, attachment_size""",
                        (debt_id, user_id, user_name, text,
                         attachment_url, attachment_type, attachment_name, attachment_size)
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
                        f"""INSERT INTO {SCHEMA}.messages (rental_id, sender_user_id, sender_name, text,
                                                           attachment_url, attachment_type, attachment_name, attachment_size)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                            RETURNING id, sender_user_id, sender_name, text, created_at,
                                      attachment_url, attachment_type, attachment_name, attachment_size""",
                        (int(rental_id), user_id, user_name, text,
                         attachment_url, attachment_type, attachment_name, attachment_size)
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
                if text:
                    push_body = text[:80]
                elif attachment_type == "image":
                    push_body = "📷 Фото"
                else:
                    push_body = "📎 " + (attachment_name or "Файл")
                send_push_notification(
                    conn, recipient_id,
                    f"Сообщение от {user_name}", push_body,
                    url=chat_url, tag=chat_tag,
                )

        return json_resp({
            "id": r[0],
            "sender_user_id": r[1],
            "sender_name": r[2],
            "text": r[3] or "",
            "created_at": str(r[4]),
            "is_mine": True,
            "attachment_url": r[5],
            "attachment_type": r[6],
            "attachment_name": r[7],
            "attachment_size": r[8],
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

    # POST ?action=upload — загрузить фото/файл и получить URL
    if method == "POST" and qs.get("action") == "upload":
        body = json.loads(event.get("body") or "{}")
        file_b64 = body.get("file_base64") or ""
        file_name = (body.get("file_name") or "file").replace("/", "_").replace("\\", "_")[:200]
        content_type = body.get("content_type") or "application/octet-stream"
        is_image = content_type.startswith("image/")

        if not file_b64:
            return err("file_base64 обязателен")

        with get_conn() as conn:
            user_id, _ = get_user_from_token(auth, conn)
            if not user_id:
                return err("Не авторизован", 401)

        try:
            raw = base64.b64decode(file_b64)
        except Exception:
            return err("Неверная base64-кодировка")
        if len(raw) > 15 * 1024 * 1024:
            return err("Файл больше 15 МБ", 413)

        try:
            import boto3
            s3 = boto3.client(
                "s3",
                endpoint_url="https://bucket.poehali.dev",
                aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
                aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
            )
            ext = ""
            if "." in file_name:
                ext = "." + file_name.rsplit(".", 1)[-1].lower()[:8]
            key = f"chat/{user_id}/{uuid.uuid4().hex}{ext}"
            s3.put_object(
                Bucket="files",
                Key=key,
                Body=raw,
                ContentType=content_type,
            )
            cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"
            return json_resp({
                "url": cdn_url,
                "type": "image" if is_image else "file",
                "name": file_name,
                "size": len(raw),
            })
        except Exception as e:
            print(f"[upload] error: {e}")
            return err("Ошибка загрузки файла", 500)

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

    # POST ?action=test-push — отправить тестовое push-уведомление текущему пользователю
    if method == "POST" and qs.get("action") == "test-push":
        with get_conn() as conn:
            user_id, _ = get_user_from_token(auth, conn)
            if not user_id:
                return err("Не авторизован", 401)
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT COUNT(*) FROM {SCHEMA}.push_subscriptions WHERE user_id = %s",
                    (user_id,)
                )
                cnt = cur.fetchone()[0]
            if cnt == 0:
                return json_resp({"ok": False, "subs": 0, "error": "Нет активных подписок. Откройте приложение в браузере и включите уведомления."})
            send_push_notification(conn, user_id, "Проверка уведомлений", "Если ты видишь это сообщение — push работает!", url="/")
            return json_resp({"ok": True, "subs": cnt})

    return err("Неизвестный маршрут", 404)