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
    account_balance_usd NUMERIC(18, 4),               -- Saldo da conta no momento da operação (V5: Risco ~1.0%)
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

ALTER TABLE trade_events ADD COLUMN IF NOT EXISTS account_balance_usd NUMERIC(18, 4);
ALTER TABLE trade_events ADD COLUMN IF NOT EXISTS venue VARCHAR(30) NOT NULL DEFAULT 'BingX';
CREATE INDEX IF NOT EXISTS idx_trade_events_venue ON trade_events(venue);

-- Convenção Contábil Canônica: R ponderado por execuções parciais (R = SUM(w_k * r_k))
COMMENT ON COLUMN trade_events.r_multiple_gross IS 'Múltiplo R bruto ponderado pelas execuções parciais: R_realizado = SUM(w_k * r_k). Ex: Wave Harvest 50% a +0.6R (0.30R) + Runner 50% a r_runner. Proibido armazenar o R cheio do runner isolado.';
COMMENT ON COLUMN trade_events.r_multiple_net IS 'Múltiplo R líquido de todo o atrito operacional (fees, funding, slippage, spread): R_net = R_gross - (total_friction_usd / R_dollar).';

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

-- 7. FUNÇÕES DE AVALIAÇÃO DE SEGURANÇA (LOCKOUT DIÁRIO & SAFE_HALT)
CREATE OR REPLACE FUNCTION fn_evaluate_session_lockout() RETURNS VOID AS $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'UTC')::date;
    v_cum   NUMERIC;
    v_locked BOOLEAN;
BEGIN
    -- Serializa avaliações concorrentes para evitar duplicidade de eventos
    PERFORM pg_advisory_xact_lock(4242);

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

CREATE OR REPLACE FUNCTION fn_evaluate_safe_halt() RETURNS VOID AS $$
DECLARE
    v_base_bal NUMERIC;
    v_cum_pnl  NUMERIC;
    v_equity   NUMERIC;
    v_curr_hwm NUMERIC;
    v_new_hwm  NUMERIC;
    v_halted   BOOLEAN;
BEGIN
    -- Serializa avaliação de Safe Halt
    PERFORM pg_advisory_xact_lock(4243);

    SELECT COALESCE(starting_balance_usd, 10000.00) INTO v_base_bal FROM account_state LIMIT 1;
    SELECT COALESCE(SUM(net_pnl_usd), 0) INTO v_cum_pnl 
    FROM trade_events 
    WHERE closed_at IS NOT NULL AND entry_fill_status <> 'MISSED_NO_FILL';

    v_equity := v_base_bal + v_cum_pnl;

    SELECT hwm_usd, safe_halt_active INTO v_curr_hwm, v_halted FROM system_state WHERE id = 1;
    v_new_hwm := GREATEST(COALESCE(v_curr_hwm, v_base_bal), v_equity);

    -- Atualiza HWM se houver novo pico
    IF v_new_hwm > COALESCE(v_curr_hwm, 0) THEN
        UPDATE system_state SET hwm_usd = v_new_hwm, hwm_reached_at = NOW() WHERE id = 1;
    END IF;

    -- Gatilho de SAFE_HALT aos 15% de drawdown sobre HWM (piso de banca de 85%)
    IF v_equity <= (0.85 * v_new_hwm) AND NOT COALESCE(v_halted, FALSE) THEN
        UPDATE system_state 
        SET safe_halt_active = TRUE,
            safe_halt_reason = 'DRAWDOWN_BREACH_15PCT',
            safe_halt_triggered_at = NOW()
        WHERE id = 1;
        INSERT INTO system_state_events (event_type, r_at_event, detail)
        VALUES ('SAFE_HALT_ON', 0, jsonb_build_object('equity', v_equity, 'hwm', v_new_hwm, 'dd_pct', ROUND(100.0 * (v_new_hwm - v_equity) / v_new_hwm, 2)));
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 8. VIEWS SQL ANALÍTICAS PARA O GOOGLE LOOKER STUDIO
-- ==============================================================================

-- 8.1 View 1: vw_expectancy_net (Expectância Líquida E_net por Sessão e Par)
DROP VIEW IF EXISTS vw_expectancy_net CASCADE;
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
    ROUND(100.0 * COUNT(*) FILTER (WHERE exit_reason = 'ACTIVE_INVALIDATION')         / NULLIF(COUNT(*), 0), 2) AS pct_invalidation_all,
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

-- 8.5 View 5: vw_integrity_r_consistency (Auditoria Contábil de R_net vs Atrito)
DROP VIEW IF EXISTS vw_integrity_r_consistency CASCADE;
CREATE OR REPLACE VIEW vw_integrity_r_consistency AS
SELECT
    trade_id,
    pair,
    run_mode,
    account_balance_usd,
    position_size_usd,
    delta_stop_bps,
    ROUND(position_size_usd * delta_stop_bps / 10000.0, 4) AS risk_usd_calc,
    ROUND(100.0 * (position_size_usd * delta_stop_bps / 10000.0) / NULLIF(account_balance_usd, 0), 2) AS risk_pct_of_balance,
    (account_balance_usd IS NULL OR ABS(((position_size_usd * delta_stop_bps / 10000.0) / NULLIF(account_balance_usd, 0)) - 0.010) <= 0.005) AS risk_sizing_ok,
    total_friction_usd,
    ROUND(total_friction_usd / NULLIF(position_size_usd * delta_stop_bps / 10000.0, 0), 4) AS friction_r_calc,
    r_multiple_gross,
    r_multiple_net,
    ROUND(r_multiple_gross - (total_friction_usd / NULLIF(position_size_usd * delta_stop_bps / 10000.0, 0)), 4) AS r_net_calc,
    ABS(r_multiple_net - (r_multiple_gross - (total_friction_usd / NULLIF(position_size_usd * delta_stop_bps / 10000.0, 0)))) < 0.001 AS ok,
    closed_at
FROM trade_events
WHERE entry_fill_status <> 'MISSED_NO_FILL'
  AND closed_at IS NOT NULL;

-- 8.6 View 6: vw_integrity_branch_consistency (Auditoria de Classificação de Ramos B1-B6)
DROP VIEW IF EXISTS vw_integrity_branch_consistency CASCADE;
CREATE OR REPLACE VIEW vw_integrity_branch_consistency AS
SELECT 
    trade_id,
    pair,
    run_mode,
    r_multiple_gross,
    wave_harvest_reached,
    exit_reason,
    branch_classification,
    CASE
        WHEN wave_harvest_reached AND (r_multiple_gross - 0.30) / 0.5 >= 3.5 THEN 'B5_RUNNER_EXTREME'
        WHEN wave_harvest_reached AND (r_multiple_gross - 0.30) / 0.5 >= 2.0 THEN 'B4_TARGET_RUNNER'
        WHEN wave_harvest_reached THEN 'B3_BE_POST_HARVEST'
        WHEN exit_reason = 'ACTIVE_INVALIDATION' THEN 'B2_INVALIDATION'
        WHEN exit_reason = 'CIRCUIT_BREAKER_EMERGENCY' THEN 'B6_MACRO_EMERGENCY'
        WHEN exit_reason = 'STOP_LOSS_FULL' THEN 'B1_STOP_FULL'
        ELSE 'B1_STOP_FULL'
    END AS branch_expected,
    (branch_classification::text = CASE
        WHEN wave_harvest_reached AND (r_multiple_gross - 0.30) / 0.5 >= 3.5 THEN 'B5_RUNNER_EXTREME'
        WHEN wave_harvest_reached AND (r_multiple_gross - 0.30) / 0.5 >= 2.0 THEN 'B4_TARGET_RUNNER'
        WHEN wave_harvest_reached THEN 'B3_BE_POST_HARVEST'
        WHEN exit_reason = 'ACTIVE_INVALIDATION' THEN 'B2_INVALIDATION'
        WHEN exit_reason = 'CIRCUIT_BREAKER_EMERGENCY' THEN 'B6_MACRO_EMERGENCY'
        WHEN exit_reason = 'STOP_LOSS_FULL' THEN 'B1_STOP_FULL'
        ELSE 'B1_STOP_FULL'
    END) AS ok,
    closed_at
FROM trade_events
WHERE entry_fill_status <> 'MISSED_NO_FILL'
  AND closed_at IS NOT NULL;

-- ==============================================================================
-- 9. TABELA DE SNAPSHOT SEMANAL DOS KPIS (AUDITORIA DO GATE PARA PAPER_MASTER)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS kpi_weekly_snapshots (
    id BIGSERIAL PRIMARY KEY,
    snapshot_label VARCHAR(50) NOT NULL UNIQUE,     -- ex: '2026-W39', 'SEMANA_01_SHADOW'
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    run_mode run_mode_enum NOT NULL DEFAULT 'SHADOW',
    pair VARCHAR(20) NOT NULL DEFAULT 'ALL',
    venue VARCHAR(30) NOT NULL DEFAULT 'ALL',
    
    -- Volume Amostral
    n_trades INTEGER NOT NULL CHECK (n_trades >= 0),
    cumulative_trades INTEGER NOT NULL DEFAULT 0,
    
    -- 5 Metas Centrais do Roteiro Quantitativo
    e_net_r NUMERIC(8, 4) NOT NULL,                 -- Meta 1: E_net >= +0.10R (Piso Sustentado)
    win_rate_net_pct NUMERIC(6, 2) NOT NULL,        -- Meta 2: Win Rate Líquido (Referência ~52%)
    profit_factor_net NUMERIC(6, 3) NOT NULL,       -- Meta 3: Profit Factor Líquido >= 1.30
    pct_invalidation_all NUMERIC(6, 2) NOT NULL,    -- Meta 4: Falsos Rompimentos <= 30% (KPI Oficial: B2 + Invalidação B3)
    max_drawdown_pct NUMERIC(6, 2) NOT NULL,        -- Meta 5: Max Drawdown <= 10% (Alinhado à meta semanal; SAFE_HALT aos 15%)
    
    -- Decomposição de Ramos B1-B6
    pct_b1 NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    pct_b2 NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    pct_b3 NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    pct_b4 NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    pct_b5 NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    pct_b6 NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    
    -- Microestrutura, Roteamento e Atrito
    maker_fill_pct NUMERIC(6, 2) DEFAULT 0.00,
    taker_fallback_pct NUMERIC(6, 2) DEFAULT 0.00,
    miss_rate_pct NUMERIC(6, 2) DEFAULT 0.00,
    friction_r_avg NUMERIC(8, 4) NOT NULL,
    fee_drag_usd_total NUMERIC(14, 4) NOT NULL,
    fee_drag_pct NUMERIC(6, 2) DEFAULT 0.00,
    
    -- Avaliação do Gate e Versionamento do Modelo
    p_theory JSONB NOT NULL DEFAULT '{"p1":0.05,"p2":0.35,"p3":0.29,"p4":0.21,"p5":0.08,"p6":0.02}'::jsonb,
    gate_qualified BOOLEAN NOT NULL DEFAULT FALSE,
    gate_verdict VARCHAR(30) NOT NULL DEFAULT 'OBSERVATION',
    recalibration_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_window ON kpi_weekly_snapshots(window_start DESC, window_end DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_mode ON kpi_weekly_snapshots(run_mode, pair, venue);

-- Função de Geração/Atualização do Snapshot Semanal
CREATE OR REPLACE FUNCTION fn_generate_weekly_kpi_snapshot(
    p_snapshot_label VARCHAR(50),
    p_window_start TIMESTAMPTZ,
    p_window_end TIMESTAMPTZ,
    p_run_mode run_mode_enum DEFAULT 'SHADOW',
    p_pair VARCHAR(20) DEFAULT 'ALL',
    p_venue VARCHAR(30) DEFAULT 'ALL'
)
RETURNS kpi_weekly_snapshots AS $$
DECLARE
    v_row kpi_weekly_snapshots;
    v_n_trades INT;
    v_cum_trades INT;
    v_e_net NUMERIC(8,4);
    v_win_rate NUMERIC(6,2);
    v_pf NUMERIC(6,3);
    v_invalidation_all NUMERIC(6,2);
    v_max_dd NUMERIC(6,2);
    v_b1 NUMERIC(6,2);
    v_b2 NUMERIC(6,2);
    v_b3 NUMERIC(6,2);
    v_b4 NUMERIC(6,2);
    v_b5 NUMERIC(6,2);
    v_b6 NUMERIC(6,2);
    v_maker NUMERIC(6,2);
    v_taker_fb NUMERIC(6,2);
    v_miss NUMERIC(6,2);
    v_friction_avg NUMERIC(8,4);
    v_fee_drag NUMERIC(14,4);
    v_drag_pct NUMERIC(6,2);
    v_qualified BOOLEAN;
    v_verdict VARCHAR(30);
    v_notes TEXT;
BEGIN
    -- 1. Métricas da Janela
    SELECT 
        COUNT(*),
        COALESCE(ROUND(AVG(r_multiple_net), 4), 0.0000),
        COALESCE(ROUND(100.0 * AVG((r_multiple_net > 0)::int), 2), 0.00),
        COALESCE(ROUND(SUM(GREATEST(r_multiple_net,0)) / NULLIF(-SUM(LEAST(r_multiple_net,0)),0), 3), 0.000),
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE exit_reason = 'ACTIVE_INVALIDATION') / NULLIF(COUNT(*), 0), 2), 0.00),
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE branch_classification='B1_STOP_FULL') / NULLIF(COUNT(*), 0), 2), 0.00),
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE branch_classification='B2_INVALIDATION') / NULLIF(COUNT(*), 0), 2), 0.00),
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE branch_classification='B3_BE_POST_HARVEST') / NULLIF(COUNT(*), 0), 2), 0.00),
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE branch_classification='B4_TARGET_RUNNER') / NULLIF(COUNT(*), 0), 2), 0.00),
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE branch_classification='B5_RUNNER_EXTREME') / NULLIF(COUNT(*), 0), 2), 0.00),
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE branch_classification='B6_MACRO_EMERGENCY') / NULLIF(COUNT(*), 0), 2), 0.00),
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE entry_type = 'MAKER_POST_ONLY' AND entry_fill_status = 'FILLED_MAKER') / NULLIF(COUNT(*), 0), 2), 0.00),
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE wh_fill_type = 'TAKER_FALLBACK_1500MS') / NULLIF(COUNT(*), 0), 2), 0.00),
        COALESCE(ROUND(AVG(r_multiple_gross - r_multiple_net), 4), 0.0000),
        COALESCE(ROUND(SUM(total_friction_usd), 4), 0.0000),
        -- Nota de Borda: Se a janela não tiver nenhum lucro bruto (semana 100% perdedora), NULLIF retorna NULL e COALESCE 0.00%.
        -- O veto suave passa trivialmente, mas o sistema é reprovado pelas metas centrais (E_net < +0.10R).
        COALESCE(ROUND(100.0 * SUM(total_friction_usd) / NULLIF(SUM(GREATEST(gross_pnl_usd, 0)), 0), 2), 0.00)
    INTO
        v_n_trades, v_e_net, v_win_rate, v_pf, v_invalidation_all,
        v_b1, v_b2, v_b3, v_b4, v_b5, v_b6,
        v_maker, v_taker_fb, v_friction_avg, v_fee_drag, v_drag_pct
    FROM trade_events
    WHERE closed_at >= p_window_start 
      AND closed_at <= p_window_end
      AND run_mode = p_run_mode
      AND (p_pair = 'ALL' OR pair = p_pair)
      AND (p_venue = 'ALL' OR venue = p_venue)
      AND entry_fill_status <> 'MISSED_NO_FILL';

    -- 2. Total Acumulado Geral
    SELECT COUNT(*) INTO v_cum_trades
    FROM trade_events
    WHERE closed_at <= p_window_end
      AND run_mode = p_run_mode
      AND (p_pair = 'ALL' OR pair = p_pair)
      AND (p_venue = 'ALL' OR venue = p_venue)
      AND entry_fill_status <> 'MISSED_NO_FILL';

    -- 3. Taxa de Missed trades
    SELECT COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE entry_fill_status = 'MISSED_NO_FILL') / NULLIF(COUNT(*), 0), 2), 0.00)
    INTO v_miss
    FROM trade_events
    WHERE opened_at >= p_window_start 
      AND opened_at <= p_window_end
      AND (p_venue = 'ALL' OR venue = p_venue);

    -- 4. Drawdown Máximo na Janela
    SELECT COALESCE(MAX(drawdown_pct), 0.00) INTO v_max_dd
    FROM vw_drawdown_hwm
    WHERE ts >= p_window_start AND ts <= p_window_end;

    -- 5. Avaliação do Gate Unificado (Roteiro Canônico Homologado)
    IF v_n_trades < 20 THEN
        v_qualified := FALSE;
        v_verdict := 'INSUFFICIENT_SAMPLE';
        v_notes := format('Amostra semanal n=%s inferior a 20 trades.', v_n_trades);
    ELSIF v_e_net >= 0.1000 AND (v_win_rate >= 48.0 OR v_pf >= 1.300) AND v_invalidation_all <= 30.0 AND v_max_dd <= 10.0 THEN
        -- Verificação de Vetos Suaves de Microestrutura (Atrito Operacional)
        IF v_taker_fb > 10.0 OR v_miss > 15.0 OR v_drag_pct > 40.0 THEN
            v_qualified := FALSE;
            v_verdict := 'METAS_OK_MICROSTRUCTURE_VETO';
            v_notes := format('Metas centrais aprovadas, mas atrito de microestrutura excede limiar: Taker Fallback=%s%% (teto 10%%), Miss Rate=%s%% (teto 15%%) ou Fee Drag=%s%% (teto 40%%). Promoção suspensa até calibração de roteamento.', v_taker_fb, v_miss, v_drag_pct);
        ELSIF v_cum_trades >= 300 THEN
            v_qualified := TRUE;
            v_verdict := 'GATE_PASSED_PAPER_MASTER';
            v_notes := format('Amostra global N=%s trades atingida. Todas as metas econômicas e de microestrutura aprovadas.', v_cum_trades);
        ELSE
            v_qualified := FALSE;
            v_verdict := 'METAS_OK_COLETA_EM_CURSO';
            v_notes := format('Metas aprovadas na janela semanal, acumulado N=%s/300 em progresso.', v_cum_trades);
        END IF;
    ELSE
        v_qualified := FALSE;
        v_verdict := 'RECALIBRATION_NEEDED';
        v_notes := format('Metas econômicas fora do limiar: E_net=%sR (piso +0.10R), WinRate=%s%%, PF=%s, Invalidações=%s%% (teto 30%%), DD=%s%% (teto 10%%)',
                          v_e_net, v_win_rate, v_pf, v_invalidation_all, v_max_dd);
    END IF;

    -- 6. Upsert no Snapshot
    INSERT INTO kpi_weekly_snapshots (
        snapshot_label, window_start, window_end, run_mode, pair, venue,
        n_trades, cumulative_trades,
        e_net_r, win_rate_net_pct, profit_factor_net, pct_invalidation_all, max_drawdown_pct,
        pct_b1, pct_b2, pct_b3, pct_b4, pct_b5, pct_b6,
        maker_fill_pct, taker_fallback_pct, miss_rate_pct, friction_r_avg, fee_drag_usd_total, fee_drag_pct,
        gate_qualified, gate_verdict, recalibration_notes
    ) VALUES (
        p_snapshot_label, p_window_start, p_window_end, p_run_mode, p_pair, p_venue,
        v_n_trades, v_cum_trades,
        v_e_net, v_win_rate, v_pf, v_invalidation_all, v_max_dd,
        v_b1, v_b2, v_b3, v_b4, v_b5, v_b6,
        v_maker, v_taker_fb, v_miss, v_friction_avg, v_fee_drag, v_drag_pct,
        v_qualified, v_verdict, v_notes
    )
    ON CONFLICT (snapshot_label) DO UPDATE SET
        window_start = EXCLUDED.window_start,
        window_end = EXCLUDED.window_end,
        run_mode = EXCLUDED.run_mode,
        pair = EXCLUDED.pair,
        venue = EXCLUDED.venue,
        n_trades = EXCLUDED.n_trades,
        cumulative_trades = EXCLUDED.cumulative_trades,
        e_net_r = EXCLUDED.e_net_r,
        win_rate_net_pct = EXCLUDED.win_rate_net_pct,
        profit_factor_net = EXCLUDED.profit_factor_net,
        pct_invalidation_all = EXCLUDED.pct_invalidation_all,
        max_drawdown_pct = EXCLUDED.max_drawdown_pct,
        pct_b1 = EXCLUDED.pct_b1,
        pct_b2 = EXCLUDED.pct_b2,
        pct_b3 = EXCLUDED.pct_b3,
        pct_b4 = EXCLUDED.pct_b4,
        pct_b5 = EXCLUDED.pct_b5,
        pct_b6 = EXCLUDED.pct_b6,
        maker_fill_pct = EXCLUDED.maker_fill_pct,
        taker_fallback_pct = EXCLUDED.taker_fallback_pct,
        miss_rate_pct = EXCLUDED.miss_rate_pct,
        friction_r_avg = EXCLUDED.friction_r_avg,
        fee_drag_usd_total = EXCLUDED.fee_drag_usd_total,
        fee_drag_pct = EXCLUDED.fee_drag_pct,
        gate_qualified = EXCLUDED.gate_qualified,
        gate_verdict = EXCLUDED.gate_verdict,
        recalibration_notes = EXCLUDED.recalibration_notes,
        created_at = NOW()
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 10. VIEW DE TRANSIÇÃO E RECALIBRAÇÃO: p_i TEÓRICO -> EMPÍRICO (N >= 300)
-- ==============================================================================

DROP VIEW IF EXISTS vw_transition_pi_calibration CASCADE;
CREATE OR REPLACE VIEW vw_transition_pi_calibration AS
WITH empirical AS (
    SELECT
        COUNT(*) AS n_total,
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE branch_classification='B1_STOP_FULL') / NULLIF(COUNT(*), 0), 2), 0.00) AS p1_b1_empirical_pct,
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE branch_classification='B2_INVALIDATION') / NULLIF(COUNT(*), 0), 2), 0.00) AS p2_b2_empirical_pct,
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE branch_classification='B3_BE_POST_HARVEST') / NULLIF(COUNT(*), 0), 2), 0.00) AS p3_b3_empirical_pct,
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE branch_classification='B4_TARGET_RUNNER') / NULLIF(COUNT(*), 0), 2), 0.00) AS p4_b4_empirical_pct,
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE branch_classification='B5_RUNNER_EXTREME') / NULLIF(COUNT(*), 0), 2), 0.00) AS p5_b5_empirical_pct,
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE branch_classification='B6_MACRO_EMERGENCY') / NULLIF(COUNT(*), 0), 2), 0.00) AS p6_b6_empirical_pct,
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE exit_reason = 'ACTIVE_INVALIDATION') / NULLIF(COUNT(*), 0), 2), 0.00) AS pct_invalidation_all_pct,
        COALESCE(ROUND(AVG(r_multiple_gross) FILTER (WHERE branch_classification='B1_STOP_FULL'), 4), 0.0000) AS r_b1_empirical_avg,
        COALESCE(ROUND(AVG(r_multiple_gross) FILTER (WHERE branch_classification='B2_INVALIDATION'), 4), 0.0000) AS r_b2_empirical_avg,
        COALESCE(ROUND(AVG(r_multiple_gross) FILTER (WHERE branch_classification='B3_BE_POST_HARVEST'), 4), 0.0000) AS r_b3_empirical_avg,
        COALESCE(ROUND(AVG(r_multiple_gross) FILTER (WHERE branch_classification='B4_TARGET_RUNNER'), 4), 0.0000) AS r_b4_empirical_avg,
        COALESCE(ROUND(AVG(r_multiple_gross) FILTER (WHERE branch_classification='B5_RUNNER_EXTREME'), 4), 0.0000) AS r_b5_empirical_avg,
        COALESCE(ROUND(AVG(r_multiple_gross) FILTER (WHERE branch_classification='B6_MACRO_EMERGENCY'), 4), 0.0000) AS r_b6_empirical_avg,
        COALESCE(ROUND(AVG(r_multiple_gross), 4), 0.0000) AS e_gross_empirical,
        COALESCE(ROUND(AVG(r_multiple_net), 4), 0.0000) AS e_net_empirical,
        COALESCE(ROUND(AVG(r_multiple_gross - r_multiple_net), 4), 0.0000) AS friction_r_empirical,
        COALESCE(ROUND(100.0 * AVG((r_multiple_net > 0)::int), 2), 0.00) AS win_rate_net_pct,
        COALESCE(ROUND(SUM(GREATEST(r_multiple_net,0)) / NULLIF(-SUM(LEAST(r_multiple_net,0)),0), 3), 0.000) AS profit_factor_net,
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE wh_fill_type = 'TAKER_FALLBACK_1500MS') / NULLIF(COUNT(*), 0), 2), 0.00) AS taker_fallback_pct,
        COALESCE(ROUND(100.0 * (SELECT COUNT(*) FILTER (WHERE entry_fill_status = 'MISSED_NO_FILL') FROM trade_events WHERE run_mode = 'SHADOW') / NULLIF((SELECT COUNT(*) FROM trade_events WHERE run_mode = 'SHADOW'), 0), 2), 0.00) AS miss_rate_pct,
        COALESCE(ROUND(100.0 * SUM(total_friction_usd) / NULLIF(SUM(GREATEST(gross_pnl_usd, 0)), 0), 2), 0.00) AS fee_drag_pct,
        COALESCE((SELECT MAX(drawdown_pct) FROM vw_drawdown_hwm), 0.00) AS max_drawdown_pct
    FROM trade_events
    WHERE entry_fill_status <> 'MISSED_NO_FILL'
      AND closed_at IS NOT NULL
)
SELECT
    n_total,
    -- Probabilidades de Transição (Teórico vs Empírico)
    p1_b1_empirical_pct, 5.00 AS p1_theoretical_pct, ROUND(p1_b1_empirical_pct - 5.00, 2) AS delta_p1_pct,
    p2_b2_empirical_pct, 35.00 AS p2_theoretical_pct, ROUND(p2_b2_empirical_pct - 35.00, 2) AS delta_p2_pct,
    p3_b3_empirical_pct, 29.00 AS p3_theoretical_pct, ROUND(p3_b3_empirical_pct - 29.00, 2) AS delta_p3_pct,
    p4_b4_empirical_pct, 21.00 AS p4_theoretical_pct, ROUND(p4_b4_empirical_pct - 21.00, 2) AS delta_p4_pct,
    p5_b5_empirical_pct, 8.00 AS p5_theoretical_pct, ROUND(p5_b5_empirical_pct - 8.00, 2) AS delta_p5_pct,
    p6_b6_empirical_pct, 2.00 AS p6_theoretical_pct, ROUND(p6_b6_empirical_pct - 2.00, 2) AS delta_p6_pct,
    pct_invalidation_all_pct,

    -- Retornos R Ponderados Canônicos por Ramo (Teórico vs Empírico)
    r_b1_empirical_avg, -1.0000 AS r1_b1_theoretical, ROUND(r_b1_empirical_avg - (-1.0000), 4) AS delta_r1,
    r_b2_empirical_avg, -0.3500 AS r2_b2_theoretical, ROUND(r_b2_empirical_avg - (-0.3500), 4) AS delta_r2,
    r_b3_empirical_avg,  0.3000 AS r3_b3_theoretical, ROUND(r_b3_empirical_avg - 0.3000, 4) AS delta_r3,
    r_b4_empirical_avg,  1.3000 AS r4_b4_theoretical, ROUND(r_b4_empirical_avg - 1.3000, 4) AS delta_r4,
    r_b5_empirical_avg,  2.0500 AS r5_b5_theoretical, ROUND(r_b5_empirical_avg - 2.0500, 4) AS delta_r5,
    r_b6_empirical_avg, -0.6000 AS r6_b6_theoretical, ROUND(r_b6_empirical_avg - (-0.6000), 4) AS delta_r6,

    -- Expectância Agregada e Métricas de Microestrutura
    e_gross_empirical, 0.3395 AS e_gross_theoretical, ROUND(e_gross_empirical - 0.3395, 4) AS delta_e_gross,
    friction_r_empirical,
    e_net_empirical, 0.1260 AS e_net_theoretical, ROUND(e_net_empirical - 0.1260, 4) AS delta_e_net,
    win_rate_net_pct,
    profit_factor_net,
    max_drawdown_pct,
    taker_fallback_pct,
    miss_rate_pct,
    fee_drag_pct,

    -- Gates Unificados (Parcial Econômico vs Integral com Microestrutura)
    (e_net_empirical >= 0.1000 AND pct_invalidation_all_pct <= 30.00 AND n_total >= 300) AS econ_gate_qualified,
    (e_net_empirical >= 0.1000 AND pct_invalidation_all_pct <= 30.00 AND n_total >= 300 
     AND (win_rate_net_pct >= 48.0 OR profit_factor_net >= 1.300) 
     AND max_drawdown_pct <= 10.0 
     AND taker_fallback_pct <= 10.0 
     AND miss_rate_pct <= 15.0 
     AND fee_drag_pct <= 40.0) AS full_gate_qualified,
    -- gate_qualified espelha a condição integral idêntica à função SQL do snapshot
    (e_net_empirical >= 0.1000 AND pct_invalidation_all_pct <= 30.00 AND n_total >= 300 
     AND (win_rate_net_pct >= 48.0 OR profit_factor_net >= 1.300) 
     AND max_drawdown_pct <= 10.0 
     AND taker_fallback_pct <= 10.0 
     AND miss_rate_pct <= 15.0 
     AND fee_drag_pct <= 40.0) AS gate_qualified
FROM empirical;


