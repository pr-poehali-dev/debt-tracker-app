-- Таблица подписок пользователей
CREATE TABLE IF NOT EXISTS t_p29977622_debt_tracker_app.user_subscriptions (
  id          serial PRIMARY KEY,
  user_id     integer NOT NULL UNIQUE,
  plan        varchar(20) NOT NULL DEFAULT 'free',
  source      varchar(30) NOT NULL DEFAULT 'manual',
  starts_at   timestamptz NOT NULL DEFAULT NOW(),
  expires_at  timestamptz NULL,
  auto_renew  boolean NOT NULL DEFAULT FALSE,
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON t_p29977622_debt_tracker_app.user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_expires ON t_p29977622_debt_tracker_app.user_subscriptions(expires_at);

-- Grandfather: всем существующим пользователям Pro на 1 год
INSERT INTO t_p29977622_debt_tracker_app.user_subscriptions (user_id, plan, source, starts_at, expires_at)
SELECT u.id, 'pro', 'grandfather', NOW(), NOW() + INTERVAL '1 year'
FROM t_p29977622_debt_tracker_app.users u
WHERE NOT EXISTS (
  SELECT 1 FROM t_p29977622_debt_tracker_app.user_subscriptions s WHERE s.user_id = u.id
);

-- Таблица платежей (для T-Pay в Шаге 2)
CREATE TABLE IF NOT EXISTS t_p29977622_debt_tracker_app.payments (
  id            serial PRIMARY KEY,
  user_id       integer NOT NULL,
  amount        numeric(10,2) NOT NULL,
  currency      varchar(3) NOT NULL DEFAULT 'RUB',
  provider      varchar(30) NOT NULL DEFAULT 't-pay',
  provider_id   varchar(100) NULL,
  order_id      varchar(100) NOT NULL UNIQUE,
  status        varchar(20) NOT NULL DEFAULT 'pending',
  plan          varchar(20) NULL,
  period_days   integer NULL,
  payment_url   text NULL,
  rebill_id     varchar(100) NULL,
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  updated_at    timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON t_p29977622_debt_tracker_app.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON t_p29977622_debt_tracker_app.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON t_p29977622_debt_tracker_app.payments(status);