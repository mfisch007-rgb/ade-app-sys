-- ═══════════════════════════════════════════════════════════
-- LEDGERFLOW AaaS — COMPLETE DATABASE SCHEMA v2
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New Query
-- Includes ALL tables: base + 6 tables missing from v1
-- ═══════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- PLANS — subscription tier definitions with feature gates
-- (GAP-01 fix: was missing from v1 schema)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  code          TEXT UNIQUE NOT NULL,        -- 'MICRO', 'PRO', 'SME'
  price_monthly INTEGER NOT NULL,            -- in Naira kobo (₦5000 = 5000)
  features      TEXT[] DEFAULT '{}',         -- array of allowed command strings
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Default plan data (run once)
INSERT INTO plans(name, code, price_monthly, features) VALUES
('Micro', 'MICRO', 5000,
  ARRAY['SALE','EXPENSE','CAPITAL','BAL','BALANCE','REPORT','HELP','HISTORY','TOP','START','SUBSTATUS','CONTACT']),
('Pro',   'PRO',   10000,
  ARRAY['MICRO_ALL','STOCK','CREDIT','PAYMENT','WEEK','CREDIT_LIST']),
('SME',   'SME',   25000,
  ARRAY['PRO_ALL','DRUGSTOCK','DRUGSALE','CONTRIB','TRANSFER','WITHDRAW','MONTH'])
ON CONFLICT(code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- CLIENTS — every registered business
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone                   TEXT UNIQUE NOT NULL,
  business_name           TEXT,
  owner_name              TEXT,
  sheet_id                TEXT,
  plan                    TEXT DEFAULT 'trial'
                            CHECK (plan IN ('trial','MICRO','PRO','SME')),
  status                  TEXT DEFAULT 'trial'
                            CHECK (status IN ('trial','active','suspended','expired','banned')),
  currency_symbol         TEXT DEFAULT '₦',
  currency_code           TEXT DEFAULT 'NGN',
  language                TEXT DEFAULT 'en',
  timezone                TEXT DEFAULT 'Africa/Lagos',
  -- Gamification
  streak_count            INTEGER DEFAULT 0,
  longest_streak          INTEGER DEFAULT 0,
  last_transaction_date   DATE,
  health_score            INTEGER DEFAULT 100 CHECK (health_score BETWEEN 0 AND 100),
  total_transactions      INTEGER DEFAULT 0,
  -- Subscription
  trial_ends_at           TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  subscription_expires_at TIMESTAMPTZ,
  subscription_started_at TIMESTAMPTZ,
  -- Security
  failed_attempts         INTEGER DEFAULT 0,
  locked_until            TIMESTAMPTZ,
  pin_hash                TEXT,             -- bcrypt hash of client PIN (future)
  -- Metadata
  onboarded               BOOLEAN DEFAULT FALSE,
  referred_by             TEXT,
  notes                   TEXT,
  last_activity_at        TIMESTAMPTZ DEFAULT NOW(),
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_phone  ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);

-- ─────────────────────────────────────────────────────────────
-- TRANSACTIONS — every financial event
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,
  phone           TEXT NOT NULL,
  type            TEXT NOT NULL
                    CHECK (type IN ('SALE','EXPENSE','STOCK','CREDIT','PAYMENT',
                                   'CAPITAL','WITHDRAW','TRANSFER','CONTRIB',
                                   'DRUGSTOCK','DRUGSALE','BUY')),
  amount          DECIMAL(15,2) DEFAULT 0,
  quantity        DECIMAL(10,2),
  item            TEXT,
  person          TEXT,
  bank            TEXT,                     -- for TRANSFER
  contrib_type    TEXT,                     -- for CONTRIB: DAILY/WEEKLY/MONTHLY
  notes           TEXT,
  raw_message     TEXT,
  lang_detected   TEXT DEFAULT 'en',
  sheet_row       INTEGER,
  processed       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_client ON transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_transactions_phone  ON transactions(phone);
CREATE INDEX IF NOT EXISTS idx_transactions_type   ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_date   ON transactions(created_at);

-- ─────────────────────────────────────────────────────────────
-- SUMMARIES — pre-computed daily/weekly/monthly aggregates
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS summaries (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id           UUID REFERENCES clients(id) ON DELETE CASCADE,
  phone               TEXT NOT NULL,
  summary_date        DATE NOT NULL,
  summary_type        TEXT DEFAULT 'daily' CHECK (summary_type IN ('daily','weekly','monthly')),
  total_sales         DECIMAL(15,2) DEFAULT 0,
  total_expenses      DECIMAL(15,2) DEFAULT 0,
  net_profit          DECIMAL(15,2) DEFAULT 0,
  total_credit        DECIMAL(15,2) DEFAULT 0,
  total_payments      DECIMAL(15,2) DEFAULT 0,
  transaction_count   INTEGER DEFAULT 0,
  health_score        INTEGER,
  streak_at_time      INTEGER DEFAULT 0,
  sent_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, summary_date, summary_type)
);

-- ─────────────────────────────────────────────────────────────
-- CREDITS — credit/debt ledger
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credits (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,
  debtor_name     TEXT NOT NULL,
  original_amount DECIMAL(15,2) NOT NULL,
  amount_paid     DECIMAL(15,2) DEFAULT 0,
  balance_owed    DECIMAL(15,2) NOT NULL,
  status          TEXT DEFAULT 'open' CHECK (status IN ('open','partial','settled','written_off')),
  due_date        DATE,
  reminded_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credits_client ON credits(client_id);
CREATE INDEX IF NOT EXISTS idx_credits_status ON credits(status);

-- ─────────────────────────────────────────────────────────────
-- NOTIFICATIONS — pending WhatsApp messages
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  notification_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id         UUID REFERENCES clients(id) ON DELETE CASCADE,
  phone             TEXT NOT NULL,           -- phone stored directly (no join needed)
  message           TEXT NOT NULL,
  channel           TEXT DEFAULT 'whatsapp',
  status            TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  notification_type TEXT DEFAULT 'general',
  scheduled_for     TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ,
  retry_count       INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_phone  ON notifications(phone);

-- ─────────────────────────────────────────────────────────────
-- MILESTONES — achievement badges
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS milestones (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,
  milestone_type  TEXT NOT NULL,
  milestone_value DECIMAL(15,2),
  celebrated      BOOLEAN DEFAULT FALSE,
  achieved_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- AGENTS — multi-staff support (PRO/SME plans)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  agent_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id   UUID REFERENCES clients(id) ON DELETE CASCADE,
  phone       TEXT UNIQUE NOT NULL,
  name        TEXT,
  role        TEXT DEFAULT 'cashier' CHECK (role IN ('cashier','manager','owner')),
  status      TEXT DEFAULT 'active' CHECK (status IN ('active','suspended','removed')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- FRAUD_ALERTS — suspicious activity
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fraud_alerts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,
  agent_id        UUID REFERENCES agents(agent_id),
  alert_type      TEXT NOT NULL,
  description     TEXT,
  severity        TEXT DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  resolved        BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- COMMAND_LOGS — audit trail of every message processed
-- (GAP-02 fix: was missing from v1 schema)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS command_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
  phone           TEXT NOT NULL,
  raw_command     TEXT,
  parsed_action   TEXT,
  status          TEXT DEFAULT 'success' CHECK (status IN ('success','failed','blocked','unknown')),
  error_msg       TEXT,
  lang_detected   TEXT DEFAULT 'en',
  response_ms     INTEGER,                  -- response time in milliseconds
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_command_logs_phone  ON command_logs(phone);
CREATE INDEX IF NOT EXISTS idx_command_logs_date   ON command_logs(created_at);

-- ─────────────────────────────────────────────────────────────
-- SUPPORT_TICKETS — client support requests
-- (GAP-03 fix: was missing from v1 schema)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
  phone       TEXT NOT NULL,
  issue       TEXT NOT NULL,
  status      TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────────────────
-- BLOCKED_IPS — IP address blocks
-- (GAP-04 fix: was missing from v1 schema)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocked_ips (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ip_address  TEXT UNIQUE NOT NULL,
  reason      TEXT,
  blocked_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ               -- null = permanent
);

-- ─────────────────────────────────────────────────────────────
-- SECURITY_LOGS — security event audit trail
-- (GAP-05 fix: was missing from v1 schema)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
  phone       TEXT,
  action      TEXT NOT NULL,            -- 'LOGIN_SUCCESS', 'ACCOUNT_LOCKED', etc
  ip_address  TEXT,
  risk_score  INTEGER DEFAULT 0,
  details     JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_logs_phone  ON security_logs(phone);
CREATE INDEX IF NOT EXISTS idx_security_logs_action ON security_logs(action);

-- ─────────────────────────────────────────────────────────────
-- API_KEYS — for future ADE API access and payment webhooks
-- (GAP-06 fix: was missing from v1 schema)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id     UUID REFERENCES clients(id) ON DELETE CASCADE,
  api_key_hash  TEXT NOT NULL,          -- SHA256 of raw key (never store raw)
  label         TEXT,                   -- e.g. "Paystack webhook", "Admin panel"
  active        BOOLEAN DEFAULT TRUE,
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- DRUG_INVENTORY — for pharmacy/chemist clients (SME plan)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drug_inventory (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id   UUID REFERENCES clients(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  quantity    DECIMAL(10,2) DEFAULT 0,
  cost        DECIMAL(15,2) DEFAULT 0,
  low_stock_alert INTEGER DEFAULT 5,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, name)
);

-- ─────────────────────────────────────────────────────────────
-- STOCK_INVENTORY — for product/retail clients (PRO/SME plan)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_inventory (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,
  item_name       TEXT NOT NULL,
  quantity        DECIMAL(10,2) DEFAULT 0,
  cost_per_unit   DECIMAL(15,2) DEFAULT 0,
  low_stock_alert INTEGER DEFAULT 5,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, item_name)
);

-- ─────────────────────────────────────────────────────────────
-- AUTO-UPDATED updated_at TRIGGER
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER clients_updated_at
    BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER credits_updated_at
    BEFORE UPDATE ON credits FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER stock_updated_at
    BEFORE UPDATE ON stock_inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER drug_updated_at
    BEFORE UPDATE ON drug_inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────
-- VIEWS — handy shortcuts
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_client_today AS
SELECT
  c.id, c.phone, c.business_name, c.plan, c.status,
  c.streak_count, c.health_score, c.currency_symbol,
  COALESCE(SUM(CASE WHEN t.type='SALE'    THEN t.amount END), 0) AS today_sales,
  COALESCE(SUM(CASE WHEN t.type='EXPENSE' THEN t.amount END), 0) AS today_expenses,
  COALESCE(SUM(CASE WHEN t.type='SALE'    THEN t.amount END), 0) -
  COALESCE(SUM(CASE WHEN t.type='EXPENSE' THEN t.amount END), 0) AS today_profit,
  COUNT(t.id) AS today_tx_count
FROM clients c
LEFT JOIN transactions t ON t.client_id = c.id
  AND DATE(t.created_at AT TIME ZONE 'Africa/Lagos') = CURRENT_DATE
WHERE c.status IN ('active', 'trial')
GROUP BY c.id;

CREATE OR REPLACE VIEW v_open_credits AS
SELECT
  client_id,
  COUNT(*) AS debtor_count,
  SUM(balance_owed) AS total_owed
FROM credits
WHERE status IN ('open','partial')
GROUP BY client_id;

-- ═══════════════════════════════════════════════════════════
-- TABLES CREATED (run DESCRIBE TABLE in Supabase to verify):
-- plans, clients, transactions, summaries, credits,
-- notifications, milestones, agents, fraud_alerts,
-- command_logs, support_tickets, blocked_ips, security_logs,
-- api_keys, drug_inventory, stock_inventory
-- ═══════════════════════════════════════════════════════════
