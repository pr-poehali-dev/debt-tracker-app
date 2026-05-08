UPDATE t_p29977622_debt_tracker_app.rentals
SET tenant_user_id = 2
WHERE id = 2 AND tenant_user_id IS NULL AND tenant_decision = 'accepted';
