"""
API подписок пользователя.
GET / — получить текущий план + лимиты + использование
"""
import json
import os
import psycopg2

SCHEMA = "t_p29977622_debt_tracker_app"

# Лимиты для тарифа Free
FREE_LIMITS = {
    "max_active_debts": 5,
    "max_active_rentals": 2,
    "max_messages_per_chat": 100,
}

PRO_LIMITS = {
    "max_active_debts": -1,  # -1 = безлимит
    "max_active_rentals": -1,
    "max_messages_per_chat": -1,
}

PLAN_PRICE_RUB = 199


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


def get_user_plan(conn, user_id: int):
    """Возвращает (plan, expires_at, source). Если подписки нет — создаёт free."""
    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT plan, expires_at, source FROM {SCHEMA}.user_subscriptions
                WHERE user_id = %s LIMIT 1""",
            (user_id,)
        )
        row = cur.fetchone()
        if not row:
            cur.execute(
                f"""INSERT INTO {SCHEMA}.user_subscriptions (user_id, plan, source)
                    VALUES (%s, 'free', 'auto') RETURNING plan, expires_at, source""",
                (user_id,)
            )
            row = cur.fetchone()
            conn.commit()
        plan, expires_at, source = row
        # Если Pro истёк — откатываем на free
        if plan == "pro" and expires_at is not None:
            cur.execute(
                f"""SELECT (expires_at < NOW()) FROM {SCHEMA}.user_subscriptions WHERE user_id = %s""",
                (user_id,)
            )
            is_expired = cur.fetchone()[0]
            if is_expired:
                cur.execute(
                    f"""UPDATE {SCHEMA}.user_subscriptions SET plan = 'free', updated_at = NOW()
                        WHERE user_id = %s RETURNING plan, expires_at, source""",
                    (user_id,)
                )
                row = cur.fetchone()
                conn.commit()
                plan, expires_at, source = row
        return plan, expires_at, source


def count_active_debts(conn, user_id: int) -> int:
    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT COUNT(*) FROM {SCHEMA}.debts
                WHERE (lender_user_id = %s OR borrower_user_id = %s)
                  AND status NOT IN ('archived', 'deleted', 'paid')""",
            (user_id, user_id)
        )
        return int(cur.fetchone()[0])


def count_active_rentals(conn, user_id: int) -> int:
    """Считает аренды, где пользователь арендодатель или арендатор."""
    with conn.cursor() as cur:
        try:
            cur.execute(
                f"""SELECT COUNT(*) FROM {SCHEMA}.rentals
                    WHERE (landlord_user_id = %s OR tenant_user_id = %s)
                      AND (status IS NULL OR status NOT IN ('archived', 'deleted'))""",
                (user_id, user_id)
            )
            return int(cur.fetchone()[0])
        except Exception:
            conn.rollback()
            return 0


def handler(event: dict, context) -> dict:
    """Возвращает текущий тариф пользователя, его лимиты и использование."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(), "body": ""}

    headers = event.get("headers") or {}
    auth = headers.get("X-Authorization") or headers.get("Authorization") or ""

    method = event.get("httpMethod", "GET")

    with get_conn() as conn:
        user_id = get_user_id_from_token(auth, conn)
        if not user_id:
            return err("Не авторизован", 401)

        if method == "GET":
            plan, expires_at, source = get_user_plan(conn, user_id)
            limits = PRO_LIMITS if plan == "pro" else FREE_LIMITS
            usage = {
                "active_debts": count_active_debts(conn, user_id),
                "active_rentals": count_active_rentals(conn, user_id),
            }
            return json_resp({
                "plan": plan,
                "source": source,
                "expires_at": str(expires_at) if expires_at else None,
                "limits": limits,
                "usage": usage,
                "price_rub": PLAN_PRICE_RUB,
            })

        return err("Метод не поддерживается", 405)
