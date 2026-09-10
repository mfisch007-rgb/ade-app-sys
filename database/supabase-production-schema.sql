-- ============================================================================
-- ADE APEX Community Edition - Supabase Production Schema
-- ============================================================================
-- Migration: 001_initial_production_schema
-- Description: Complete durable storage schema for ADE APEX CE on Supabase/Postgres.
--              Covers key-value store (StorageProvider), dedicated relational
--              tables for core entities, RLS policies, indexes, triggers, and
--              constraints. Run inside the Supabase SQL editor or via
--              `supabase db push` / `supabase migration up`.
--
-- IMPORTANT: This file contains NO secrets, keys, or passwords.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ade_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper to auto-set updated_at on INSERT (for created_at/updated_at columns)
CREATE OR REPLACE FUNCTION ade_set_created_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_at IS NULL THEN
    NEW.created_at = NOW();
  END IF;
  IF NEW.updated_at IS NULL THEN
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. KEY-VALUE STORE  (StorageProvider contract)
-- ============================================================================
-- Generic key-value table used by SupabaseStorageAdapter. Every row is a
-- JSON document keyed by an opaque string. This is the fallback / catch-all
-- for any entity not broken out into a dedicated table.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ade_kv_store (
  k          TEXT PRIMARY KEY,
  v          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ade_kv_store IS 'Key-value store backing the StorageProvider contract.';

CREATE TRIGGER trg_ade_kv_store_updated_at
  BEFORE UPDATE ON ade_kv_store
  FOR EACH ROW EXECUTE FUNCTION ade_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ade_kv_store_updated_at ON ade_kv_store (updated_at);

-- RLS: enable but default-deny; service role / functions bypass RLS.
ALTER TABLE ade_kv_store ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. DEDICATED RELATIONAL TABLES
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 2.1 ade_organizations
-- ---------------------------------------------------------------------------
-- Organisation profiles (tenants).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ade_organizations (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  legal_name TEXT,
  website    TEXT,
  country    TEXT,
  region     TEXT,
  type       TEXT NOT NULL DEFAULT 'business',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ade_organizations IS 'Organisation profiles – the top-level tenant entity.';

CREATE TRIGGER trg_ade_organizations_updated_at
  BEFORE UPDATE ON ade_organizations
  FOR EACH ROW EXECUTE FUNCTION ade_set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS uq_ade_organizations_name ON ade_organizations (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_ade_organizations_country ON ade_organizations (country);
CREATE INDEX IF NOT EXISTS idx_ade_organizations_type    ON ade_organizations (type);

ALTER TABLE ade_organizations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2.2 ade_persons
-- ---------------------------------------------------------------------------
-- Workforce persons (users, operators, admins).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ade_persons (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username          TEXT NOT NULL,
  full_name         TEXT NOT NULL,
  email             TEXT,
  role              TEXT NOT NULL DEFAULT 'operator',
  level             TEXT NOT NULL DEFAULT 'L1',
  status            TEXT NOT NULL DEFAULT 'active',
  organization_id   UUID REFERENCES ade_organizations(id) ON DELETE SET NULL,
  supervisor_id     UUID REFERENCES ade_persons(id) ON DELETE SET NULL,
  password_hash     TEXT,
  pin_hash          TEXT,
  pin_salt          TEXT,
  access_expiry_at  TIMESTAMPTZ,
  credential_version INTEGER NOT NULL DEFAULT 1,
  created_by        UUID REFERENCES ade_persons(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at     TIMESTAMPTZ
);

COMMENT ON TABLE ade_persons IS 'Workforce persons – users who can authenticate and interact with the system.';

CREATE TRIGGER trg_ade_persons_updated_at
  BEFORE UPDATE ON ade_persons
  FOR EACH ROW EXECUTE FUNCTION ade_set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS uq_ade_persons_username   ON ade_persons (LOWER(username));
CREATE UNIQUE INDEX IF NOT EXISTS uq_ade_persons_email      ON ade_persons (LOWER(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ade_persons_org              ON ade_persons (organization_id);
CREATE INDEX IF NOT EXISTS idx_ade_persons_supervisor       ON ade_persons (supervisor_id);
CREATE INDEX IF NOT EXISTS idx_ade_persons_role             ON ade_persons (role);
CREATE INDEX IF NOT EXISTS idx_ade_persons_status           ON ade_persons (status);

ALTER TABLE ade_persons ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2.3 ade_invitations
-- ---------------------------------------------------------------------------
-- Pending invitations to join the platform.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ade_invitations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id     UUID REFERENCES ade_persons(id) ON DELETE CASCADE,
  invite_code   TEXT NOT NULL,
  invite_hash   TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'operator',
  organization_id UUID REFERENCES ade_organizations(id) ON DELETE SET NULL,
  created_by    UUID REFERENCES ade_persons(id) ON DELETE SET NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  accepted_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ade_invitations IS 'Pending invitations – invite codes issued to prospective members.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_ade_invitations_code ON ade_invitations (invite_code);
CREATE INDEX IF NOT EXISTS idx_ade_invitations_person    ON ade_invitations (person_id);
CREATE INDEX IF NOT EXISTS idx_ade_invitations_org       ON ade_invitations (organization_id);
CREATE INDEX IF NOT EXISTS idx_ade_invitations_expires   ON ade_invitations (expires_at) WHERE accepted_at IS NULL;

ALTER TABLE ade_invitations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2.4 ade_recovery_codes
-- ---------------------------------------------------------------------------
-- One-time recovery codes for account recovery.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ade_recovery_codes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id  UUID NOT NULL REFERENCES ade_persons(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ade_recovery_codes IS 'Recovery codes – one-time-use codes for account recovery.';

CREATE INDEX IF NOT EXISTS idx_ade_recovery_codes_person ON ade_recovery_codes (person_id);
CREATE INDEX IF NOT EXISTS idx_ade_recovery_codes_active ON ade_recovery_codes (person_id) WHERE NOT used;

ALTER TABLE ade_recovery_codes ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2.5 ade_sessions
-- ---------------------------------------------------------------------------
-- Active authentication sessions.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ade_sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id    UUID NOT NULL REFERENCES ade_persons(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL,
  level        TEXT NOT NULL DEFAULT 'session',
  persona      TEXT NOT NULL DEFAULT 'default',
  pin_verified BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ade_sessions IS 'Active sessions – tracks authenticated user sessions.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_ade_sessions_token  ON ade_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_ade_sessions_person      ON ade_sessions (person_id);
CREATE INDEX IF NOT EXISTS idx_ade_sessions_expires     ON ade_sessions (expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ade_sessions_active      ON ade_sessions (person_id) WHERE revoked_at IS NULL AND expires_at > NOW();

ALTER TABLE ade_sessions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2.6 ade_agents
-- ---------------------------------------------------------------------------
-- AI agent identities.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ade_agents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  purpose       TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  created_by    UUID REFERENCES ade_persons(id) ON DELETE SET NULL,
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ade_agents IS 'AI agent identities – registered agents that can act on behalf of the system.';

CREATE TRIGGER trg_ade_agents_updated_at
  BEFORE UPDATE ON ade_agents
  FOR EACH ROW EXECUTE FUNCTION ade_set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS uq_ade_agents_name ON ade_agents (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_ade_agents_status    ON ade_agents (status);

ALTER TABLE ade_agents ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2.7 ade_cases
-- ---------------------------------------------------------------------------
-- Business cases / intake records.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ade_cases (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel      TEXT,
  organization TEXT,
  email        TEXT,
  status       TEXT NOT NULL DEFAULT 'new',
  confidence   NUMERIC(5,2),
  intent       TEXT,
  request      TEXT,
  discovery    TEXT,
  next_action  TEXT,
  transitions  JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ade_cases IS 'Business cases – intake records for requests, enquiries, and engagements.';

CREATE TRIGGER trg_ade_cases_updated_at
  BEFORE UPDATE ON ade_cases
  FOR EACH ROW EXECUTE FUNCTION ade_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ade_cases_status       ON ade_cases (status);
CREATE INDEX IF NOT EXISTS idx_ade_cases_channel      ON ade_cases (channel);
CREATE INDEX IF NOT EXISTS idx_ade_cases_org          ON ade_cases (LOWER(organization));
CREATE INDEX IF NOT EXISTS idx_ade_cases_created      ON ade_cases (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ade_cases_metadata     ON ade_cases USING GIN (metadata);

ALTER TABLE ade_cases ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2.8 ade_pilot_registrations
-- ---------------------------------------------------------------------------
-- Pilot records linked to cases.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ade_pilot_registrations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id           UUID REFERENCES ade_cases(id) ON DELETE SET NULL,
  organization_id   UUID REFERENCES ade_organizations(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  baseline_metrics  JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_metrics     JSONB NOT NULL DEFAULT '{}'::jsonb,
  improvement_score NUMERIC(7,2),
  evidence          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by        UUID REFERENCES ade_persons(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ade_pilot_registrations IS 'Pilot registrations – before/after pilot programme records.';

CREATE TRIGGER trg_ade_pilot_registrations_updated_at
  BEFORE UPDATE ON ade_pilot_registrations
  FOR EACH ROW EXECUTE FUNCTION ade_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ade_pilots_case    ON ade_pilot_registrations (case_id);
CREATE INDEX IF NOT EXISTS idx_ade_pilots_org     ON ade_pilot_registrations (organization_id);
CREATE INDEX IF NOT EXISTS idx_ade_pilots_status  ON ade_pilot_registrations (status);

ALTER TABLE ade_pilot_registrations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2.9 ade_partner_applications
-- ---------------------------------------------------------------------------
-- Partner application forms.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ade_partner_applications (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_name        TEXT NOT NULL,
  legal_name               TEXT,
  website                  TEXT,
  country                  TEXT,
  primary_contact          TEXT,
  business_email           TEXT,
  phone                    TEXT,
  partner_type             TEXT,
  capabilities             JSONB NOT NULL DEFAULT '[]'::jsonb,
  industries               JSONB NOT NULL DEFAULT '[]'::jsonb,
  countries_served         JSONB NOT NULL DEFAULT '[]'::jsonb,
  technical_capabilities   JSONB NOT NULL DEFAULT '[]'::jsonb,
  erp_experience           TEXT,
  implementation_capacity  TEXT,
  "references"             JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_products       JSONB NOT NULL DEFAULT '[]'::jsonb,
  commercial_model         TEXT,
  nda_status               TEXT NOT NULL DEFAULT 'pending',
  verification_status      TEXT NOT NULL DEFAULT 'pending',
  proposed_role            TEXT,
  screening_status         TEXT NOT NULL DEFAULT 'pending',
  screening_notes          TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ade_partner_applications IS 'Partner applications – submitted partner onboarding forms.';

CREATE TRIGGER trg_ade_partner_applications_updated_at
  BEFORE UPDATE ON ade_partner_applications
  FOR EACH ROW EXECUTE FUNCTION ade_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ade_partners_verification ON ade_partner_applications (verification_status);
CREATE INDEX IF NOT EXISTS idx_ade_partners_screening    ON ade_partner_applications (screening_status);
CREATE INDEX IF NOT EXISTS idx_ade_partners_country      ON ade_partner_applications (country);
CREATE INDEX IF NOT EXISTS idx_ade_partners_type         ON ade_partner_applications (partner_type);

ALTER TABLE ade_partner_applications ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2.10 ade_integrations
-- ---------------------------------------------------------------------------
-- External system integrations.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ade_integrations (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider       TEXT NOT NULL,
  type           TEXT NOT NULL DEFAULT 'api',
  base_url       TEXT,
  auth_type      TEXT NOT NULL DEFAULT 'none',
  secret_hash    TEXT,
  status         TEXT NOT NULL DEFAULT 'inactive',
  last_tested_at TIMESTAMPTZ,
  created_by     UUID REFERENCES ade_persons(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ade_integrations IS 'Integrations – external system connections (APIs, webhooks, etc.).';

CREATE TRIGGER trg_ade_integrations_updated_at
  BEFORE UPDATE ON ade_integrations
  FOR EACH ROW EXECUTE FUNCTION ade_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ade_integrations_provider ON ade_integrations (provider);
CREATE INDEX IF NOT EXISTS idx_ade_integrations_status   ON ade_integrations (status);

ALTER TABLE ade_integrations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2.11 ade_audit_log
-- ---------------------------------------------------------------------------
-- Immutable audit event log.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ade_audit_log (
  id         UUID NOT NULL DEFAULT uuid_generate_v4(),
  topic      TEXT NOT NULL,
  event_id   TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ade_audit_log IS 'Audit log – append-only record of system events.';

-- No updated_at trigger: audit rows are immutable after insert.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ade_audit_log_event ON ade_audit_log (event_id);
CREATE INDEX IF NOT EXISTS idx_ade_audit_log_topic      ON ade_audit_log (topic);
CREATE INDEX IF NOT EXISTS idx_ade_audit_log_created    ON ade_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ade_audit_log_payload    ON ade_audit_log USING GIN (payload);

-- Partitioning-friendly composite PK (topic + created_at) can be added later.
-- Primary key is (id) for now; event_id is the logical unique key.

ALTER TABLE ade_audit_log ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2.12 ade_announcements
-- ---------------------------------------------------------------------------
-- System announcements.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ade_announcements (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind       TEXT NOT NULL DEFAULT 'info',
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES ade_persons(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ade_announcements IS 'Announcements – platform-wide or targeted messages to users.';

CREATE TRIGGER trg_ade_announcements_updated_at
  BEFORE UPDATE ON ade_announcements
  FOR EACH ROW EXECUTE FUNCTION ade_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ade_announcements_active  ON ade_announcements (active) WHERE active;
CREATE INDEX IF NOT EXISTS idx_ade_announcements_expires ON ade_announcements (expires_at) WHERE active;

ALTER TABLE ade_announcements ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2.13 ade_feature_entitlements
-- ---------------------------------------------------------------------------
-- Feature-gate / entitlement table per edition.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ade_feature_entitlements (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feature_name        TEXT NOT NULL,
  edition             TEXT NOT NULL DEFAULT 'community',
  available           BOOLEAN NOT NULL DEFAULT FALSE,
  requires_external   BOOLEAN NOT NULL DEFAULT FALSE,
  requires_payment    BOOLEAN NOT NULL DEFAULT FALSE,
  dependencies        JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by          UUID REFERENCES ade_persons(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ade_feature_entitlements IS 'Feature entitlements – controls feature availability per edition/tier.';

CREATE TRIGGER trg_ade_feature_entitlements_updated_at
  BEFORE UPDATE ON ade_feature_entitlements
  FOR EACH ROW EXECUTE FUNCTION ade_set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS uq_ade_feature_entitlements
  ON ade_feature_entitlements (feature_name, edition);

CREATE INDEX IF NOT EXISTS idx_ade_feature_entitlements_edition ON ade_feature_entitlements (edition);

ALTER TABLE ade_feature_entitlements ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2.14 ade_media_assets
-- ---------------------------------------------------------------------------
-- Media / content assets.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ade_media_assets (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title                TEXT NOT NULL,
  description          TEXT,
  product              TEXT,
  language             TEXT NOT NULL DEFAULT 'en',
  category             TEXT,
  truth_classification TEXT,
  source               TEXT,
  version              TEXT NOT NULL DEFAULT '1.0',
  audience             TEXT,
  thumbnail_url        TEXT,
  media_url            TEXT,
  status               TEXT NOT NULL DEFAULT 'draft',
  created_by           UUID REFERENCES ade_persons(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ade_media_assets IS 'Media assets – documents, images, videos, and other content.';

CREATE TRIGGER trg_ade_media_assets_updated_at
  BEFORE UPDATE ON ade_media_assets
  FOR EACH ROW EXECUTE FUNCTION ade_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ade_media_product    ON ade_media_assets (product);
CREATE INDEX IF NOT EXISTS idx_ade_media_category   ON ade_media_assets (category);
CREATE INDEX IF NOT EXISTS idx_ade_media_status     ON ade_media_assets (status);
CREATE INDEX IF NOT EXISTS idx_ade_media_language   ON ade_media_assets (language);
CREATE INDEX IF NOT EXISTS idx_ade_media_audience   ON ade_media_assets (audience);

ALTER TABLE ade_media_assets ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2.15 ade_notifications
-- ---------------------------------------------------------------------------
-- User notifications.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ade_notifications (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type         TEXT NOT NULL DEFAULT 'info',
  recipient_id UUID NOT NULL REFERENCES ade_persons(id) ON DELETE CASCADE,
  message      TEXT NOT NULL,
  read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ade_notifications IS 'Notifications – user-facing notification messages.';

CREATE INDEX IF NOT EXISTS idx_ade_notifications_recipient ON ade_notifications (recipient_id);
CREATE INDEX IF NOT EXISTS idx_ade_notifications_unread    ON ade_notifications (recipient_id) WHERE NOT read;
CREATE INDEX IF NOT EXISTS idx_ade_notifications_created   ON ade_notifications (created_at DESC);

ALTER TABLE ade_notifications ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2.16 ade_business_measurements
-- ---------------------------------------------------------------------------
-- Before/after metric measurements for pilots and cases.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ade_business_measurements (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id           UUID REFERENCES ade_cases(id) ON DELETE SET NULL,
  pilot_id          UUID REFERENCES ade_pilot_registrations(id) ON DELETE SET NULL,
  metric_name       TEXT NOT NULL,
  baseline_value    NUMERIC(14,4),
  after_value       NUMERIC(14,4),
  absolute_change   NUMERIC(14,4),
  percentage_change NUMERIC(7,2),
  evidence          JSONB NOT NULL DEFAULT '[]'::jsonb,
  measurement_period TEXT,
  confidence        NUMERIC(5,2),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ade_business_measurements IS 'Business measurements – quantified before/after metric comparisons.';

CREATE INDEX IF NOT EXISTS idx_ade_measurements_case  ON ade_business_measurements (case_id);
CREATE INDEX IF NOT EXISTS idx_ade_measurements_pilot ON ade_business_measurements (pilot_id);
CREATE INDEX IF NOT EXISTS idx_ade_measurements_metric ON ade_business_measurements (metric_name);

ALTER TABLE ade_business_measurements ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2.17 ade_feature_requests
-- ---------------------------------------------------------------------------
-- Feature / monetization requests from users.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ade_feature_requests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES ade_persons(id) ON DELETE SET NULL,
  feature_name  TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'submitted',
  quote_amount  NUMERIC(12,2),
  approved_by   UUID REFERENCES ade_persons(id) ON DELETE SET NULL,
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ade_feature_requests IS 'Feature requests – user-submitted feature or monetization requests.';

CREATE INDEX IF NOT EXISTS idx_ade_feature_requests_user   ON ade_feature_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_ade_feature_requests_status ON ade_feature_requests (status);
CREATE INDEX IF NOT EXISTS idx_ade_feature_requests_created ON ade_feature_requests (created_at DESC);

ALTER TABLE ade_feature_requests ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2.18 ade_market_connections
-- ---------------------------------------------------------------------------
-- Forex / market data connections.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ade_market_connections (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_type TEXT NOT NULL DEFAULT 'forex',
  provider        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'inactive',
  last_sync_at    TIMESTAMPTZ,
  created_by      UUID REFERENCES ade_persons(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ade_market_connections IS 'Market connections – external forex / market data provider connections.';

CREATE INDEX IF NOT EXISTS idx_ade_market_status    ON ade_market_connections (status);
CREATE INDEX IF NOT EXISTS idx_ade_market_provider  ON ade_market_connections (provider);
CREATE INDEX IF NOT EXISTS idx_ade_market_type      ON ade_market_connections (connection_type);

ALTER TABLE ade_market_connections ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. ROW-LEVEL SECURITY POLICIES
-- ============================================================================
-- Default policy: allow authenticated users to read all rows.
-- Write operations (INSERT/UPDATE/DELETE) are restricted to service_role
-- (which bypasses RLS) or to specific role-based policies as needed.
-- ============================================================================

-- Helper: authenticated read policy (applies to all tables)
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'ade_kv_store',
    'ade_organizations',
    'ade_persons',
    'ade_invitations',
    'ade_recovery_codes',
    'ade_sessions',
    'ade_agents',
    'ade_cases',
    'ade_pilot_registrations',
    'ade_partner_applications',
    'ade_integrations',
    'ade_audit_log',
    'ade_announcements',
    'ade_feature_entitlements',
    'ade_media_assets',
    'ade_notifications',
    'ade_business_measurements',
    'ade_feature_requests',
    'ade_market_connections'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Allow authenticated users to SELECT
    EXECUTE format(
      'CREATE POLICY "%s_select_auth" ON %I FOR SELECT TO authenticated USING (TRUE)',
      tbl, tbl
    );

    -- Allow service_role full access (INSERT/UPDATE/DELETE)
    EXECUTE format(
      'CREATE POLICY "%s_service_all" ON %I FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE)',
      tbl, tbl
    );
  END LOOP;
END $$;

-- Notifications: recipients can read only their own rows
CREATE POLICY "ade_notifications_recipient_select"
  ON ade_notifications FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

-- Audit log: authenticated can read (append-only, no UPDATE/DELETE via RLS)
-- Already covered by the authenticated SELECT policy above.

-- ============================================================================
-- 4. SEED / INITIAL DATA
-- ============================================================================
-- Insert default feature entitlements for the Community Edition.
-- ============================================================================

INSERT INTO ade_feature_entitlements (feature_name, edition, available, requires_external, requires_payment, dependencies)
VALUES
  ('voice',            'community', TRUE,  FALSE, FALSE, '[]'::jsonb),
  ('video',            'community', TRUE,  FALSE, FALSE, '[]'::jsonb),
  ('multi_language',   'community', TRUE,  FALSE, FALSE, '[]'::jsonb),
  ('erp_integration',  'community', FALSE, TRUE,  FALSE, '["erp_connector"]'::jsonb),
  ('market_data',      'community', FALSE, TRUE,  FALSE, '["market_connection"]'::jsonb),
  ('pilot_programme',  'community', TRUE,  FALSE, FALSE, '[]'::jsonb),
  ('partner_portal',   'community', TRUE,  FALSE, FALSE, '[]'::jsonb),
  ('audit_log',        'community', TRUE,  FALSE, FALSE, '[]'::jsonb),
  ('notifications',    'community', TRUE,  FALSE, FALSE, '[]'::jsonb),
  ('media_library',    'community', TRUE,  FALSE, FALSE, '[]'::jsonb),
  ('advanced_analytics','community',FALSE, FALSE, TRUE,  '[]'::jsonb),
  ('white_label',      'community', FALSE, FALSE, TRUE,  '[]'::jsonb)
ON CONFLICT (feature_name, edition) DO NOTHING;

-- ============================================================================
-- 5. GRANT PERMISSIONS (Supabase defaults)
-- ============================================================================
-- Grant basic usage to Supabase roles. Adjust as needed for your project.
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
