-- Привязываем тестовые долги с null к пользователю elovyh@list.ru (id=1) как кредитору
UPDATE t_p29977622_debt_tracker_app.debts
SET lender_user_id = 1
WHERE lender_user_id IS NULL AND borrower_user_id IS NULL
  AND title IN ('займ матюхин', 'займ');

-- Остальные тестовые долги с null архивируем (они были созданы без авторизации)
UPDATE t_p29977622_debt_tracker_app.debts
SET status = 'archived'
WHERE lender_user_id IS NULL AND borrower_user_id IS NULL
  AND title LIKE 'Тест%';
