-- Forensic hardening: decision/trade correlation, raw Laya payloads and BI-compatible fields.
ALTER TABLE decision_events
  ADD COLUMN IF NOT EXISTS side VARCHAR(4),
  ADD COLUMN IF NOT EXISTS intent_group VARCHAR(30),
  ADD COLUMN IF NOT EXISTS intent_subgroup VARCHAR(40),
  ADD COLUMN IF NOT EXISTS requested_action VARCHAR(50),
  ADD COLUMN IF NOT EXISTS normalized_action VARCHAR(50),
  ADD COLUMN IF NOT EXISTS governance_mode VARCHAR(10),
  ADD COLUMN IF NOT EXISTS remote_choice VARCHAR(50),
  ADD COLUMN IF NOT EXISTS remote_verdict VARCHAR(50),
  ADD COLUMN IF NOT EXISTS rationale_code VARCHAR(120),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS executed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS constitution_rejected BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS execution_mode VARCHAR(30),
  ADD COLUMN IF NOT EXISTS request_payload JSONB,
  ADD COLUMN IF NOT EXISTS response_payload JSONB,
  ADD COLUMN IF NOT EXISTS attributed_r NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS delta_r NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS l2_depth_top20 NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS cvd_delta_60s NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS spoof_score NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS beta_divergence BOOLEAN;
UPDATE decision_events
SET issued_at = COALESCE(issued_at, created_at),
    expires_at = COALESCE(expires_at, created_at + INTERVAL '3 seconds')
WHERE issued_at IS NULL OR expires_at IS NULL;

ALTER TABLE trade_events
  ADD COLUMN IF NOT EXISTS entry_decision_id UUID,
  ADD COLUMN IF NOT EXISTS exit_decision_id UUID,
  ADD COLUMN IF NOT EXISTS exit_reason_raw VARCHAR(80),
  ADD COLUMN IF NOT EXISTS branch_classification_raw VARCHAR(80),
  ADD COLUMN IF NOT EXISTS mfe_r NUMERIC(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mae_r NUMERIC(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rv_ol NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS beta_exposure NUMERIC(8,4) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_decision_events_action_created
  ON decision_events(normalized_action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_events_intent_created
  ON decision_events(intent_group, intent_subgroup, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_events_trade_id
  ON decision_events(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_events_entry_decision
  ON trade_events(entry_decision_id);
CREATE INDEX IF NOT EXISTS idx_trade_events_exit_decision
  ON trade_events(exit_decision_id);

-- Reparação determinística do bug histórico: timestamps Unix em segundos foram
-- interpretados como milissegundos pelo construtor Date, resultando em 1970.
UPDATE trade_events
SET opened_at = to_timestamp(EXTRACT(EPOCH FROM opened_at) * 1000)
WHERE opened_at IS NOT NULL
  AND opened_at < TIMESTAMPTZ '2000-01-01 00:00:00+00';

UPDATE trade_events
SET closed_at = to_timestamp(EXTRACT(EPOCH FROM closed_at) * 1000)
WHERE closed_at IS NOT NULL
  AND closed_at < TIMESTAMPTZ '2000-01-01 00:00:00+00';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_trade_entry_decision'
  ) THEN
    ALTER TABLE trade_events
      ADD CONSTRAINT fk_trade_entry_decision
      FOREIGN KEY (entry_decision_id)
      REFERENCES decision_events(decision_id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_trade_exit_decision'
  ) THEN
    ALTER TABLE trade_events
      ADD CONSTRAINT fk_trade_exit_decision
      FOREIGN KEY (exit_decision_id)
      REFERENCES decision_events(decision_id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN decision_events.request_payload IS
  'Payload integral enviado ao /v1/systemone, sem headers/segredos.';
COMMENT ON COLUMN decision_events.response_payload IS
  'Resposta integral recebida da Laya antes da normalizacao local.';
COMMENT ON COLUMN decision_events.normalized_action IS
  'Acao autoritativa consumida pelo Mercado Financeiro; usar no BI em vez do verdict legado.';
COMMENT ON COLUMN trade_events.exit_reason_raw IS
  'Motivo exato do fechamento, incluindo LAYA_CLOSE_NOW e LAYA_EARLY_HARVEST.';
