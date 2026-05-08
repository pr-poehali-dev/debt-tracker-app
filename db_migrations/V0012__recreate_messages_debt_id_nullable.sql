CREATE TABLE t_p29977622_debt_tracker_app.messages_new (
  id          serial PRIMARY KEY,
  debt_id     uuid NULL,
  rental_id   integer NULL,
  sender_user_id integer NOT NULL,
  sender_name varchar(255) NOT NULL,
  text        text NOT NULL,
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (debt_id IS NOT NULL OR rental_id IS NOT NULL)
);

INSERT INTO t_p29977622_debt_tracker_app.messages_new
  (id, debt_id, rental_id, sender_user_id, sender_name, text, is_read, created_at)
SELECT id, debt_id, rental_id, sender_user_id, sender_name, text, is_read, created_at
FROM t_p29977622_debt_tracker_app.messages;

ALTER TABLE t_p29977622_debt_tracker_app.messages RENAME TO messages_old;
ALTER TABLE t_p29977622_debt_tracker_app.messages_new RENAME TO messages;

CREATE INDEX idx_messages_debt_id ON t_p29977622_debt_tracker_app.messages(debt_id);
CREATE INDEX idx_messages_rental_id2 ON t_p29977622_debt_tracker_app.messages(rental_id);
CREATE INDEX idx_messages_is_read2 ON t_p29977622_debt_tracker_app.messages(is_read);
