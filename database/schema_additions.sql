-- ═══════════════════════════════════════════════════════════
-- ADE-LedgerFlow™ — SCHEMA ADDITIONS
-- Run this AFTER the main schema.sql
-- Adds: system_admins, onboarding_state columns, number-change support
-- ═══════════════════════════════════════════════════════════

-- ─── SYSTEM ADMINS TABLE ─────────────────────────────────────
-- Separate from clients — these are ADE staff members
CREATE TABLE IF NOT EXISTS system_admins (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('OWNER','SENIOR_ADMIN','ADMIN','MARKETER','SUPPORT')),
  pin_hash      TEXT NOT NULL,
  status        TEXT DEFAULT 'active' CHECK (status IN ('active','suspended','removed')),
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Insert the owner (you) — set PIN hash after first run
-- The pin 'CHANGE_ME' will be replaced once you login and set PIN via dashboard
INSERT INTO system_admins(phone, name, role, pin_hash, status)
VALUES ('2347038272792', 'System Owner', 'OWNER', 'SET_VIA_DASHBOARD', 'active')
ON CONFLICT(phone) DO NOTHING;

-- ─── ADD ONBOARDING STATE TO CLIENTS ─────────────────────────
-- Tracks where each client is in the START → PIN setup flow
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS onboarding_state TEXT DEFAULT 'awaiting_start',
  ADD COLUMN IF NOT EXISTS onboarding_data  TEXT,   -- temporary PIN storage during setup
  ADD COLUMN IF NOT EXISTS onboarded_by     TEXT;   -- phone of admin/marketer who onboarded them

-- ─── NUMBER PORTABILITY ───────────────────────────────────────
-- All financial data is linked via client_id (UUID), NOT phone.
-- This table tracks number changes for audit purposes only.
-- Subscriptions, transactions, credits, milestones ALL stay intact.
CREATE TABLE IF NOT EXISTS phone_change_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id   UUID REFERENCES clients(id) ON DELETE CASCADE,
  old_phone   TEXT NOT NULL,
  new_phone   TEXT NOT NULL,
  changed_by  TEXT,    -- admin phone who made the change
  reason      TEXT,
  changed_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── VERIFY EXISTING INDEXES ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clients_onboarded_by ON clients(onboarded_by);
CREATE INDEX IF NOT EXISTS idx_system_admins_phone   ON system_admins(phone);
CREATE INDEX IF NOT EXISTS idx_system_admins_role    ON system_admins(role);

-- ─── CONFIRM TABLES EXIST ────────────────────────────────────
-- After running, you should see in Supabase Table Editor:
-- system_admins, phone_change_log
-- And clients table should have new columns:
-- onboarding_state, onboarding_data, onboarded_by
