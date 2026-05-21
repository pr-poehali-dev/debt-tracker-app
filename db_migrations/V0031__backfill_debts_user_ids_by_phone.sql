-- Backfill: привязка долгов к существующим пользователям по телефону, где borrower_user_id IS NULL
UPDATE t_p29977622_debt_tracker_app.debts d
SET borrower_user_id = u.id
FROM t_p29977622_debt_tracker_app.users u
WHERE d.borrower_user_id IS NULL
  AND d.borrower_phone IS NOT NULL
  AND regexp_replace(d.borrower_phone, '\D', '', 'g') = regexp_replace(u.phone, '\D', '', 'g')
  AND length(regexp_replace(u.phone, '\D', '', 'g')) >= 10;

-- То же для lender_user_id (на случай если кредитор был незалогинен)
UPDATE t_p29977622_debt_tracker_app.debts d
SET lender_user_id = u.id
FROM t_p29977622_debt_tracker_app.users u
WHERE d.lender_user_id IS NULL
  AND d.lender_phone IS NOT NULL
  AND regexp_replace(d.lender_phone, '\D', '', 'g') = regexp_replace(u.phone, '\D', '', 'g')
  AND length(regexp_replace(u.phone, '\D', '', 'g')) >= 10;