CREATE TABLE IF NOT EXISTS t_p29977622_debt_tracker_app.rental_payments (
  id SERIAL PRIMARY KEY,
  rental_id INTEGER NOT NULL,
  month VARCHAR(7) NOT NULL,
  role VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'paid',
  amount DECIMAL(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rental_id, month, role)
);
CREATE INDEX IF NOT EXISTS idx_rental_payments_rental_id ON t_p29977622_debt_tracker_app.rental_payments(rental_id);
