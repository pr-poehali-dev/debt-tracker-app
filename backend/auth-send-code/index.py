"""Отправка кода подтверждения на email для регистрации или входа."""
import json
import os
import random
import string
from datetime import datetime, timedelta, timezone
import psycopg2
import urllib.request


CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def send_email(to_email: str, code: str, full_name: str = None):
    api_key = os.environ["RESEND_API_KEY"]
    is_register = full_name is not None
    subject = "Код подтверждения — Debt-Debt"
    greeting = f"Привет, {full_name}!" if is_register else "Добро пожаловать обратно!"
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
        "from": "Debt-Debt <onboarding@resend.dev>",
        "to": [to_email],
        "subject": subject,
        "html": body_html,
    }).encode()
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return resp.status


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    body = json.loads(event.get("body") or "{}")
    email = (body.get("email") or "").strip().lower()
    full_name = (body.get("full_name") or "").strip()
    phone = (body.get("phone") or "").strip()

    if not email:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Email обязателен"})}

    code = "".join(random.choices(string.digits, k=4))
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()

    if full_name:
        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cur.fetchone():
            conn.close()
            return {"statusCode": 409, "headers": CORS, "body": json.dumps({"error": "Пользователь с таким email уже существует"})}

    cur.execute(
        "INSERT INTO verification_codes (email, code, expires_at) VALUES (%s, %s, %s)",
        (email, code, expires_at),
    )
    conn.commit()
    conn.close()

    send_email(email, code, full_name if full_name else None)

    return {
        "statusCode": 200,
        "headers": CORS,
        "body": json.dumps({"ok": True, "message": "Код отправлен на email"}),
    }