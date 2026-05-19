"""
API оплаты подписки через T-Bank Acquiring (T-Pay).
POST /         body={plan, period_days?} — создать счёт, вернуть payment_url
POST ?action=notification — webhook от T-Bank (Notification)
GET  ?order_id=XXX — проверить статус платежа
"""
import json
import os
import hashlib
import urllib.request
import urllib.error
import time
import secrets as pysecrets
import psycopg2

SCHEMA = "t_p29977622_debt_tracker_app"

TBANK_API = "https://securepay.tinkoff.ru/v2/"

PLANS = {
    "pro_month": {"amount_rub": 199, "period_days": 30, "label": "Подписка Debt-Debt Pro (1 месяц)"},
    "pro_year": {"amount_rub": 1990, "period_days": 365, "label": "Подписка Debt-Debt Pro (1 год)"},
    "pdf_export": {"amount_rub": 99, "period_days": 0, "label": "Экспорт договора и истории в PDF"},
}


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Authorization",
        "Content-Type": "application/json",
    }


def json_resp(data, status=200):
    return {"statusCode": status, "headers": cors_headers(), "body": json.dumps(data, ensure_ascii=False, default=str)}


def err(msg, status=400):
    return json_resp({"error": msg}, status)


def get_user_id_from_token(token_str, conn):
    if not token_str:
        return None
    bearer = token_str.replace("Bearer ", "").strip()
    with conn.cursor() as cur:
        cur.execute(f"SELECT user_id FROM {SCHEMA}.sessions WHERE token = %s AND expires_at > NOW()", (bearer,))
        row = cur.fetchone()
    return row[0] if row else None


def tbank_sign(params: dict, password: str) -> str:
    """Подпись T-Bank: SHA256 от конкатенации значений (по алфавиту ключей) + Password.
    Из подписи исключаются вложенные объекты (DATA, Receipt, Token, Shops)."""
    skip = {"Token", "DATA", "Receipt", "Shops"}
    flat = {k: v for k, v in params.items() if k not in skip and not isinstance(v, (dict, list))}
    flat["Password"] = password
    src = "".join(str(flat[k]) for k in sorted(flat.keys()))
    return hashlib.sha256(src.encode("utf-8")).hexdigest()


def tbank_request(method: str, body: dict) -> dict:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        TBANK_API + method,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"Success": False, "Message": f"HTTP {e.code}", "Details": e.read().decode("utf-8", errors="ignore")}
    except Exception as e:
        return {"Success": False, "Message": str(e)}


def gen_order_id() -> str:
    return f"dd-{int(time.time())}-{pysecrets.token_hex(4)}"


def apply_payment_to_subscription(conn, user_id: int, plan_code: str, period_days: int):
    """Продлевает Pro-подписку пользователя."""
    if not period_days:
        return  # разовая покупка (например PDF) — не трогаем подписку
    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT plan, expires_at FROM {SCHEMA}.user_subscriptions WHERE user_id = %s""",
            (user_id,)
        )
        row = cur.fetchone()
        if row and row[0] == "pro" and row[1] is not None:
            cur.execute(
                f"""UPDATE {SCHEMA}.user_subscriptions
                    SET plan='pro', expires_at = GREATEST(expires_at, NOW()) + (%s || ' days')::interval,
                        source='paid', updated_at = NOW()
                    WHERE user_id = %s""",
                (str(period_days), user_id)
            )
        elif row:
            cur.execute(
                f"""UPDATE {SCHEMA}.user_subscriptions
                    SET plan='pro', expires_at = NOW() + (%s || ' days')::interval,
                        source='paid', updated_at = NOW()
                    WHERE user_id = %s""",
                (str(period_days), user_id)
            )
        else:
            cur.execute(
                f"""INSERT INTO {SCHEMA}.user_subscriptions (user_id, plan, source, expires_at)
                    VALUES (%s, 'pro', 'paid', NOW() + (%s || ' days')::interval)""",
                (user_id, str(period_days))
            )
        conn.commit()


def init_payment(conn, user_id: int, plan_code: str, return_url: str) -> dict:
    plan = PLANS.get(plan_code)
    if not plan:
        return {"error": "Неизвестный тариф", "status": 400}

    terminal = os.environ.get("TBANK_TERMINAL_KEY", "")
    password = os.environ.get("TBANK_SECRET_KEY", "")
    if not terminal or not password:
        return {
            "error": "Платежи временно недоступны: терминал не подключён. Скоро будет!",
            "status": 503,
        }

    order_id = gen_order_id()
    amount_kop = int(plan["amount_rub"]) * 100
    success_url = (return_url.rstrip("/") + f"/payment/success?order_id={order_id}") if return_url else None
    fail_url = (return_url.rstrip("/") + "/payment/fail") if return_url else None

    # Сохраняем платёж в БД до отправки в T-Bank
    with conn.cursor() as cur:
        cur.execute(
            f"""INSERT INTO {SCHEMA}.payments
                (user_id, amount, order_id, status, plan, period_days, provider)
                VALUES (%s, %s, %s, 'pending', %s, %s, 't-pay')""",
            (user_id, plan["amount_rub"], order_id, plan_code, plan["period_days"])
        )
        conn.commit()

    init_body = {
        "TerminalKey": terminal,
        "Amount": amount_kop,
        "OrderId": order_id,
        "Description": plan["label"],
        "CustomerKey": str(user_id),
    }
    if success_url:
        init_body["SuccessURL"] = success_url
    if fail_url:
        init_body["FailURL"] = fail_url

    init_body["Token"] = tbank_sign(init_body, password)
    resp = tbank_request("Init", init_body)

    if resp.get("Success") and resp.get("PaymentURL"):
        with conn.cursor() as cur:
            cur.execute(
                f"""UPDATE {SCHEMA}.payments SET provider_id = %s, payment_url = %s, updated_at = NOW()
                    WHERE order_id = %s""",
                (str(resp.get("PaymentId")), resp["PaymentURL"], order_id)
            )
            conn.commit()
        return {
            "order_id": order_id,
            "payment_url": resp["PaymentURL"],
            "amount_rub": plan["amount_rub"],
        }

    with conn.cursor() as cur:
        cur.execute(
            f"""UPDATE {SCHEMA}.payments SET status = 'init_failed', updated_at = NOW()
                WHERE order_id = %s""",
            (order_id,)
        )
        conn.commit()
    return {"error": resp.get("Message") or "Не удалось создать счёт", "status": 502}


def handle_notification(conn, body_raw: str) -> dict:
    """Webhook от T-Bank: подтверждение или отказ платежа.
    Документация: при успехе нужно вернуть строку 'OK' (текст, не JSON)."""
    password = os.environ.get("TBANK_SECRET_KEY", "")
    if not password:
        return {"_raw_ok": False}
    try:
        data = json.loads(body_raw or "{}")
    except Exception:
        return {"_raw_ok": False}

    # Верификация подписи
    incoming_token = data.get("Token", "")
    expected = tbank_sign(data, password)
    if not incoming_token or incoming_token.lower() != expected.lower():
        print(f"[payments] bad signature for order {data.get('OrderId')}")
        return {"_raw_ok": False}

    order_id = data.get("OrderId")
    status = data.get("Status", "")
    rebill_id = data.get("RebillId")

    if not order_id:
        return {"_raw_ok": False}

    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT user_id, plan, period_days, status FROM {SCHEMA}.payments WHERE order_id = %s""",
            (order_id,)
        )
        row = cur.fetchone()
        if not row:
            print(f"[payments] notification for unknown order {order_id}")
            return {"_raw_ok": True}
        user_id, plan_code, period_days, prev_status = row

        # Обновляем статус платежа
        cur.execute(
            f"""UPDATE {SCHEMA}.payments
                SET status = %s, rebill_id = COALESCE(%s, rebill_id), updated_at = NOW()
                WHERE order_id = %s""",
            (status, str(rebill_id) if rebill_id else None, order_id)
        )
        conn.commit()

    # Применяем оплату только если статус CONFIRMED и подписка ещё не была применена
    if status == "CONFIRMED" and prev_status != "CONFIRMED":
        apply_payment_to_subscription(conn, user_id, plan_code, period_days or 0)
        print(f"[payments] CONFIRMED order {order_id} user {user_id} plan {plan_code}")

    return {"_raw_ok": True}


def get_payment_status(conn, order_id: str) -> dict:
    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT order_id, status, amount, plan, created_at FROM {SCHEMA}.payments WHERE order_id = %s""",
            (order_id,)
        )
        row = cur.fetchone()
    if not row:
        return {"error": "Платёж не найден", "status": 404}
    return {
        "order_id": row[0],
        "status": row[1],
        "amount_rub": float(row[2]),
        "plan": row[3],
        "created_at": str(row[4]),
    }


def handler(event: dict, context) -> dict:
    """Создаёт счета T-Pay, принимает webhook'и и проверяет статус платежей."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(), "body": ""}

    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    headers = event.get("headers") or {}

    # Webhook от T-Bank — без авторизации (проверка по подписи)
    if method == "POST" and qs.get("action") == "notification":
        with get_conn() as conn:
            result = handle_notification(conn, event.get("body") or "")
        ok = result.get("_raw_ok")
        return {
            "statusCode": 200,
            "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "text/plain"},
            "body": "OK" if ok else "ERR",
        }

    # Все остальные — требуют авторизации
    auth = headers.get("X-Authorization") or headers.get("Authorization") or ""

    with get_conn() as conn:
        user_id = get_user_id_from_token(auth, conn)
        if not user_id:
            return err("Не авторизован", 401)

        if method == "GET" and qs.get("order_id"):
            data = get_payment_status(conn, qs["order_id"])
            return json_resp(data, data.pop("status", 200))

        if method == "POST" and not qs.get("action"):
            body = json.loads(event.get("body") or "{}")
            plan_code = body.get("plan") or "pro_month"
            return_url = body.get("return_url") or ""
            data = init_payment(conn, user_id, plan_code, return_url)
            status = data.pop("status", 200)
            return json_resp(data, status)

        return err("Метод не поддерживается", 405)
