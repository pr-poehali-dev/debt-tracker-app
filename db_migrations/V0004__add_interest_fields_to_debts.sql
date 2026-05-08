ALTER TABLE t_p29977622_debt_tracker_app.debts
  ADD COLUMN interest_rate numeric(6,2) NULL,
  ADD COLUMN interest_type character varying(10) NULL DEFAULT 'simple';