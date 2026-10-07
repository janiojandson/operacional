-- Existing rows retain LEGACY. Snapshots are filled by storage only when absent.
ALTER TABLE paper_master_orders
  ADD COLUMN IF NOT EXISTS partial_fee_usd NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exit_policy TEXT NOT NULL DEFAULT 'LEGACY' CHECK (exit_policy IN ('LEGACY', 'FIXED_3R')),
  ADD COLUMN IF NOT EXISTS initial_stop_loss NUMERIC,
  ADD COLUMN IF NOT EXISTS initial_qty NUMERIC,
  ADD COLUMN IF NOT EXISTS initial_notional_usd NUMERIC,
  ADD COLUMN IF NOT EXISTS initial_risk_usd NUMERIC;

-- Autocommit this statement before writing a FIXED_TP event.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'exit_reason_enum') THEN
    ALTER TYPE exit_reason_enum ADD VALUE IF NOT EXISTS 'FIXED_TP';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'branch_enum') THEN
    ALTER TYPE branch_enum ADD VALUE IF NOT EXISTS 'B9_FIXED_TARGET';
  END IF;
END $$;

ALTER TABLE trade_events ADD COLUMN IF NOT EXISTS initial_risk_usd NUMERIC;
ALTER TABLE trade_history
  ADD COLUMN IF NOT EXISTS exit_policy TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN IF NOT EXISTS initial_stop_loss NUMERIC,
  ADD COLUMN IF NOT EXISTS initial_qty NUMERIC,
  ADD COLUMN IF NOT EXISTS initial_notional_usd NUMERIC,
  ADD COLUMN IF NOT EXISTS initial_risk_usd NUMERIC,
  ADD COLUMN IF NOT EXISTS initial_target_price NUMERIC,
  ADD COLUMN IF NOT EXISTS protection_status TEXT NOT NULL DEFAULT 'LEGACY';
ALTER TABLE paper_mirror_orders
  ADD COLUMN IF NOT EXISTS exit_policy TEXT NOT NULL DEFAULT 'LEGACY' CHECK (exit_policy IN ('LEGACY', 'FIXED_3R')),
  ADD COLUMN IF NOT EXISTS initial_stop_loss NUMERIC,
  ADD COLUMN IF NOT EXISTS initial_qty NUMERIC,
  ADD COLUMN IF NOT EXISTS initial_notional_usd NUMERIC,
  ADD COLUMN IF NOT EXISTS initial_risk_usd NUMERIC;
