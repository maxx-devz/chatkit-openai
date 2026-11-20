-- Additive subscription entitlement; legacy reporting history stays unchanged.
CREATE TABLE IF NOT EXISTS portal_client_plans (
 client_id BIGINT PRIMARY KEY REFERENCES portal_clients(id) ON DELETE CASCADE,
 monthly_price NUMERIC(12,2) NOT NULL CHECK(monthly_price BETWEEN 0 AND 1000000),
 monthly_credits BIGINT NOT NULL CHECK(monthly_credits BETWEEN 1 AND 1000000000),
 status TEXT NOT NULL CHECK(status IN ('active','paused')),
 version BIGINT NOT NULL DEFAULT 1,
 updated_by TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS portal_client_plan_months (
 client_id BIGINT NOT NULL REFERENCES portal_client_plans(client_id),
 period TEXT NOT NULL CHECK(period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 monthly_price NUMERIC(12,2) NOT NULL CHECK(monthly_price BETWEEN 0 AND 1000000),
 included_credits BIGINT NOT NULL CHECK(included_credits BETWEEN 1 AND 1000000000),
 payment_reference TEXT NOT NULL CHECK(char_length(payment_reference) BETWEEN 1 AND 160),
 confirmed_by TEXT NOT NULL, activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(client_id,period)
);
CREATE TABLE IF NOT EXISTS portal_client_plan_requests (
 id UUID PRIMARY KEY,client_id BIGINT NOT NULL REFERENCES portal_clients(id),
 user_id BIGINT NOT NULL REFERENCES portal_users(id),
 kind TEXT NOT NULL CHECK(kind IN ('credits','upgrade')),
 note TEXT NOT NULL CHECK(char_length(note) BETWEEN 1 AND 500),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','declined')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),closed_at TIMESTAMPTZ,
 UNIQUE(id,client_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS portal_client_plan_one_request ON portal_client_plan_requests(client_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS portal_client_plan_topups (
 id UUID PRIMARY KEY,client_id BIGINT NOT NULL,period TEXT NOT NULL,
 credits BIGINT NOT NULL CHECK(credits BETWEEN 1 AND 1000000000),
 paid_usd NUMERIC(12,2) NOT NULL CHECK(paid_usd>0 AND paid_usd<=1000000),
 payment_reference TEXT NOT NULL CHECK(char_length(payment_reference) BETWEEN 1 AND 160),
 request_id UUID,confirmed_by TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 FOREIGN KEY(client_id,period) REFERENCES portal_client_plan_months(client_id,period),
 FOREIGN KEY(request_id,client_id) REFERENCES portal_client_plan_requests(id,client_id)
);
CREATE TABLE IF NOT EXISTS portal_client_plan_runs (
 id UUID PRIMARY KEY,client_id BIGINT NOT NULL,period TEXT NOT NULL,
 user_id BIGINT NOT NULL REFERENCES portal_users(id),
 status TEXT NOT NULL CHECK(status IN ('running','review','settled')),
 credits_used NUMERIC(30,12) CHECK(credits_used>=0),
 started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),finished_at TIMESTAMPTZ,
 FOREIGN KEY(client_id,period) REFERENCES portal_client_plan_months(client_id,period),
 CHECK(status<>'settled' OR credits_used IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS portal_client_plan_one_run ON portal_client_plan_runs(client_id) WHERE status IN ('running','review');
CREATE INDEX IF NOT EXISTS portal_client_plan_runs_period ON portal_client_plan_runs(client_id,period);
CREATE TABLE IF NOT EXISTS portal_client_plan_audit (
 id BIGSERIAL PRIMARY KEY,client_id BIGINT NOT NULL REFERENCES portal_clients(id),
 actor_id TEXT NOT NULL,action TEXT NOT NULL,reason TEXT NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 300),
 details JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS portal_client_plan_operations (
 id UUID PRIMARY KEY,client_id BIGINT NOT NULL REFERENCES portal_clients(id),
 actor_id TEXT NOT NULL,payload JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One shared balance definition used by Node and Python. No reporting fees or
-- usage-reset flags can silently consume or replenish a purchased allowance.
CREATE OR REPLACE VIEW portal_client_plan_balances AS
 SELECT m.client_id,m.period,m.monthly_price,m.included_credits,m.activated_at,
 COALESCE((SELECT SUM(t.credits) FROM portal_client_plan_topups t WHERE t.client_id=m.client_id AND t.period=m.period),0) AS extra_credits,
 COALESCE((SELECT SUM(u.credits_used) FROM portal_client_plan_runs u WHERE u.client_id=m.client_id AND u.period=m.period AND u.status='settled'),0) AS used_credits
 FROM portal_client_plan_months m;
