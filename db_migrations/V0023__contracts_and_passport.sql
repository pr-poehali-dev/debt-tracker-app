ALTER TABLE t_p29977622_debt_tracker_app.users
  ADD COLUMN IF NOT EXISTS passport_series varchar(10),
  ADD COLUMN IF NOT EXISTS passport_number varchar(20),
  ADD COLUMN IF NOT EXISTS passport_issued_by text,
  ADD COLUMN IF NOT EXISTS passport_issued_date date,
  ADD COLUMN IF NOT EXISTS passport_dept_code varchar(20),
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS registration_address text;

CREATE TABLE IF NOT EXISTS t_p29977622_debt_tracker_app.contracts (
  id serial PRIMARY KEY,
  contract_type text NOT NULL,
  debt_id uuid NULL,
  rental_id integer NULL,
  created_by_user_id integer NOT NULL,
  party_a_user_id integer NOT NULL,
  party_b_user_id integer NULL,
  data jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  signed_by_a_at timestamptz NULL,
  signed_by_b_at timestamptz NULL,
  signed_by_a_ip text NULL,
  signed_by_b_ip text NULL,
  pdf_url text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contracts_debt_idx ON t_p29977622_debt_tracker_app.contracts(debt_id);
CREATE INDEX IF NOT EXISTS contracts_rental_idx ON t_p29977622_debt_tracker_app.contracts(rental_id);
CREATE INDEX IF NOT EXISTS contracts_party_a_idx ON t_p29977622_debt_tracker_app.contracts(party_a_user_id);
CREATE INDEX IF NOT EXISTS contracts_party_b_idx ON t_p29977622_debt_tracker_app.contracts(party_b_user_id);