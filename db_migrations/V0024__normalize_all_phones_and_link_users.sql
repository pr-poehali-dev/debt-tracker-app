-- Нормализация всех телефонных полей к виду +7XXXXXXXXXX
-- И автоматическая привязка user_id по нормализованным телефонам

-- 1. contacts.phone
UPDATE t_p29977622_debt_tracker_app.contacts
SET phone = CASE
  WHEN length(regexp_replace(phone, '\D', '', 'g')) = 11 
       AND substring(regexp_replace(phone, '\D', '', 'g') FROM 1 FOR 1) = '8'
    THEN '+7' || substring(regexp_replace(phone, '\D', '', 'g') FROM 2)
  WHEN length(regexp_replace(phone, '\D', '', 'g')) = 11
       AND substring(regexp_replace(phone, '\D', '', 'g') FROM 1 FOR 1) = '7'
    THEN '+' || regexp_replace(phone, '\D', '', 'g')
  WHEN length(regexp_replace(phone, '\D', '', 'g')) = 10
    THEN '+7' || regexp_replace(phone, '\D', '', 'g')
  ELSE phone
END
WHERE phone IS NOT NULL AND phone <> '' AND phone NOT LIKE '+7%';

-- 2. debts.borrower_phone
UPDATE t_p29977622_debt_tracker_app.debts
SET borrower_phone = CASE
  WHEN length(regexp_replace(borrower_phone, '\D', '', 'g')) = 11 
       AND substring(regexp_replace(borrower_phone, '\D', '', 'g') FROM 1 FOR 1) = '8'
    THEN '+7' || substring(regexp_replace(borrower_phone, '\D', '', 'g') FROM 2)
  WHEN length(regexp_replace(borrower_phone, '\D', '', 'g')) = 11
       AND substring(regexp_replace(borrower_phone, '\D', '', 'g') FROM 1 FOR 1) = '7'
    THEN '+' || regexp_replace(borrower_phone, '\D', '', 'g')
  WHEN length(regexp_replace(borrower_phone, '\D', '', 'g')) = 10
    THEN '+7' || regexp_replace(borrower_phone, '\D', '', 'g')
  ELSE borrower_phone
END
WHERE borrower_phone IS NOT NULL AND borrower_phone <> '' AND borrower_phone NOT LIKE '+7%';

-- 3. debts.lender_phone
UPDATE t_p29977622_debt_tracker_app.debts
SET lender_phone = CASE
  WHEN length(regexp_replace(lender_phone, '\D', '', 'g')) = 11 
       AND substring(regexp_replace(lender_phone, '\D', '', 'g') FROM 1 FOR 1) = '8'
    THEN '+7' || substring(regexp_replace(lender_phone, '\D', '', 'g') FROM 2)
  WHEN length(regexp_replace(lender_phone, '\D', '', 'g')) = 11
       AND substring(regexp_replace(lender_phone, '\D', '', 'g') FROM 1 FOR 1) = '7'
    THEN '+' || regexp_replace(lender_phone, '\D', '', 'g')
  WHEN length(regexp_replace(lender_phone, '\D', '', 'g')) = 10
    THEN '+7' || regexp_replace(lender_phone, '\D', '', 'g')
  ELSE lender_phone
END
WHERE lender_phone IS NOT NULL AND lender_phone <> '' AND lender_phone NOT LIKE '+7%';

-- 4. rentals.tenant_phone
UPDATE t_p29977622_debt_tracker_app.rentals
SET tenant_phone = CASE
  WHEN length(regexp_replace(tenant_phone, '\D', '', 'g')) = 11 
       AND substring(regexp_replace(tenant_phone, '\D', '', 'g') FROM 1 FOR 1) = '8'
    THEN '+7' || substring(regexp_replace(tenant_phone, '\D', '', 'g') FROM 2)
  WHEN length(regexp_replace(tenant_phone, '\D', '', 'g')) = 11
       AND substring(regexp_replace(tenant_phone, '\D', '', 'g') FROM 1 FOR 1) = '7'
    THEN '+' || regexp_replace(tenant_phone, '\D', '', 'g')
  WHEN length(regexp_replace(tenant_phone, '\D', '', 'g')) = 10
    THEN '+7' || regexp_replace(tenant_phone, '\D', '', 'g')
  ELSE tenant_phone
END
WHERE tenant_phone IS NOT NULL AND tenant_phone <> '' AND tenant_phone NOT LIKE '+7%';

-- 5. rentals.landlord_phone
UPDATE t_p29977622_debt_tracker_app.rentals
SET landlord_phone = CASE
  WHEN length(regexp_replace(landlord_phone, '\D', '', 'g')) = 11 
       AND substring(regexp_replace(landlord_phone, '\D', '', 'g') FROM 1 FOR 1) = '8'
    THEN '+7' || substring(regexp_replace(landlord_phone, '\D', '', 'g') FROM 2)
  WHEN length(regexp_replace(landlord_phone, '\D', '', 'g')) = 11
       AND substring(regexp_replace(landlord_phone, '\D', '', 'g') FROM 1 FOR 1) = '7'
    THEN '+' || regexp_replace(landlord_phone, '\D', '', 'g')
  WHEN length(regexp_replace(landlord_phone, '\D', '', 'g')) = 10
    THEN '+7' || regexp_replace(landlord_phone, '\D', '', 'g')
  ELSE landlord_phone
END
WHERE landlord_phone IS NOT NULL AND landlord_phone <> '' AND landlord_phone NOT LIKE '+7%';

-- 6. Привязка borrower_user_id в debts по совпадению с users.phone
UPDATE t_p29977622_debt_tracker_app.debts d
SET borrower_user_id = u.id
FROM t_p29977622_debt_tracker_app.users u
WHERE d.borrower_user_id IS NULL
  AND d.borrower_phone IS NOT NULL
  AND d.borrower_phone <> ''
  AND d.borrower_phone = u.phone;

-- 7. Привязка tenant_user_id в rentals по совпадению с users.phone
UPDATE t_p29977622_debt_tracker_app.rentals r
SET tenant_user_id = u.id
FROM t_p29977622_debt_tracker_app.users u
WHERE r.tenant_user_id IS NULL
  AND r.tenant_phone IS NOT NULL
  AND r.tenant_phone <> ''
  AND r.tenant_phone = u.phone;

-- 8. Индексы для быстрого поиска по нормализованному телефону
CREATE INDEX IF NOT EXISTS idx_users_phone_normalized 
  ON t_p29977622_debt_tracker_app.users(phone);
CREATE INDEX IF NOT EXISTS idx_debts_borrower_phone 
  ON t_p29977622_debt_tracker_app.debts(borrower_phone);
CREATE INDEX IF NOT EXISTS idx_rentals_tenant_phone 
  ON t_p29977622_debt_tracker_app.rentals(tenant_phone);