CREATE TABLE IF NOT EXISTS t_p29977622_debt_tracker_app.payment_requests (
  id          serial PRIMARY KEY,
  debt_id     uuid NOT NULL,
  from_user_id integer NOT NULL REFERENCES t_p29977622_debt_tracker_app.users(id),
  to_user_id   integer NOT NULL REFERENCES t_p29977622_debt_tracker_app.users(id),
  amount      numeric(12,2) NOT NULL,
  note        text NULL,
  status      varchar(20) NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_requests_debt_id ON t_p29977622_debt_tracker_app.payment_requests(debt_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_to_user ON t_p29977622_debt_tracker_app.payment_requests(to_user_id);
