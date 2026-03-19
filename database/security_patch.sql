-- ═══════════════════════════════════════════════════════════
-- ADE-LedgerFlow™ — Security Patch SQL
-- Run in Supabase SQL Editor AFTER schema_additions.sql
-- Fixes all vulnerabilities identified in security audit
-- ═══════════════════════════════════════════════════════════

-- ─── FIX: Change onboarding_data from TEXT to JSONB ──────────
-- Allows direct key queries, faster parsing, type enforcement
-- Safe: IF already JSONB this is a no-op
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='clients' AND column_name='onboarding_data'
    AND data_type='text'
  ) THEN
    ALTER TABLE clients
      ALTER COLUMN onboarding_data TYPE JSONB
      USING CASE
        WHEN onboarding_data IS NULL THEN NULL
        WHEN onboarding_data = '' THEN NULL
        ELSE onboarding_data::JSONB
      END;

    RAISE NOTICE 'onboarding_data migrated from TEXT to JSONB';
  ELSE
    RAISE NOTICE 'onboarding_data already JSONB — no action needed';
  END IF;
END $$;

-- ─── FIX: Clear any existing plaintext PINs in onboarding_data ─
-- If anyone was mid-onboarding under the old code, their plaintext
-- PIN may be in onboarding_data. Reset them to re-enter.
UPDATE clients
SET onboarding_state = 'pin1',
    onboarding_data  = NULL
WHERE onboarding_state = 'pin2'
  AND onboarding_data IS NOT NULL
  AND (
    -- Old format had pin_temp (plaintext) — detect and clear
    onboarding_data::text LIKE '%pin_temp%'
  );

-- ─── FIX: Clear stale onboarding sessions older than 24 hours ──
UPDATE clients
SET onboarding_state = 'awaiting_start',
    onboarding_data  = NULL
WHERE onboarded = FALSE
  AND onboarding_state NOT IN ('awaiting_start','complete')
  AND updated_at < NOW() - INTERVAL '24 hours';

-- ─── FIX: Remove SET_VIA_DASHBOARD placeholder if it exists ────
-- Prevent fake owner login via placeholder PIN string
UPDATE system_admins
SET status = 'pending_setup'
WHERE pin_hash = 'SET_VIA_DASHBOARD'
  AND status = 'active';

-- After running this, run:
--   node scripts/setup-admin-pin.js
-- to set a real hashed PIN for the owner account.

-- ─── SCHEDULED CLEANUP FUNCTION (Postgres cron alternative) ───
-- Can be called from your scheduler.js via db.query()
-- Or set up as a pg_cron job in Supabase if available
CREATE OR REPLACE FUNCTION cleanup_stale_onboarding()
RETURNS INTEGER AS $$
DECLARE
  cleared INTEGER;
BEGIN
  UPDATE clients
  SET onboarding_state = 'awaiting_start',
      onboarding_data  = NULL
  WHERE onboarded = FALSE
    AND onboarding_state NOT IN ('awaiting_start','complete')
    AND updated_at < NOW() - INTERVAL '24 hours';

  GET DIAGNOSTICS cleared = ROW_COUNT;
  RETURN cleared;
END;
$$ LANGUAGE plpgsql;

-- ─── VERIFY FIXES APPLIED ────────────────────────────────────
SELECT
  column_name,
  data_type,
  character_maximum_length
FROM information_schema.columns
WHERE table_name = 'clients'
  AND column_name IN ('onboarding_data', 'onboarding_state', 'pin_hash')
ORDER BY column_name;

-- Expected result:
-- onboarding_data  | jsonb | NULL     ← was 'text' before
-- onboarding_state | text  | NULL
-- pin_hash         | text  | NULL