-- Подтверждаем оплаченный платёж и продлеваем подписку user_id=1 на 30 дней
UPDATE t_p29977622_debt_tracker_app.payments
SET status = 'CONFIRMED', updated_at = NOW()
WHERE order_id = 'dd-1779348132-b21b642d';

UPDATE t_p29977622_debt_tracker_app.user_subscriptions
SET expires_at = GREATEST(expires_at, NOW()) + INTERVAL '30 days',
    source = 'paid',
    updated_at = NOW()
WHERE user_id = 1;