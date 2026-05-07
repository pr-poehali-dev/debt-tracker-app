ALTER TABLE t_p29977622_debt_tracker_app.debts
  ADD COLUMN IF NOT EXISTS lender_user_id integer,
  ADD COLUMN IF NOT EXISTS borrower_user_id integer,
  ADD COLUMN IF NOT EXISTS borrower_decision varchar(20) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS t_p29977622_debt_tracker_app.messages (
  id serial PRIMARY KEY,
  debt_id uuid NOT NULL,
  sender_user_id integer NOT NULL,
  sender_name varchar(255) NOT NULL,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_debt_id_idx ON t_p29977622_debt_tracker_app.messages(debt_id);
CREATE INDEX IF NOT EXISTS debts_lender_user_id_idx ON t_p29977622_debt_tracker_app.debts(lender_user_id);
CREATE INDEX IF NOT EXISTS debts_borrower_user_id_idx ON t_p29977622_debt_tracker_app.debts(borrower_user_id);
