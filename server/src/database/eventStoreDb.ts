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
      decision_type VARCHAR(50) NOT NULL,
      symbol VARCHAR(20) NOT NULL,
      direction VARCHAR(5),
      issued_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      latency_ms NUMERIC(8,2) NOT NULL,
      action VARCHAR(50) NOT NULL,
      executed BOOLEAN NOT NULL DEFAULT FALSE,
      constitution_rejected BOOLEAN NOT NULL DEFAULT FALSE,
      rejection_reason TEXT,
      power_multiplier NUMERIC(4,2),
      risk_pct NUMERIC(6,4),
      stop_loss_pct NUMERIC(6,4),
      stop_direction VARCHAR(30),
      cooldown_override BOOLEAN DEFAULT FALSE,
      runner_allowed BOOLEAN DEFAULT FALSE,
      scale_in_allowed BOOLEAN DEFAULT FALSE,
      rationale_code VARCHAR(100) NOT NULL,
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

  // Migrações seguras de expansão de tipos para evitar 'value too long'
  await query(`ALTER TABLE decision_events ALTER COLUMN rejection_reason TYPE TEXT`).catch(() => {});
  await query(`ALTER TABLE decision_events ALTER COLUMN rationale_code TYPE VARCHAR(100)`).catch(() => {});
  await query(`ALTER TABLE decision_events ALTER COLUMN action TYPE VARCHAR(50)`).catch(() => {});
  await query(`ALTER TABLE decision_events ALTER COLUMN decision_type TYPE VARCHAR(50)`).catch(() => {});
  await query(`ALTER TABLE decision_events ALTER COLUMN stop_direction TYPE VARCHAR(30)`).catch(() => {});


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

  // 4. ÍNDICES DE PERFORMANCE (Legados protegidos)
  await query(`CREATE INDEX IF NOT EXISTS idx_te_entry_ts ON trade_events_legacy (entry_ts DESC);`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_de_type_issued ON decision_events_legacy (decision_type, issued_at DESC);`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_ss_date ON session_snapshots (date DESC);`).catch(() => {});

  // 5. LAYA GOVERNANÇA v2.0 & EVENT STORE CANÔNICO (PostgreSQL + Looker Studio)
  try {
    const fs = await import('fs');
    const path = await import('path');
    const candidatePaths = [
      path.resolve(process.cwd(), 'server/src/database/migrations/20260928_laya_v2_event_store.sql'),
      path.resolve(process.cwd(), 'src/database/migrations/20260928_laya_v2_event_store.sql'),
    ];
    const migrationPath = candidatePaths.find(p => fs.existsSync(p));
    if (migrationPath) {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      await query(sql);
      console.log('[EventStore] ✅ Laya Governança v2.0 & Views Looker Studio sincronizadas de:', migrationPath);
    }

    // Blindagem de versionamento do modelo calibrado (p_theory) e métrica de fee drag
    await query(`
      ALTER TABLE kpi_weekly_snapshots 
      ADD COLUMN IF NOT EXISTS p_theory JSONB NOT NULL DEFAULT '{"p1":0.05,"p2":0.35,"p3":0.29,"p4":0.21,"p5":0.08,"p6":0.02}'::jsonb;
    `).catch(() => {});
    await query(`
      ALTER TABLE kpi_weekly_snapshots 
      ALTER COLUMN p_theory SET DEFAULT '{"p1":0.05,"p2":0.35,"p3":0.29,"p4":0.21,"p5":0.08,"p6":0.02}'::jsonb;
    `).catch(() => {});
    await query(`
      ALTER TABLE kpi_weekly_snapshots 
      ADD COLUMN IF NOT EXISTS fee_drag_pct NUMERIC(6, 2) DEFAULT 0.00;
    `).catch(() => {});
    await query(`
      ALTER TABLE trade_events 
      ADD COLUMN IF NOT EXISTS venue VARCHAR(30) NOT NULL DEFAULT 'BingX';
    `).catch(() => {});
    await query(`
      ALTER TABLE kpi_weekly_snapshots 
      ADD COLUMN IF NOT EXISTS venue VARCHAR(30) NOT NULL DEFAULT 'ALL';
    `).catch(() => {});
  } catch (err: any) {
    console.warn('[EventStore] Aviso ao carregar migração v2:', err.message);
  }

  console.log('[EventStore] ✅ Tabelas e índices do Event Store v3.0 prontos.');
}
