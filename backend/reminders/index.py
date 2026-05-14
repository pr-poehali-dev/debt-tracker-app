"""
Business: Cron-функция — отправляет push-напоминания за день до срока возврата займа и за день до даты аренды
Args: event - dict с httpMethod; context - объект с request_id
Returns: HTTP-ответ со статистикой отправки
"""
import calendar
import json
import os
import psycopg2
from datetime import date, timedelta

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
            print(f"[push] skip: no vapid or user_id (user={user_id})")
            return False
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, endpoint, p256dh, auth_key FROM {SCHEMA}.push_subscriptions WHERE user_id = %s",
                (int(user_id),)
            )
            subs = cur.fetchall()
        if not subs:
            print(f"[push] no subscriptions for user_id={user_id}")
            return False
        sent, removed, failed = 0, 0, 0
        dead_ids = []
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
                    removed += 1
                else:
                    failed += 1
                    print(f"[push] WebPushException user={user_id} sub={sub_id} status={status}: {e}")
            except Exception as e:
                failed += 1
                print(f"[push] error user={user_id} sub={sub_id}: {e}")
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
        print(f"[push] user={user_id} sent={sent} removed={removed} failed={failed}")
        return sent > 0
    except Exception as e:
        print(f"[push] fatal: {e}")
        return False


def handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers(), "body": ""}

    tomorrow = date.today() + timedelta(days=1)
    target = tomorrow.isoformat()
    sent_lender = 0
    sent_borrower = 0
    skipped = 0
    processed = 0

    with psycopg2.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""SELECT id, title, amount, due_date, lender_user_id, borrower_user_id, borrower_decision
                    FROM {SCHEMA}.debts
                    WHERE due_date = %s
                      AND status NOT IN ('archived','paid','deleted')""",
                (target,)
            )
            rows = cur.fetchall()

            # Создадим таблицу-флаг чтобы не дублировать уведомления в течение дня
            cur.execute(
                f"""CREATE TABLE IF NOT EXISTS {SCHEMA}.reminder_log (
                    id SERIAL PRIMARY KEY,
                    debt_id UUID,
                    user_id INT,
                    sent_for DATE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(debt_id, user_id, sent_for)
                )"""
            )
            conn.commit()

            for debt_id, title, amount, due_date, lender_id, borrower_id, decision in rows:
                processed += 1
                amount_str = f"{int(float(amount)):,} ₽".replace(",", " ")
                title_text = "⏰ Завтра срок возврата"
                body_text = f"«{title}» — {amount_str}"

                # Кредитору
                if lender_id:
                    cur.execute(
                        f"SELECT 1 FROM {SCHEMA}.reminder_log WHERE debt_id = %s AND user_id = %s AND sent_for = %s",
                        (debt_id, lender_id, target)
                    )
                    if cur.fetchone():
                        skipped += 1
                    else:
                        cur.execute(
                            f"""INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data)
                                VALUES (%s, 'reminder', %s, %s, %s)""",
                            (lender_id, title_text, body_text, json.dumps({"debt_id": str(debt_id)}))
                        )
                        if send_push(conn, lender_id, title_text, body_text, "/?section=lent"):
                            sent_lender += 1
                        cur.execute(
                            f"INSERT INTO {SCHEMA}.reminder_log (debt_id, user_id, sent_for) VALUES (%s,%s,%s)",
                            (debt_id, lender_id, target)
                        )

                # Заёмщику (если принял долг)
                if borrower_id and decision == "accepted":
                    cur.execute(
                        f"SELECT 1 FROM {SCHEMA}.reminder_log WHERE debt_id = %s AND user_id = %s AND sent_for = %s",
                        (debt_id, borrower_id, target)
                    )
                    if cur.fetchone():
                        skipped += 1
                    else:
                        cur.execute(
                            f"""INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data)
                                VALUES (%s, 'reminder', %s, %s, %s)""",
                            (borrower_id, title_text, body_text, json.dumps({"debt_id": str(debt_id)}))
                        )
                        if send_push(conn, borrower_id, title_text, body_text, "/?section=borrowed"):
                            sent_borrower += 1
                        cur.execute(
                            f"INSERT INTO {SCHEMA}.reminder_log (debt_id, user_id, sent_for) VALUES (%s,%s,%s)",
                            (debt_id, borrower_id, target)
                        )
            conn.commit()

            # === АРЕНДА: напоминания за день до даты платежа ===
            sent_landlord = 0
            sent_tenant = 0
            rentals_processed = 0
            rentals_skipped = 0

            # Лог дедупликации для аренды
            cur.execute(
                f"""CREATE TABLE IF NOT EXISTS {SCHEMA}.rental_reminder_log (
                    id SERIAL PRIMARY KEY,
                    rental_id INT,
                    user_id INT,
                    sent_for DATE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(rental_id, user_id, sent_for)
                )"""
            )
            conn.commit()

            # Целевой день платежа — день месяца, на который придётся завтрашний календарный день.
            # Если завтра последний день короткого месяца, считаем что также наступает срок для аренд с большим payment_day.
            last_day_of_tomorrow_month = calendar.monthrange(tomorrow.year, tomorrow.month)[1]
            is_last_day = tomorrow.day == last_day_of_tomorrow_month
            target_days = [tomorrow.day] if not is_last_day else list(range(tomorrow.day, 32))
            current_month_key = date.today().strftime("%Y-%m")

            cur.execute(
                f"""SELECT id, title, amount, payment_day, landlord_user_id, tenant_user_id,
                           landlord_name, tenant_name
                    FROM {SCHEMA}.rentals
                    WHERE status NOT IN ('archived','closed','deleted','cancelled')
                      AND tenant_decision = 'accepted'
                      AND payment_day = ANY(%s)""",
                (target_days,)
            )
            rental_rows = cur.fetchall()

            for r_id, r_title, r_amount, r_day, landlord_id, tenant_id, landlord_name, tenant_name in rental_rows:
                rentals_processed += 1
                amount_str = f"{int(float(r_amount)):,} ₽".replace(",", " ")

                # Проверяем, кто уже оплатил/подтвердил за текущий месяц — таких не дёргаем
                cur.execute(
                    f"""SELECT role FROM {SCHEMA}.rental_payments
                        WHERE rental_id = %s AND month = %s AND status = 'paid'""",
                    (r_id, current_month_key)
                )
                paid_roles = {row[0] for row in cur.fetchall()}

                # Арендатору
                if tenant_id and "tenant" not in paid_roles:
                    cur.execute(
                        f"SELECT 1 FROM {SCHEMA}.rental_reminder_log WHERE rental_id = %s AND user_id = %s AND sent_for = %s",
                        (r_id, tenant_id, target)
                    )
                    if cur.fetchone():
                        rentals_skipped += 1
                    else:
                        notif_title = "⏰ Завтра срок оплаты аренды"
                        notif_body = f"«{r_title}» — {amount_str}"
                        cur.execute(
                            f"""INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data)
                                VALUES (%s, 'rental_reminder', %s, %s, %s)""",
                            (tenant_id, notif_title, notif_body, json.dumps({"rental_id": r_id}))
                        )
                        if send_push(conn, tenant_id, notif_title, notif_body, "/?section=rental"):
                            sent_tenant += 1
                        cur.execute(
                            f"INSERT INTO {SCHEMA}.rental_reminder_log (rental_id, user_id, sent_for) VALUES (%s,%s,%s)",
                            (r_id, tenant_id, target)
                        )

                # Арендодателю
                if landlord_id and "landlord" not in paid_roles:
                    cur.execute(
                        f"SELECT 1 FROM {SCHEMA}.rental_reminder_log WHERE rental_id = %s AND user_id = %s AND sent_for = %s",
                        (r_id, landlord_id, target)
                    )
                    if cur.fetchone():
                        rentals_skipped += 1
                    else:
                        notif_title = "⏰ Завтра ждём оплату аренды"
                        notif_body = f"«{r_title}» — {amount_str}" + (f" от {tenant_name}" if tenant_name else "")
                        cur.execute(
                            f"""INSERT INTO {SCHEMA}.notifications (user_id, type, title, body, data)
                                VALUES (%s, 'rental_reminder', %s, %s, %s)""",
                            (landlord_id, notif_title, notif_body, json.dumps({"rental_id": r_id}))
                        )
                        if send_push(conn, landlord_id, notif_title, notif_body, "/?section=rental"):
                            sent_landlord += 1
                        cur.execute(
                            f"INSERT INTO {SCHEMA}.rental_reminder_log (rental_id, user_id, sent_for) VALUES (%s,%s,%s)",
                            (r_id, landlord_id, target)
                        )
            conn.commit()

    return {
        "statusCode": 200,
        "headers": cors_headers(),
        "body": json.dumps({
            "processed": processed,
            "sent_lender": sent_lender,
            "sent_borrower": sent_borrower,
            "skipped_already_sent": skipped,
            "rentals_processed": rentals_processed,
            "sent_landlord": sent_landlord,
            "sent_tenant": sent_tenant,
            "rentals_skipped": rentals_skipped,
            "target_date": target,
        }, ensure_ascii=False),
        "isBase64Encoded": False
    }