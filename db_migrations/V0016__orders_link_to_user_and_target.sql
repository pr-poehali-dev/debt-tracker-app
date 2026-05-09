ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS user_id INTEGER,
  ADD COLUMN IF NOT EXISTS target_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS target_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS target_month VARCHAR(7);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_target ON orders(target_type, target_id);
