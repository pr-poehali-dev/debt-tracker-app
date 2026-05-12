"""
Business: Cron-функция — раз в день шлёт уведомления о просроченных долгах и просроченных платежах по аренде
Args: event - dict с httpMethod; context - объект с request_id
Returns: HTTP-ответ со статистикой отправки
"""
import json
import os
import psycopg2
from datetime import date

SCHEMA = "t_p29977622_debt_tracker_app"


def cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Content-Type": "application/json",
    }


def send_push(conn, user_id, title, body_text, url="/"):
    try:
        from pywebpush import webpush, WebPushException
        vapid_private = os.environ.get("VAPID_PRIVATE_KEY", "")
        if not vapid_private or not user_id:
            return False
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, endpoint, p256dh, auth_key FROM {SCHEMA}.push_subscriptions WHERE user_id = %s",
                (int(user_id),)
            )
            subs = cur.fetchall()
        if not subs:
            return False
        sent, dead_ids = 0, []
        extra_headers = {"Urgency": "high", "TTL": "86400"}
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
                sent += 1
            except WebPushException as e:
                status = getattr(getattr(e, "response", None), "status_code", None)
                if status in (403, 404, 410):
                    dead_ids.append(sub_id)
            except Exception:
                pass
        if dead_ids:
            try:
                with conn.cursor() as cur:
                    cur.execute(f"DELETE FROM {SCHEMA}.push_subscriptions WHERE id = ANY(%s)", (dead_ids,))
                conn.commit()
            except Exception:
                pass
        return sent > 0
    except Exception as e:
        print(f"[push] fatal: {e}")
        return False


def handler(event, context):
    """Cron: проверяет просрочки по долгам и арендам, шлёт push-уведомления"""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(), "body": ""}

    today = date.today()
    target = today.isoformat()
    debts_processed = 0
    rentals_processed = 0
    push_sent = 0

    with psycopg2.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            # Лог для дедупа (если уже отправили сегодня — не повторяем)
            cur.execute(
                f"""CREATE TABLE IF NOT EXISTS {SCHEMA}.overdue_log (
                    id SERIAL PRIMARY KEY,
                    entity_type TEXT,
                    entity_id TEXT,
                    user_id INT,
                    sent_for DATE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(entity_type, entity_id, user_id, sent_for)
                )"""
            )
            conn.commit()

            # === ПРОСРОЧЕННЫЕ ДОЛГИ ===
            cur.execute(
                f"""SELECT id, title, amount, due_date, lender_user_id, borrower_user_id, borrower_decision
                    FROM {SCHEMA}.debts
                    WHERE due_date < %s
                      AND status NOT IN ('archived','paid','deleted')""",
                (target,)
            )
            overdue_debts = cur.fetchall()

            for debt_id, title, amount, due_date, lender_id, borrower_id, decision in overdue_debts:
                debts_processed += 1
                amount_str = f"{int(float(amount)):,} ₽".replace(",", " ")
                days_late = (today - due_date).days if due_date else 0
                title_text = "🔴 Просрочен возврат"
                body_text = f"«{title}» — {amount_str} (просрочка {days_late} дн.)"

                # Кредитору
                if lender_id:
                    cur.execute(
                        f"SELECT 1 FROM {SCHEMA}.overdue_log WHERE entity_type='debt' AND entity_id=%s AND user_id=%s AND sent_for=%s",
                        (str(debt_id), lender_id, target)
                    )
                    if not cur.fetchone():
                        cur.execute(
                            f"""INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data)
                                VALUES (%s, 'overdue', %s, %s, %s)""",
                            (lender_id, title_text, body_text, json.dumps({"debt_id": str(debt_id)}))
                        )
                        if send_push(conn, lender_id, title_text, body_text, "/?section=lent"):
                            push_sent += 1
                        cur.execute(
                            f"INSERT INTO {SCHEMA}.overdue_log (entity_type, entity_id, user_id, sent_for) VALUES ('debt',%s,%s,%s)",
                            (str(debt_id), lender_id, target)
                        )

                # Заёмщику (если принял)
                if borrower_id and decision == "accepted":
                    cur.execute(
                        f"SELECT 1 FROM {SCHEMA}.overdue_log WHERE entity_type='debt' AND entity_id=%s AND user_id=%s AND sent_for=%s",
                        (str(debt_id), borrower_id, target)
                    )
                    if not cur.fetchone():
                        cur.execute(
                            f"""INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data)
                                VALUES (%s, 'overdue', %s, %s, %s)""",
                            (borrower_id, title_text, body_text, json.dumps({"debt_id": str(debt_id)}))
                        )
                        if send_push(conn, borrower_id, title_text, body_text, "/?section=borrowed"):
                            push_sent += 1
                        cur.execute(
                            f"INSERT INTO {SCHEMA}.overdue_log (entity_type, entity_id, user_id, sent_for) VALUES ('debt',%s,%s,%s)",
                            (str(debt_id), borrower_id, target)
                        )

            # === ПРОСРОЧЕННЫЕ ПЛАТЕЖИ ПО АРЕНДЕ ===
            # rental.payment_day — день месяца, когда платить. Просрочка если current_day > payment_day и в этом месяце ещё не было платежа
            cur.execute(
                f"""SELECT id, title, amount, payment_day, landlord_user_id, tenant_user_id
                    FROM {SCHEMA}.rentals
                    WHERE status NOT IN ('archived','closed','deleted','cancelled')
                      AND payment_day IS NOT NULL
                      AND payment_day < %s
                      AND tenant_decision = 'accepted'""",
                (today.day,)
            )
            rentals = cur.fetchall()

            current_month = f"{today.year:04d}-{today.month:02d}"
            for rental_id, r_title, r_amount, pay_day, landlord_id, tenant_id in rentals:
                # Проверим был ли платёж в этом месяце
                cur.execute(
                    f"""SELECT 1 FROM {SCHEMA}.rental_payments
                        WHERE rental_id = %s AND month = %s
                        LIMIT 1""",
                    (rental_id, current_month)
                )
                if cur.fetchone():
                    continue  # уже оплачено в этом месяце

                rentals_processed += 1
                amount_str = f"{int(float(r_amount)):,} ₽".replace(",", " ")
                days_late = today.day - pay_day
                title_text = "🔴 Просрочка аренды"
                body_text = f"«{r_title}» — {amount_str} (просрочка {days_late} дн.)"

                # Арендатору (он должен платить)
                if tenant_id:
                    cur.execute(
                        f"SELECT 1 FROM {SCHEMA}.overdue_log WHERE entity_type='rental' AND entity_id=%s AND user_id=%s AND sent_for=%s",
                        (str(rental_id), tenant_id, target)
                    )
                    if not cur.fetchone():
                        cur.execute(
                            f"""INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data)
                                VALUES (%s, 'overdue', %s, %s, %s)""",
                            (tenant_id, title_text, body_text, json.dumps({"rental_id": str(rental_id)}))
                        )
                        if send_push(conn, tenant_id, title_text, body_text, "/?section=rentals"):
                            push_sent += 1
                        cur.execute(
                            f"INSERT INTO {SCHEMA}.overdue_log (entity_type, entity_id, user_id, sent_for) VALUES ('rental',%s,%s,%s)",
                            (str(rental_id), tenant_id, target)
                        )

                # Арендодателю (его ждёт деньги)
                if landlord_id:
                    cur.execute(
                        f"SELECT 1 FROM {SCHEMA}.overdue_log WHERE entity_type='rental' AND entity_id=%s AND user_id=%s AND sent_for=%s",
                        (str(rental_id), landlord_id, target)
                    )
                    if not cur.fetchone():
                        cur.execute(
                            f"""INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data)
                                VALUES (%s, 'overdue', %s, %s, %s)""",
                            (landlord_id, title_text, body_text, json.dumps({"rental_id": str(rental_id)}))
                        )
                        if send_push(conn, landlord_id, title_text, body_text, "/?section=rentals"):
                            push_sent += 1
                        cur.execute(
                            f"INSERT INTO {SCHEMA}.overdue_log (entity_type, entity_id, user_id, sent_for) VALUES ('rental',%s,%s,%s)",
                            (str(rental_id), landlord_id, target)
                        )

            conn.commit()

    return {
        "statusCode": 200,
        "headers": cors_headers(),
        "body": json.dumps({
            "debts_processed": debts_processed,
            "rentals_processed": rentals_processed,
            "push_sent": push_sent,
            "target_date": target,
        }, ensure_ascii=False),
        "isBase64Encoded": False
    }