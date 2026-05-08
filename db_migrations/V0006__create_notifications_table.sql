CREATE TABLE IF NOT EXISTS t_p29977622_debt_tracker_app.notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON t_p29977622_debt_tracker_app.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON t_p29977622_debt_tracker_app.notifications(created_at DESC);
