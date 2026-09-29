-- ==============================================================================
-- 📁 server/src/database/migrations/20260928_laya_v2_event_store.sql
-- Migração Canônica: Laya Governança v2.0 & Event Store Imutável (PostgreSQL)
-- Frentes 1 a 4: V1-V12, Roteamento Dual, Expectância Líquida E_net & Views Looker Studio
-- ==============================================================================

-- 1. TIPOS ENUMERADOS DO SISTEMA
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_side_enum') THEN
        CREATE TYPE trade_side_enum AS ENUM ('BUY', 'SELL');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entry_type_enum') THEN
        CREATE TYPE entry_type_enum AS ENUM ('MAKER_POST_ONLY', 'TAKER_IOC');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entry_fill_status_enum') THEN
        CREATE TYPE entry_fill_status_enum AS ENUM ('FILLED_MAKER', 'FILLED_TAKER_AGGRESSIVE', 'MISSED_NO_FILL');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wh_fill_enum') THEN
        CREATE TYPE wh_fill_enum AS ENUM ('MAKER_LIMIT', 'TAKER_FALLBACK_1500MS', 'NOT_APPLICABLE');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'exit_reason_enum') THEN
        CREATE TYPE exit_reason_enum AS ENUM (
            'WAVE_HARVEST_BREAKEVEN', 
            'RUNNER_TRAILING', 
            'ACTIVE_INVALIDATION', 
            'STOP_LOSS_FULL', 
            'CIRCUIT_BREAKER_EMERGENCY'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'branch_enum') THEN
        CREATE TYPE branch_enum AS ENUM (
            'B1_STOP_FULL', 
            'B2_INVALIDATION', 
            'B3_BE_POST_HARVEST', 
            'B4_TARGET_RUNNER', 
            'B5_RUNNER_EXTREME',
            'B6_MACRO_EMERGENCY'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'run_mode_enum') THEN
        CREATE TYPE run_mode_enum AS ENUM ('SHADOW', 'PAPER_MASTER', 'LIVE_REAL');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'laya_verdict_enum') THEN
        CREATE TYPE laya_verdict_enum AS ENUM (
            'APPROVE_PASSIVE', 
            'APPROVE_AGGRESSIVE', 
            'VETO', 
            'TIGHTEN'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wall_state_enum') THEN
        CREATE TYPE wall_state_enum AS ENUM (
            'ACTIVE_CONFIRMED',      -- Parede presente >= 1.500ms
            'PULLING_DETECTED',      -- Cancelamento suspeito sem consumo (Spoofing)
            'CONSUMED_AGGRESSION',   -- Absorvida por agressão real
            'HEARTBEAT_TIMEOUT',     -- Queda de telemetria L2
            'NOT_APPLICABLE'         -- Decisões anteriores à análise de parede
        );
    END IF;
END $$;

-- 2. MIGRAÇÃO SEGURA DAS TABELAS LEGADAS (PRESERVAÇÃO INTEGRAL DE DADOS)
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trade_events' AND column_name = 'session_hour'
    ) THEN
        ALTER TABLE trade_events RENAME TO trade_events_legacy;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'decision_events' AND column_name = 'rationale_code'
    ) THEN
        ALTER TABLE decision_events RENAME TO decision_events_legacy;
    END IF;
END $$;

-- 3. TABELA MESTRA IMUTÁVEL: trade_events (v2 Canônica com 5 Termos de Atrito)
CREATE TABLE IF NOT EXISTS trade_events (
    id BIGSERIAL PRIMARY KEY,
    trade_id UUID NOT NULL UNIQUE,
    pair VARCHAR(20) NOT NULL,
    side trade_side_enum NOT NULL,
    
    -- Preços e Microestrutura de Entrada
    entry_price NUMERIC(18, 8) NOT NULL,
    initial_stop_price NUMERIC(18, 8) NOT NULL,
    initial_target_price NUMERIC(18, 8) NOT NULL,
    delta_stop_bps NUMERIC(8, 2) NOT NULL,            -- Distância do stop em bps (Piso V12 >= 55 bps)
    entry_type entry_type_enum NOT NULL,
    entry_fill_status entry_fill_status_enum NOT NULL,
    run_mode run_mode_enum NOT NULL DEFAULT 'SHADOW',
    
    -- Execução do Wave Harvest (+0.6R)
    wave_harvest_reached BOOLEAN DEFAULT FALSE,
    wave_harvest_price NUMERIC(18, 8),
    wh_fill_type wh_fill_enum DEFAULT 'NOT_APPLICABLE',
    
    -- Saída e Fechamento
    exit_price NUMERIC(18, 8),
    exit_reason exit_reason_enum,
    branch_classification branch_enum,
    
    -- Métricas Financeiras e Assimetria de R
    position_size_usd NUMERIC(18, 4) NOT NULL,
    gross_pnl_usd NUMERIC(18, 4),
    net_pnl_usd NUMERIC(18, 4),
    r_multiple_gross NUMERIC(8, 4),
    r_multiple_net NUMERIC(8, 4),
    
    -- Decomposição Analítica do Fee Drag (5 Pilares de Atrito)
    fees_entry_usd NUMERIC(14, 4) DEFAULT 0.0000,
    fees_exit_usd NUMERIC(14, 4) DEFAULT 0.0000,
    spread_cost_usd NUMERIC(14, 4) DEFAULT 0.0000,
    estimated_slippage_usd NUMERIC(14, 4) DEFAULT 0.0000,
    funding_cost_usd NUMERIC(14, 4) DEFAULT 0.0000,
    total_friction_usd NUMERIC(14, 4) GENERATED ALWAYS AS (
        fees_entry_usd + fees_exit_usd + spread_cost_usd + estimated_slippage_usd + funding_cost_usd
    ) STORED,
    
    -- Metadados Temporais
    opened_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de Performance da Tabela trade_events
CREATE INDEX IF NOT EXISTS idx_trade_events_pair_closed ON trade_events(pair, closed_at);
CREATE INDEX IF NOT EXISTS idx_trade_events_closed_at ON trade_events(closed_at);
CREATE INDEX IF NOT EXISTS idx_trade_events_branch ON trade_events(branch_classification);
CREATE INDEX IF NOT EXISTS idx_trade_events_fill_status ON trade_events(entry_fill_status);
CREATE INDEX IF NOT EXISTS idx_trade_events_run_mode ON trade_events(run_mode);

-- 4. TABELA DE AUDITORIA E TELEMETRIA DA LAYA: decision_events (v2 Canônica)
CREATE TABLE IF NOT EXISTS decision_events (
    id BIGSERIAL PRIMARY KEY,
    decision_id UUID NOT NULL UNIQUE,
    trade_id UUID REFERENCES trade_events(trade_id), -- Preenchido se APPROVE gerar trade
    pair VARCHAR(20) NOT NULL,
    signal_source VARCHAR(30) NOT NULL,
    run_mode run_mode_enum NOT NULL DEFAULT 'SHADOW',
    action_requested VARCHAR(20) DEFAULT 'ENTRY',     -- ENTRY | STOP_ADJUST | TRAIL_UPDATE | EXIT_CHECK
    
    -- Telemetria do Livro L2 no instante t0
    spread_bps NUMERIC(6, 2) NOT NULL,
    delta_stop_bps NUMERIC(8, 2) NOT NULL,
    book_imbalance_ratio NUMERIC(6, 2) NOT NULL,
    wall_id VARCHAR(40),
    wall_depth_level INT,                           -- Nível 1 a 10 (Top 10 Institucional)
    wall_volume_usd NUMERIC(18, 4),
    wall_persistence_ms INT NOT NULL,               -- Idade da parede (>= 1.500ms anti-spoofing)
    wall_state wall_state_enum NOT NULL DEFAULT 'NOT_APPLICABLE',
    
    -- Decisão da Laya
    verdict laya_verdict_enum NOT NULL,
    veto_rule_code VARCHAR(50),                     -- Ex: 'V12_INSUFFICIENT_DELTA', 'V03_TOXIC_SPREAD'
    suggested_stop_price NUMERIC(18, 8),
    latency_ms INT,
    expected_friction_r NUMERIC(8, 4),
    
    -- Rastreamento Contrafactual (para decisões VETO)
    counterfactual_simulated BOOLEAN DEFAULT FALSE,
    counterfactual_net_pnl_usd NUMERIC(18, 4),
    counterfactual_r_multiple NUMERIC(8, 4),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de Performance da Tabela decision_events
CREATE INDEX IF NOT EXISTS idx_decision_events_verdict ON decision_events(verdict);
CREATE INDEX IF NOT EXISTS idx_decision_events_veto_code ON decision_events(veto_rule_code);
CREATE INDEX IF NOT EXISTS idx_decision_events_created ON decision_events(created_at);
CREATE INDEX IF NOT EXISTS idx_decision_events_wall ON decision_events(wall_id, created_at);

-- 5. TABELA DE ESTADO DA CONTA PARA BI (Drawdown & HWM)
CREATE TABLE IF NOT EXISTS account_state (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    starting_balance_usd NUMERIC(18, 4) NOT NULL DEFAULT 10000.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO account_state (id, starting_balance_usd)
VALUES (1, 10000.00)
ON CONFLICT (id) DO NOTHING;

-- 6. TABELA DE ESTADO STICKY DE SEGURANÇA: system_state & system_state_events
CREATE TABLE IF NOT EXISTS system_state (
    id                        SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton
    run_mode                  run_mode_enum NOT NULL DEFAULT 'SHADOW',
    daily_lockout_active      BOOLEAN     NOT NULL DEFAULT FALSE,
    lockout_session_date      DATE,
    lockout_r_at_trigger      NUMERIC(8,4),
    lockout_triggered_at      TIMESTAMPTZ,
    safe_halt_active          BOOLEAN     NOT NULL DEFAULT FALSE,
    safe_halt_reason          TEXT,
    safe_halt_triggered_at    TIMESTAMPTZ,
    hwm_usd                   NUMERIC(18,4),
    hwm_reached_at            TIMESTAMPTZ,
    daily_loss_limit_r        NUMERIC(5,2) NOT NULL DEFAULT -3.00,   -- Lockout em -3.0R
    bank_floor_pct            NUMERIC(5,2) NOT NULL DEFAULT 85.00,   -- Drawdown max de 15% sobre HWM
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO system_state (id, run_mode, daily_loss_limit_r, bank_floor_pct)
VALUES (1, 'SHADOW', -3.00, 85.00)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS system_state_events (        -- Log imutável de transições de governança
    id          BIGSERIAL PRIMARY KEY,
    ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type  TEXT NOT NULL,      -- LOCKOUT_ON|LOCKOUT_OFF|SAFE_HALT_ON|SAFE_HALT_OFF|SESSION_RESET
    r_at_event  NUMERIC(8,4),
    detail      JSONB
);

-- Trigger de updated_at para system_state
CREATE OR REPLACE FUNCTION fn_touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_system_state_touch') THEN
        CREATE TRIGGER trg_system_state_touch BEFORE UPDATE ON system_state
        FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
    END IF;
END $$;

-- 7. FUNÇÃO DE AVALIAÇÃO DO LOCKOUT DIÁRIO (-3.0R UTC)
CREATE OR REPLACE FUNCTION fn_evaluate_session_lockout() RETURNS VOID AS $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'UTC')::date;
    v_cum   NUMERIC;
    v_locked BOOLEAN;
BEGIN
    SELECT COALESCE(MIN(cum_r_net), 0) INTO v_cum
    FROM (
        SELECT SUM(r_multiple_net) OVER (
                   ORDER BY closed_at ROWS UNBOUNDED PRECEDING) AS cum_r_net
        FROM trade_events
        WHERE closed_at IS NOT NULL
          AND entry_fill_status <> 'MISSED_NO_FILL'
          AND (closed_at AT TIME ZONE 'UTC')::date = v_today
    ) s;

    SELECT daily_lockout_active INTO v_locked FROM system_state WHERE id = 1;

    IF v_cum <= -3.0 AND NOT v_locked THEN
        INSERT INTO system_state (id, daily_lockout_active, lockout_session_date,
                                  lockout_r_at_trigger, lockout_triggered_at)
        VALUES (1, TRUE, v_today, v_cum, NOW())
        ON CONFLICT (id) DO UPDATE SET
            daily_lockout_active = TRUE,
            lockout_session_date = v_today,
            lockout_r_at_trigger = v_cum,
            lockout_triggered_at = NOW();
        INSERT INTO system_state_events (event_type, r_at_event)
        VALUES ('LOCKOUT_ON', v_cum);
    ELSIF v_locked AND lockout_session_date < v_today THEN   -- Reset à meia-noite UTC
        UPDATE system_state SET daily_lockout_active = FALSE,
               lockout_session_date = NULL WHERE id = 1;
        INSERT INTO system_state_events (event_type, r_at_event)
        VALUES ('SESSION_RESET', v_cum);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 8. VIEWS SQL ANALÍTICAS PARA O GOOGLE LOOKER STUDIO
-- ==============================================================================

-- 8.1 View 1: vw_expectancy_net (Expectância Líquida E_net por Sessão e Par)
CREATE OR REPLACE VIEW vw_expectancy_net AS
WITH t AS (
    SELECT *,
           (closed_at AT TIME ZONE 'UTC')::date AS session_date,
           (r_multiple_gross - r_multiple_net)  AS friction_r
    FROM trade_events
    WHERE entry_fill_status <> 'MISSED_NO_FILL'
      AND closed_at IS NOT NULL
)
SELECT
    session_date,
    pair,
    run_mode,
    COUNT(*)                                                          AS n_trades,
    ROUND(AVG(r_multiple_gross), 4)                                   AS e_gross_r,
    ROUND(AVG(friction_r), 4)                                         AS friction_r_avg,
    ROUND(AVG(r_multiple_net), 4)                                     AS e_net_r,
    ROUND(100.0 * AVG((r_multiple_net > 0)::int), 2)                  AS win_rate_net_pct,
    ROUND(SUM(GREATEST(r_multiple_net,0)) /
          NULLIF(-SUM(LEAST(r_multiple_net,0)),0), 3)                 AS profit_factor_net,
    ROUND(100.0 * (AVG(-r_multiple_net) FILTER (WHERE r_multiple_net < 0))
        / NULLIF((AVG(r_multiple_net)  FILTER (WHERE r_multiple_net > 0))
               + (AVG(-r_multiple_net) FILTER (WHERE r_multiple_net < 0)),0), 2)
                                                                      AS be_win_rate_pct,
    ROUND(SUM(total_friction_usd), 2)                                 AS friction_usd_total,
    ROUND(100.0 * COUNT(*) FILTER (WHERE branch_classification='B1_STOP_FULL')        / COUNT(*),2) AS pct_b1,
    ROUND(100.0 * COUNT(*) FILTER (WHERE branch_classification='B2_INVALIDATION')     / COUNT(*),2) AS pct_b2,
    ROUND(100.0 * COUNT(*) FILTER (WHERE branch_classification='B3_BE_POST_HARVEST')  / COUNT(*),2) AS pct_b3,
    ROUND(100.0 * COUNT(*) FILTER (WHERE branch_classification='B4_TARGET_RUNNER')    / COUNT(*),2) AS pct_b4,
    ROUND(100.0 * COUNT(*) FILTER (WHERE branch_classification='B5_RUNNER_EXTREME')   / COUNT(*),2) AS pct_b5,
    ROUND(100.0 * COUNT(*) FILTER (WHERE branch_classification='B6_MACRO_EMERGENCY')  / COUNT(*),2) AS pct_b6,
    MIN(opened_at) AS window_start,
    MAX(closed_at) AS window_end
FROM t
GROUP BY session_date, pair, run_mode;

-- 8.2 View 2: vw_fee_drag_breakdown (Decomposição Completa de Custos e Roteamento)
CREATE OR REPLACE VIEW vw_fee_drag_breakdown AS
WITH t AS (
    SELECT * FROM trade_events
    WHERE entry_fill_status <> 'MISSED_NO_FILL' AND closed_at IS NOT NULL
),
agg AS (
    SELECT
        (closed_at AT TIME ZONE 'UTC')::date AS session_date,
        pair,
        run_mode,
        COUNT(*) AS n_trades,
        SUM(fees_entry_usd) FILTER (WHERE entry_type='MAKER_POST_ONLY') AS fee_maker_usd,
        SUM(fees_entry_usd) FILTER (WHERE entry_type='TAKER_IOC')
          + COALESCE(SUM(fees_exit_usd) FILTER (WHERE wh_fill_type='TAKER_FALLBACK_1500MS'
                                                   OR exit_reason IN ('STOP_LOSS_FULL','ACTIVE_INVALIDATION','RUNNER_TRAILING','CIRCUIT_BREAKER_EMERGENCY')),0)
                                                                      AS fee_taker_usd,
        SUM(fees_exit_usd)  FILTER (WHERE wh_fill_type='MAKER_LIMIT') AS fee_maker_exit_usd,
        SUM(spread_cost_usd)        AS spread_usd,
        SUM(estimated_slippage_usd) AS slippage_usd,
        SUM(funding_cost_usd)       AS funding_usd,
        SUM(total_friction_usd)     AS friction_usd_total,
        SUM(position_size_usd)      AS notional_usd,
        SUM(r_multiple_gross * position_size_usd * 0.01) AS risk_usd_equiv,
        SUM(r_multiple_gross - r_multiple_net) AS friction_r_sum,
        COUNT(*) FILTER (WHERE wh_fill_type='TAKER_FALLBACK_1500MS')  AS wh_fallback_count,
        COUNT(*) FILTER (WHERE entry_fill_status='MISSED_NO_FILL')    AS missed_no_fill_count
    FROM t GROUP BY 1,2,3
)
SELECT
    session_date, pair, run_mode, n_trades,
    ROUND(fee_maker_usd,2)      AS fee_maker_usd,
    ROUND(fee_taker_usd,2)      AS fee_taker_usd,
    ROUND(fee_maker_exit_usd,2) AS fee_maker_exit_usd,
    ROUND(spread_usd,2)         AS spread_usd,
    ROUND(slippage_usd,2)       AS slippage_usd,
    ROUND(funding_usd,2)        AS funding_usd,
    ROUND(friction_usd_total,2) AS friction_usd_total,
    ROUND(10000.0 * friction_usd_total / NULLIF(notional_usd,0),2)    AS friction_bps_of_volume,
    ROUND(friction_r_sum / NULLIF(n_trades,0),4)                      AS friction_r_avg,
    ROUND(100.0 * friction_usd_total / NULLIF(
        (SELECT SUM(GREATEST(gross_pnl_usd,0)) FROM t x
          WHERE x.pair = a.pair AND (x.closed_at AT TIME ZONE 'UTC')::date = a.session_date),0),2)
                                                                      AS drag_pct_of_gross_profit,
    ROUND(100.0 * wh_fallback_count    / NULLIF(n_trades,0),2)        AS wh_fallback_rate_pct,
    ROUND(100.0 * missed_no_fill_count / NULLIF(n_trades + missed_no_fill_count,0),2) AS miss_rate_pct
FROM agg a;

-- 8.3 View 3: vw_drawdown_hwm (High-Water Mark e Proteção de Banca SAFE_HALT)
CREATE OR REPLACE VIEW vw_drawdown_hwm AS
WITH base AS (
    SELECT COALESCE(starting_balance_usd, 0)::numeric AS base_bal
    FROM account_state LIMIT 1
),
pnl AS (
    SELECT closed_at AS ts, SUM(net_pnl_usd) AS pnl_usd
    FROM trade_events
    WHERE closed_at IS NOT NULL AND entry_fill_status <> 'MISSED_NO_FILL'
    GROUP BY closed_at
),
curve AS (
    SELECT p.ts,
           b.base_bal + SUM(p.pnl_usd) OVER (ORDER BY p.ts ROWS UNBOUNDED PRECEDING) AS equity_usd
    FROM pnl p CROSS JOIN base b
),
hwm AS (
    SELECT c.*, MAX(c.equity_usd) OVER (ORDER BY c.ts ROWS UNBOUNDED PRECEDING) AS hwm_usd
    FROM curve c
)
SELECT
    ts,
    ROUND(equity_usd,2)  AS equity_usd,
    ROUND(hwm_usd,2)     AS hwm_usd,
    ROUND(100.0 * (hwm_usd - equity_usd) / NULLIF(hwm_usd,0), 3) AS drawdown_pct,
    ROUND(100.0 * equity_usd / NULLIF((SELECT base_bal FROM base),0), 2) AS bank_pct_of_start,
    (equity_usd <= 0.85 * hwm_usd) AS safe_halt_trigger
FROM hwm;

-- 8.4 View 4: vw_session_lockout (Acumulado de R Diário UTC vs Limite de -3.0R)
CREATE OR REPLACE VIEW vw_session_lockout AS
WITH closed AS (
    SELECT trade_id, pair,
           (closed_at AT TIME ZONE 'UTC')::date AS session_date,
           closed_at, r_multiple_gross, r_multiple_net, net_pnl_usd
    FROM trade_events
    WHERE closed_at IS NOT NULL AND entry_fill_status <> 'MISSED_NO_FILL'
),
running AS (
    SELECT *,
        SUM(r_multiple_net) OVER (
            PARTITION BY session_date
            ORDER BY closed_at
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum_r_net
    FROM closed
)
SELECT
    session_date,
    COUNT(*)                                        AS n_trades_closed,
    ROUND(SUM(r_multiple_gross), 4)                 AS r_gross_day,
    ROUND(SUM(r_multiple_net), 4)                   AS r_net_day,
    ROUND(MIN(cum_r_net), 4)                        AS worst_cum_r,
    -3.0                                            AS lockout_limit_r,
    ROUND(MIN(cum_r_net) + 3.0, 4)                  AS headroom_r_min,
    BOOL_OR(cum_r_net <= -3.0)                      AS lockout_trigger,
    MIN(closed_at) FILTER (WHERE cum_r_net <= -3.0) AS lockout_first_trigger_ts,
    ROUND(SUM(net_pnl_usd), 2)                      AS net_pnl_usd_day
FROM running
GROUP BY session_date;
