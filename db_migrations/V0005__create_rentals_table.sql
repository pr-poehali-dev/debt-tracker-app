
CREATE TABLE t_p29977622_debt_tracker_app.rentals (
    id SERIAL PRIMARY KEY,
    share_token VARCHAR(16) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    note TEXT,
    payment_day INTEGER NOT NULL CHECK (payment_day >= 1 AND payment_day <= 31),
    landlord_name VARCHAR(255) NOT NULL,
    landlord_phone VARCHAR(50),
    tenant_name VARCHAR(255),
    tenant_phone VARCHAR(50),
    landlord_user_id INTEGER REFERENCES t_p29977622_debt_tracker_app.users(id),
    tenant_user_id INTEGER REFERENCES t_p29977622_debt_tracker_app.users(id),
    tenant_decision VARCHAR(20) DEFAULT 'pending',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    current_month_status_landlord VARCHAR(20) DEFAULT 'unpaid',
    current_month_status_tenant VARCHAR(20) DEFAULT 'unpaid',
    last_payment_month VARCHAR(7),
    pending_amount DECIMAL(12,2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
