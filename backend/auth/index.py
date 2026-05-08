"""
Единая функция авторизации. Роутинг через ?action=send-code|verify|me
POST ?action=send-code  — отправить код на email
POST /verify     — проверить код, войти / зарегистрироваться
GET  /me         — получить текущего пользователя по токену
"""
import json
import os
import random
import secrets
import string
import urllib.request
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
    greeting = f"Привет, {full_name}!" if full_name else "Добро пожаловать обратно!"
    body_html = f"""
    <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px">
      <h2 style="color:#a855f7;margin-bottom:8px">Debt-Debt</h2>
      <p style="color:#555">{greeting}</p>
      <p style="color:#555">Ваш код подтверждения:</p>
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
    with urllib.request.urlopen(req) as r:
        return r.status

def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method = event.get("httpMethod", "GET")
    path = (event.get("path") or "/").rstrip("/")
    qs = event.get("queryStringParameters") or {}

    print(f"[AUTH] method={method} path={path} qs={qs}")

    # Роутинг: по пути ИЛИ по query ?action=
    def get_action():
        for suffix in ["me", "send-code", "verify"]:
            if path.endswith(f"/{suffix}"):
                return suffix
        return qs.get("action", "")

    action = get_action()
    print(f"[AUTH] action={action}")

    # ── GET me ───────────────────────────────────────────────────────────────
    if method == "GET" and action == "me":
        headers = event.get("headers") or {}
        auth = headers.get("X-Authorization") or headers.get("Authorization") or ""
        token = auth.replace("Bearer ", "").strip()
        if not token:
            return err("Не авторизован", 401)
        now = datetime.now(timezone.utc)
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            f"SELECT u.id, u.full_name, u.phone, u.email FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id = s.user_id WHERE s.token = %s AND s.expires_at > %s",
            (token, now),
        )
        row = cur.fetchone()
        conn.close()
        if not row:
            return err("Сессия истекла", 401)
        return resp({"id": row[0], "full_name": row[1], "phone": row[2], "email": row[3]})

    # ── POST send-code ────────────────────────────────────────────────────────
    if method == "POST" and action == "send-code":
        body = json.loads(event.get("body") or "{}")
        email = (body.get("email") or "").strip().lower()
        full_name = (body.get("full_name") or "").strip()
        phone = (body.get("phone") or "").strip()
        if not email:
            return err("Email обязателен")

        code = "".join(random.choices(string.digits, k=4))
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

        conn = get_conn()
        cur = conn.cursor()

        cur.execute(f"SELECT id FROM {SCHEMA}.users WHERE email = %s", (email,))
        existing = cur.fetchone()

        if full_name and existing:
            conn.close()
            return err("Пользователь с таким email уже существует", 409)

        if not full_name and not existing:
            conn.close()
            return err("Пользователь не найден", 404)

        try:
            send_email(email, code, full_name if full_name else None)
        except Exception as e:
            conn.close()
            return err(f"Не удалось отправить письмо: {e}", 502)

        cur.execute(
            f"INSERT INTO {SCHEMA}.verification_codes (email, code, expires_at) VALUES (%s, %s, %s)",
            (email, code, expires_at),
        )
        conn.commit()
        conn.close()
        return resp({"ok": True, "message": "Код отправлен на email"})

    # ── POST verify ───────────────────────────────────────────────────────────
    if method == "POST" and action == "verify":
        body = json.loads(event.get("body") or "{}")
        email = (body.get("email") or "").strip().lower()
        code = (body.get("code") or "").strip()
        full_name = (body.get("full_name") or "").strip()
        phone = (body.get("phone") or "").strip()

        if not email or not code:
            return err("Email и код обязательны")

        now = datetime.now(timezone.utc)
        conn = get_conn()
        cur = conn.cursor()

        cur.execute(
            f"SELECT id FROM {SCHEMA}.verification_codes WHERE email = %s AND code = %s AND used = FALSE AND expires_at > %s ORDER BY created_at DESC LIMIT 1",
            (email, code, now),
        )
        row = cur.fetchone()
        if not row:
            conn.close()
            return err("Неверный или истёкший код")

        code_id = row[0]
        cur.execute(f"UPDATE {SCHEMA}.verification_codes SET used = TRUE WHERE id = %s", (code_id,))

        cur.execute(f"SELECT id, full_name, phone, email FROM {SCHEMA}.users WHERE email = %s", (email,))
        user_row = cur.fetchone()

        if user_row:
            user_id, db_name, db_phone, db_email = user_row
        else:
            if not full_name or not phone:
                conn.close()
                return err("ФИО и телефон обязательны для регистрации")
            cur.execute(
                f"INSERT INTO {SCHEMA}.users (full_name, phone, email) VALUES (%s, %s, %s) RETURNING id, full_name, phone, email",
                (full_name, phone, email),
            )
            user_id, db_name, db_phone, db_email = cur.fetchone()

        token = secrets.token_hex(32)
        expires_at = now + timedelta(days=30)
        cur.execute(
            f"INSERT INTO {SCHEMA}.sessions (user_id, token, expires_at) VALUES (%s, %s, %s)",
            (user_id, token, expires_at),
        )
        conn.commit()
        conn.close()

        return resp({
            "ok": True,
            "token": token,
            "user": {"id": user_id, "full_name": db_name, "phone": db_phone, "email": db_email},
        })

    return err("Неизвестный маршрут", 404)