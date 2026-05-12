CREATE TABLE IF NOT EXISTS topup_requests (
  id serial PRIMARY KEY,
  debt_id uuid NOT NULL REFERENCES debts(id),
  from_user_id integer NOT NULL REFERENCES users(id),
  to_user_id integer NOT NULL REFERENCES users(id),
  amount numeric(12,2) NOT NULL,
  note text NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_topup_debt ON topup_requests(debt_id);
CREATE INDEX IF NOT EXISTS idx_topup_to_user_status ON topup_requests(to_user_id, status);
