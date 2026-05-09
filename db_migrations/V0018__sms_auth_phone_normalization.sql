-- Нормализуем телефоны существующих пользователей в формат +7XXXXXXXXXX
UPDATE t_p29977622_debt_tracker_app.users
SET phone = '+7' || SUBSTRING(REGEXP_REPLACE(phone, '\D', '', 'g'), 2)
WHERE phone NOT LIKE '+%' AND LENGTH(REGEXP_REPLACE(phone, '\D', '', 'g')) = 11;

-- Делаем phone уникальным
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx ON t_p29977622_debt_tracker_app.users(phone);

-- В verification_codes добавляем поле phone (email оставляем для совместимости, будет пустая строка)
ALTER TABLE t_p29977622_debt_tracker_app.verification_codes
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- Индекс по phone+code для быстрого поиска при верификации
CREATE INDEX IF NOT EXISTS verification_codes_phone_idx ON t_p29977622_debt_tracker_app.verification_codes(phone, code) WHERE phone IS NOT NULL;
