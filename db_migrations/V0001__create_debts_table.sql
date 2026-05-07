
CREATE TABLE t_p29977622_debt_tracker_app.debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token VARCHAR(12) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  note TEXT,
  due_date DATE,
  lender_name VARCHAR(255) NOT NULL,
  lender_phone VARCHAR(50),
  borrower_name VARCHAR(255),
  borrower_phone VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON t_p29977622_debt_tracker_app.debts (share_token);
CREATE INDEX ON t_p29977622_debt_tracker_app.debts (status);
