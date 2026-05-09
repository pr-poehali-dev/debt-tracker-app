"""
Авторизация. Флоу:
- Регистрация: POST send-code → POST verify (с pin_code + pin_confirm) → аккаунт создан
- Вход: POST check-email → если есть pin → POST login-pin (email + pin), иначе send-code → verify
- GET me — получить текущего пользователя
"""
import json
import os
import random
import secrets
import smtplib
import ssl
import string
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import psycopg2

SCHEMA = "t_p29977622_debt_tracker_app"

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Authorization",
    "Content-Type": "application/json",
}

def resp(data, status=200):
    return {"statusCode": status, "headers": CORS, "body": json.dumps(data, ensure_ascii=False)}

def err(msg, status=400):
    return resp({"error": msg}, status)

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def _build_email_html(code: str, full_name: str = None) -> str:
    greeting = f"Привет, {full_name}!" if full_name else "Добро пожаловать!"
    return f"""
    <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px">
      <h2 style="color:#a855f7;margin-bottom:8px">Debt-Debt</h2>
      <p style="color:#555">{greeting}</p>
      <p style="color:#555">Ваш код подтверждения для регистрации:</p>
      <div style="background:#f5f0ff;border-radius:12px;padding:20px;text-align:center;margin:20px 0">
        <span style="font-size:36px;font-weight:900;letter-spacing:12px;color:#a855f7">{code}</span>
      </div>
      <p style="color:#999;font-size:13px">Код действителен 10 минут. Не передавайте его никому.</p>
    </div>
    """

def send_email_resend(to_email: str, code: str, full_name: str = None):
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        raise RuntimeError("RESEND_API_KEY не задан")
    body_html = _build_email_html(code, full_name)
    payload = json.dumps({
        "from": "Debt-Debt <noreply@debt-debt.ru>",
        "to": [to_email],
        "subject": "Код подтверждения — Debt-Debt",
        "html": body_html,
    }).encode()
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="ignore")
        except Exception:
            pass
        raise RuntimeError(f"Resend HTTP {e.code}: {body[:300]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Сеть недоступна: {e}")

def send_email_smtp(to_email: str, code: str, full_name: str = None):
    host = os.environ.get("SMTP_HOST")
    port = int(os.environ.get("SMTP_PORT") or "465")
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASSWORD")
    if not (host and user and password):
        raise RuntimeError("SMTP не настроен")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Код подтверждения — Debt-Debt"
    msg["From"] = f"Debt-Debt <{user}>"
    msg["To"] = to_email
    msg.attach(MIMEText(_build_email_html(code, full_name), "html", "utf-8"))

    context = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=15, context=context) as server:
            server.login(user, password)
            server.sendmail(user, [to_email], msg.as_string())
    else:
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            server.login(user, password)
            server.sendmail(user, [to_email], msg.as_string())
    return 200

def send_email(to_email: str, code: str, full_name: str = None):
    """Пытается отправить через Resend. Если не удалось — пробует SMTP-fallback."""
    errors = []
    try:
        return send_email_resend(to_email, code, full_name)
    except Exception as e:
        errors.append(f"Resend: {e}")

    # Fallback на SMTP
    try:
        return send_email_smtp(to_email, code, full_name)
    except Exception as e:
        errors.append(f"SMTP: {e}")
        raise RuntimeError(" | ".join(errors))

def _build_farewell_html(full_name: str = None) -> str:
    greeting = f"Прощайте, {full_name}!" if full_name else "Прощайте!"
    return f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#a855f7;margin-bottom:8px">Debt-Debt</h2>
      <p style="color:#555;font-size:16px;margin-bottom:16px">{greeting}</p>
      <p style="color:#555;line-height:1.6">
        Ваш аккаунт в Debt-Debt был полностью удалён по вашему запросу.
      </p>
      <div style="background:#f5f0ff;border-radius:12px;padding:16px 20px;margin:20px 0;border-left:4px solid #a855f7">
        <p style="color:#555;margin:0 0 8px 0;font-weight:600">Что было удалено:</p>
        <ul style="color:#666;margin:0;padding-left:20px;line-height:1.6">
          <li>Профиль, телефон и PIN-код</li>
          <li>Все долги и займы</li>
          <li>Аренды и платежи</li>
          <li>Чаты и уведомления</li>
          <li>История платежей и подписки</li>
        </ul>
      </div>
      <p style="color:#555;line-height:1.6">
        Если вы передумали, вы всегда можете <strong>зарегистрироваться заново</strong> с этим же email — мы будем рады видеть вас снова.
      </p>
      <p style="color:#555;line-height:1.6">
        <a href="https://debt-debt.ru" style="color:#a855f7;text-decoration:none;font-weight:600">→ Открыть Debt-Debt</a>
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
      <p style="color:#999;font-size:12px;line-height:1.5">
        Если удаление произошло без вашего ведома — срочно напишите в поддержку: support@debt-debt.ru.
        Восстановление возможно в течение 30 дней.
      </p>
      <p style="color:#bbb;font-size:11px;margin-top:16px">
        Это автоматическое письмо, отвечать на него не нужно.
      </p>
    </div>
    """

def send_farewell_resend(to_email: str, full_name: str = None):
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        raise RuntimeError("RESEND_API_KEY не задан")
    payload = json.dumps({
        "from": "Debt-Debt <noreply@debt-debt.ru>",
        "to": [to_email],
        "subject": "Ваш аккаунт удалён — Debt-Debt",
        "html": _build_farewell_html(full_name),
    }).encode()
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status

def send_farewell_smtp(to_email: str, full_name: str = None):
    host = os.environ.get("SMTP_HOST")
    port = int(os.environ.get("SMTP_PORT") or "465")
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASSWORD")
    if not (host and user and password):
        raise RuntimeError("SMTP не настроен")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Ваш аккаунт удалён — Debt-Debt"
    msg["From"] = f"Debt-Debt <{user}>"
    msg["To"] = to_email
    msg.attach(MIMEText(_build_farewell_html(full_name), "html", "utf-8"))

    context = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=15, context=context) as server:
            server.login(user, password)
            server.sendmail(user, [to_email], msg.as_string())
    else:
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            server.login(user, password)
            server.sendmail(user, [to_email], msg.as_string())
    return 200

def send_farewell_email(to_email: str, full_name: str = None):
    """Прощальное письмо. Resend → SMTP fallback. Тихо проглатывает все ошибки."""
    try:
        return send_farewell_resend(to_email, full_name)
    except Exception:
        pass
    try:
        return send_farewell_smtp(to_email, full_name)
    except Exception:
        return None

def make_session(conn, user_id):
    token = secrets.token_hex(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    with conn.cursor() as cur:
        cur.execute(
            f"INSERT INTO {SCHEMA}.sessions (user_id, token, expires_at) VALUES (%s, %s, %s)",
            (user_id, token, expires_at),
        )
    return token

def handler(event: dict, context) -> dict:
    """Авторизация пользователей — регистрация через почту+PIN, вход через PIN"""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    action = qs.get("action", "")

    # ── GET me ───────────────────────────────────────────────────────────────
    if method == "GET" and action == "me":
        headers = event.get("headers") or {}
        auth = headers.get("X-Authorization") or headers.get("Authorization") or ""
        token = auth.replace("Bearer ", "").strip()
        if not token:
            return err("Не авторизован", 401)
        now = datetime.now(timezone.utc)
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT u.id, u.full_name, u.phone, u.email FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id = s.user_id WHERE s.token = %s AND s.expires_at > %s",
                    (token, now),
                )
                row = cur.fetchone()
        if not row:
            return err("Сессия истекла", 401)
        return resp({"id": row[0], "full_name": row[1], "phone": row[2], "email": row[3]})

    # ── POST check-email — проверить есть ли пользователь и есть ли у него PIN ──
    if method == "POST" and action == "check-email":
        body = json.loads(event.get("body") or "{}")
        email = (body.get("email") or "").strip().lower()
        if not email or "@" not in email:
            return err("Введите корректный email")
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(f"SELECT id, pin_code FROM {SCHEMA}.users WHERE email = %s", (email,))
                row = cur.fetchone()
        if not row:
            return resp({"exists": False})  # новый пользователь → регистрация
        has_pin = bool(row[1])
        return resp({"exists": True, "has_pin": has_pin})

    # ── POST check-code — проверить код из письма (без создания сессии) ──
    if method == "POST" and action == "check-code":
        body = json.loads(event.get("body") or "{}")
        email = (body.get("email") or "").strip().lower()
        code = (body.get("code") or "").strip()
        if not email or not code:
            return err("Email и код обязательны")
        now = datetime.now(timezone.utc)
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT id FROM {SCHEMA}.verification_codes WHERE email = %s AND code = %s AND used = FALSE AND expires_at > %s ORDER BY created_at DESC LIMIT 1",
                    (email, code, now),
                )
                row = cur.fetchone()
        if not row:
            return err("Неверный или истёкший код")
        return resp({"ok": True})

    # ── POST send-code — отправить код на почту (только для регистрации / сброса) ──
    if method == "POST" and action == "send-code":
        body = json.loads(event.get("body") or "{}")
        email = (body.get("email") or "").strip().lower()
        full_name = (body.get("full_name") or "").strip()
        if not email or "@" not in email:
            return err("Введите корректный email")
        code = "".join(random.choices(string.digits, k=4))
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

        # Сохраняем код в БД ВСЕГДА (даже если письмо не отправится — пользователь
        # сможет повторить попытку, и старый код тоже будет валидным)
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"INSERT INTO {SCHEMA}.verification_codes (email, code, expires_at) VALUES (%s, %s, %s)",
                    (email, code, expires_at),
                )
            conn.commit()

        # Пытаемся отправить письмо. Если не вышло — возвращаем понятную ошибку,
        # но код остался в БД на случай ретрая
        try:
            send_email(email, code, full_name if full_name else None)
        except Exception as e:
            msg = str(e)
            # Распознаём типовые ошибки Resend
            user_msg = "Не удалось отправить письмо. Попробуйте ещё раз или используйте другой email."
            if "validation_error" in msg or "verify a domain" in msg or "testing emails" in msg:
                user_msg = "Этот email не принимается почтовым сервисом. Попробуйте другой email или напишите в поддержку."
            elif "rate" in msg.lower() or "429" in msg:
                user_msg = "Слишком много попыток. Подождите минуту и попробуйте снова."
            elif "Resend HTTP 403" in msg:
                user_msg = "Сервис отправки писем временно недоступен. Попробуйте позже или напишите в поддержку."
            return err(user_msg, 502)

        return resp({"ok": True})

    # ── POST verify — проверить email-код и создать аккаунт с PIN ──
    if method == "POST" and action == "verify":
        body = json.loads(event.get("body") or "{}")
        email = (body.get("email") or "").strip().lower()
        code = (body.get("code") or "").strip()
        full_name = (body.get("full_name") or "").strip()
        phone = (body.get("phone") or "").strip()
        pin_code = (body.get("pin_code") or "").strip()

        if not email or not code:
            return err("Email и код обязательны")
        if len(pin_code) != 4 or not pin_code.isdigit():
            return err("PIN должен быть 4 цифры")

        now = datetime.now(timezone.utc)
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT id FROM {SCHEMA}.verification_codes WHERE email = %s AND code = %s AND used = FALSE AND expires_at > %s ORDER BY created_at DESC LIMIT 1",
                    (email, code, now),
                )
                row = cur.fetchone()
                if not row:
                    return err("Неверный или истёкший код")
                code_id = row[0]
                cur.execute(f"UPDATE {SCHEMA}.verification_codes SET used = TRUE WHERE id = %s", (code_id,))

                # Создать или обновить пользователя
                cur.execute(f"SELECT id, full_name, phone, email FROM {SCHEMA}.users WHERE email = %s", (email,))
                user_row = cur.fetchone()
                if user_row:
                    user_id = user_row[0]
                    cur.execute(f"UPDATE {SCHEMA}.users SET pin_code = %s WHERE id = %s", (pin_code, user_id))
                    db_name, db_phone, db_email = user_row[1], user_row[2], user_row[3]
                else:
                    if not full_name or not phone:
                        return err("ФИО и телефон обязательны для регистрации")
                    cur.execute(
                        f"INSERT INTO {SCHEMA}.users (full_name, phone, email, pin_code) VALUES (%s, %s, %s, %s) RETURNING id, full_name, phone, email",
                        (full_name, phone, email, pin_code),
                    )
                    user_id, db_name, db_phone, db_email = cur.fetchone()

                token = make_session(conn, user_id)
            conn.commit()

        return resp({"ok": True, "token": token, "user": {"id": user_id, "full_name": db_name, "phone": db_phone, "email": db_email}})

    # ── POST delete-account — полное удаление аккаунта пользователя ──
    if method == "POST" and action == "delete-account":
        headers = event.get("headers") or {}
        auth = headers.get("X-Authorization") or headers.get("Authorization") or ""
        token = auth.replace("Bearer ", "").strip()
        if not token:
            return err("Не авторизован", 401)
        body = json.loads(event.get("body") or "{}")
        pin = (body.get("pin") or "").strip()
        if len(pin) != 4 or not pin.isdigit():
            return err("Введите 4-значный PIN-код")

        now = datetime.now(timezone.utc)
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT u.id, u.email, u.pin_code, u.full_name FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id = s.user_id WHERE s.token = %s AND s.expires_at > %s",
                    (token, now),
                )
                row = cur.fetchone()
                if not row:
                    return err("Сессия истекла", 401)
                user_id, user_email, db_pin, user_name = row[0], row[1], row[2], row[3]
                if not db_pin or db_pin != pin:
                    return err("Неверный PIN-код")

                # Удаляем все связанные данные
                cur.execute(f"DELETE FROM {SCHEMA}.support_messages WHERE sender_user_id = %s", (user_id,))
                cur.execute(f"DELETE FROM {SCHEMA}.support_messages WHERE ticket_id IN (SELECT id FROM {SCHEMA}.support_tickets WHERE user_id = %s)", (user_id,))
                cur.execute(f"DELETE FROM {SCHEMA}.support_tickets WHERE user_id = %s", (user_id,))
                cur.execute(f"DELETE FROM {SCHEMA}.payment_requests WHERE from_user_id = %s OR to_user_id = %s", (user_id, user_id))
                cur.execute(f"DELETE FROM {SCHEMA}.push_subscriptions WHERE user_id = %s", (user_id,))
                cur.execute(f"DELETE FROM {SCHEMA}.notifications WHERE user_id = %s", (user_id,))
                cur.execute(f"DELETE FROM {SCHEMA}.messages WHERE sender_user_id = %s", (user_id,))
                cur.execute(f"DELETE FROM {SCHEMA}.rental_payments WHERE rental_id IN (SELECT id FROM {SCHEMA}.rentals WHERE landlord_user_id = %s OR tenant_user_id = %s)", (user_id, user_id))
                cur.execute(f"DELETE FROM {SCHEMA}.rentals WHERE landlord_user_id = %s OR tenant_user_id = %s", (user_id, user_id))
                cur.execute(f"DELETE FROM {SCHEMA}.debts WHERE lender_user_id = %s OR borrower_user_id = %s", (user_id, user_id))
                cur.execute(f"DELETE FROM {SCHEMA}.subscriptions WHERE user_id = %s", (user_id,))
                cur.execute(f"DELETE FROM {SCHEMA}.order_items WHERE order_id IN (SELECT id FROM {SCHEMA}.orders WHERE user_id = %s)", (user_id,))
                cur.execute(f"DELETE FROM {SCHEMA}.orders WHERE user_id = %s", (user_id,))
                cur.execute(f"DELETE FROM {SCHEMA}.sessions WHERE user_id = %s", (user_id,))
                if user_email:
                    cur.execute(f"DELETE FROM {SCHEMA}.verification_codes WHERE email = %s", (user_email,))
                cur.execute(f"DELETE FROM {SCHEMA}.users WHERE id = %s", (user_id,))
            conn.commit()

        # Прощальное письмо отправляем после успешного удаления.
        # Любые ошибки тихо игнорируем — аккаунт уже удалён, ответ должен быть успешным.
        if user_email:
            try:
                send_farewell_email(user_email, user_name)
            except Exception:
                pass

        return resp({"ok": True})

    # ── POST login-pin — вход по PIN без письма ──
    if method == "POST" and action == "login-pin":
        body = json.loads(event.get("body") or "{}")
        email = (body.get("email") or "").strip().lower()
        pin = (body.get("pin") or "").strip()
        if not email or not pin:
            return err("Email и PIN обязательны")
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(f"SELECT id, full_name, phone, email, pin_code FROM {SCHEMA}.users WHERE email = %s", (email,))
                row = cur.fetchone()
            if not row:
                return err("Пользователь не найден", 404)
            if row[4] != pin:
                return err("Неверный PIN-код")
            token = make_session(conn, row[0])
            conn.commit()
        return resp({"ok": True, "token": token, "user": {"id": row[0], "full_name": row[1], "phone": row[2], "email": row[3]}})

    return err("Неизвестный маршрут", 404)