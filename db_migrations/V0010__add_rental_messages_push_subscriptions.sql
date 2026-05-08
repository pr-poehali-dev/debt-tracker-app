ALTER TABLE t_p29977622_debt_tracker_app.messages
  ADD COLUMN IF NOT EXISTS rental_id integer,
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS t_p29977622_debt_tracker_app.push_subscriptions (
  id          serial PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES t_p29977622_debt_tracker_app.users(id),
  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth_key    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_messages_rental_id ON t_p29977622_debt_tracker_app.messages(rental_id);
CREATE INDEX IF NOT EXISTS idx_messages_is_read ON t_p29977622_debt_tracker_app.messages(is_read);
CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON t_p29977622_debt_tracker_app.push_subscriptions(user_id);
