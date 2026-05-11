CREATE TABLE IF NOT EXISTS t_p29977622_debt_tracker_app.contacts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(40) DEFAULT '',
  email VARCHAR(200) DEFAULT '',
  telegram VARCHAR(100) DEFAULT '',
  note TEXT DEFAULT '',
  color VARCHAR(20) DEFAULT 'purple',
  avatar VARCHAR(8) DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_user ON t_p29977622_debt_tracker_app.contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON t_p29977622_debt_tracker_app.contacts(user_id, phone);

ALTER TABLE t_p29977622_debt_tracker_app.debts
  ADD COLUMN IF NOT EXISTS lender_contact_id INTEGER,
  ADD COLUMN IF NOT EXISTS borrower_contact_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_debts_lender_contact ON t_p29977622_debt_tracker_app.debts(lender_contact_id);
CREATE INDEX IF NOT EXISTS idx_debts_borrower_contact ON t_p29977622_debt_tracker_app.debts(borrower_contact_id);
