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
import string
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
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

def send_email(to_email: str, code: str, full_name: str = None):
    api_key = os.environ["RESEND_API_KEY"]
    greeting = f"Привет, {full_name}!" if full_name else "Добро пожаловать!"
    body_html = f"""
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
        # Читаем тело ответа Resend для понятного сообщения
        body = ""
        try:
            body = e.read().decode("utf-8", errors="ignore")
        except Exception:
            pass
        raise RuntimeError(f"Resend HTTP {e.code}: {body[:300]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Сеть недоступна: {e}")

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