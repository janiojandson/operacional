// ==============================================================================
// 📁 server/src/database/eventStoreDb.ts
// Event Store v3.0 DDL & Migration Helper (Nexus Safe-Dev)
// ==============================================================================

import { query } from './db.js';

export async function initEventStoreTables(): Promise<void> {
  console.log('[EventStore] 🚀 Verificando/Inicializando tabelas do Event Store v3.0...');

  // 1. TABELA trade_events (Imutável: INSERT no fechamento do trade)
  await query(`
    CREATE TABLE IF NOT EXISTS trade_events (
      event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trade_id TEXT NOT NULL,
      symbol VARCHAR(20) NOT NULL,
      cluster_id VARCHAR(20) NOT NULL,
      direction VARCHAR(5) NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
      entry_ts TIMESTAMPTZ NOT NULL,
      exit_ts TIMESTAMPTZ NOT NULL,
      session_hour SMALLINT NOT NULL CHECK (session_hour BETWEEN 0 AND 23),
      exit_type VARCHAR(20) NOT NULL CHECK (exit_type IN (
        'TP_FIXED', 'RUNNER', 'EARLY_HARVEST',
        'STOP_FULL', 'STOP_EARLY', 'MANUAL', 'BREAKER'
      )),
      risk_planned_r NUMERIC(8,4) NOT NULL,
      r_gross NUMERIC(8,4) NOT NULL,
      r_net NUMERIC(8,4) NOT NULL,
      fees NUMERIC(12,6) NOT NULL DEFAULT 0,
      funding NUMERIC(12,6) NOT NULL DEFAULT 0,
      slippage NUMERIC(12,6) NOT NULL DEFAULT 0,
      mfe_r NUMERIC(8,4) NOT NULL DEFAULT 0,
      mae_r NUMERIC(8,4) NOT NULL DEFAULT 0,
      rv_ol NUMERIC(8,4),
      beta_exposure NUMERIC(8,4) NOT NULL DEFAULT 0,
      decision_id TEXT,
      decision_type VARCHAR(30),
      governance_mode VARCHAR(10) NOT NULL CHECK (governance_mode IN ('OFF', 'SHADOW', 'ACTIVE')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // 2. TABELA decision_events (Append-only + trigger de imutabilidade)
  await query(`
    CREATE TABLE IF NOT EXISTS decision_events (
      decision_id TEXT PRIMARY KEY,
      decision_type VARCHAR(30) NOT NULL,
      symbol VARCHAR(20) NOT NULL,
      direction VARCHAR(5),
      issued_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      latency_ms NUMERIC(8,2) NOT NULL,
      action VARCHAR(30) NOT NULL,
      executed BOOLEAN NOT NULL DEFAULT FALSE,
      constitution_rejected BOOLEAN NOT NULL DEFAULT FALSE,
      rejection_reason VARCHAR(50),
      power_multiplier NUMERIC(4,2),
      risk_pct NUMERIC(6,4),
      stop_loss_pct NUMERIC(6,4),
      stop_direction VARCHAR(15),
      cooldown_override BOOLEAN DEFAULT FALSE,
      runner_allowed BOOLEAN DEFAULT FALSE,
      scale_in_allowed BOOLEAN DEFAULT FALSE,
      rationale_code VARCHAR(50) NOT NULL,
      confidence_score NUMERIC(5,2),
      l2_depth_top20 NUMERIC(16,2),
      imbalance_ratio NUMERIC(8,4),
      cvd_delta_60s NUMERIC(12,2),
      spoof_score NUMERIC(6,4),
      beta_divergence BOOLEAN DEFAULT FALSE,
      attributed_r NUMERIC(8,4),
      counterfactual_r NUMERIC(8,4),
      delta_r NUMERIC(8,4),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Trigger de Imutabilidade para decision_events
  await query(`
    CREATE OR REPLACE FUNCTION prevent_decision_update()
    RETURNS TRIGGER AS $$
    BEGIN
      IF (OLD.decision_type != NEW.decision_type
          OR OLD.action != NEW.action
          OR OLD.executed != NEW.executed
          OR OLD.rationale_code != NEW.rationale_code) THEN
        RAISE EXCEPTION 'decision_events is append-only: only counterfactual fields may be updated';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_decision_immutable'
      ) THEN
        CREATE TRIGGER trg_decision_immutable
        BEFORE UPDATE ON decision_events
        FOR EACH ROW EXECUTE FUNCTION prevent_decision_update();
      END IF;
    END;
    $$;
  `);

  // 3. TABELA session_snapshots & session_snapshots_monthly
  await query(`
    CREATE TABLE IF NOT EXISTS session_snapshots (
      session_id TEXT NOT NULL,
      date DATE NOT NULL,
      realized_r_day NUMERIC(8,4) NOT NULL DEFAULT 0,
      max_drawdown_r NUMERIC(8,4) NOT NULL DEFAULT 0,
      beta_by_cluster JSONB NOT NULL DEFAULT '{}'::jsonb,
      margin_used_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
      laya_mode VARCHAR(10) NOT NULL CHECK (laya_mode IN ('OFF', 'SHADOW', 'ACTIVE')),
      breaker_tripped BOOLEAN NOT NULL DEFAULT FALSE,
      total_trades INTEGER NOT NULL DEFAULT 0,
      total_decisions INTEGER NOT NULL DEFAULT 0,
      overrides_used INTEGER NOT NULL DEFAULT 0,
      overrides_ceiling INTEGER NOT NULL DEFAULT 3,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (session_id, date)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS session_snapshots_monthly (
      month DATE NOT NULL PRIMARY KEY,
      avg_realized_r NUMERIC(8,4),
      avg_max_dd_r NUMERIC(8,4),
      total_trades INTEGER,
      total_decisions INTEGER
    );
  `);

  // 4. ÍNDICES DE PERFORMANCE (Otimizados para as queries dos 10 Blocos)
  await query(`CREATE INDEX IF NOT EXISTS idx_te_entry_ts ON trade_events (entry_ts DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_te_exit_type ON trade_events (exit_type, entry_ts DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_te_cluster_entry ON trade_events (cluster_id, entry_ts DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_te_symbol_entry ON trade_events (symbol, entry_ts DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_te_decision_id ON trade_events (decision_id) WHERE decision_id IS NOT NULL;`);
  await query(`CREATE INDEX IF NOT EXISTS idx_te_governance ON trade_events (governance_mode, entry_ts DESC);`);

  await query(`CREATE INDEX IF NOT EXISTS idx_de_type_issued ON decision_events (decision_type, issued_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_de_executed ON decision_events (executed, issued_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_de_delta ON decision_events (delta_r) WHERE delta_r IS NOT NULL;`);
  await query(`CREATE INDEX IF NOT EXISTS idx_de_latency ON decision_events (issued_at DESC, latency_ms);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_de_symbol_issued ON decision_events (symbol, issued_at DESC);`);

  await query(`CREATE INDEX IF NOT EXISTS idx_ss_date ON session_snapshots (date DESC);`);

  console.log('[EventStore] ✅ Tabelas e índices do Event Store v3.0 prontos.');
}
