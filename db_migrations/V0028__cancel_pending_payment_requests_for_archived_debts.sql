UPDATE t_p29977622_debt_tracker_app.payment_requests
SET status = 'cancelled'
WHERE status = 'pending'
  AND debt_id IN (
    SELECT id FROM t_p29977622_debt_tracker_app.debts WHERE status = 'archived'
  );