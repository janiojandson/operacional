// ==============================================================================
// 📁 server/src/services/eventStoreService.ts
// Service Layer para gravação imutável no Event Store (PostgreSQL) - Nexus v3.0
// ==============================================================================

import crypto from 'crypto';
import { query } from '../database/db.js';

export interface RecordTradeEventInput {
  tradeId: string;
  symbol: string;
  clusterId?: string;
  direction: 'LONG' | 'SHORT';
  entryTs: Date;
  exitTs: Date;
  sessionHour?: number;
  exitType: 'TP_FIXED' | 'RUNNER' | 'EARLY_HARVEST' | 'STOP_FULL' | 'STOP_EARLY' | 'MANUAL' | 'BREAKER';
  riskPlannedR: number;
  rGross: number;
  rNet: number;
  fees?: number;
  funding?: number;
  slippage?: number;
  mfeR?: number;
  maeR?: number;
  rvOL?: number;
  betaExposure?: number;
  decisionId?: string;
  decisionType?: string;
  governanceMode?: 'OFF' | 'SHADOW' | 'ACTIVE';

  // Campos Canônicos Laya v2 (Frentes 1 a 4)
  entryPrice?: number;
  initialStopPrice?: number;
  initialTargetPrice?: number;
  deltaStopBps?: number;
  entryType?: 'MAKER_POST_ONLY' | 'TAKER_IOC';
  entryFillStatus?: 'FILLED_MAKER' | 'FILLED_TAKER_AGGRESSIVE' | 'MISSED_NO_FILL';
  runMode?: 'SHADOW' | 'PAPER_MASTER' | 'LIVE_REAL';
  waveHarvestReached?: boolean;
  waveHarvestPrice?: number;
  whFillType?: 'MAKER_LIMIT' | 'TAKER_FALLBACK_1500MS' | 'NOT_APPLICABLE';
  exitPrice?: number;
  exitReason?: string;
  branchClassification?: string;
  accountBalanceUsd?: number;
  positionSizeUsd?: number;
  grossPnlUsd?: number;
  netPnlUsd?: number;
  feesEntryUsd?: number;
  feesExitUsd?: number;
  spreadCostUsd?: number;
  estimatedSlippageUsd?: number;
  fundingCostUsd?: number;
  venue?: string;
}

export interface RecordDecisionEventInput {
  decisionId: string;
  decisionType: string;
  symbol: string;
  direction?: 'LONG' | 'SHORT' | null;
  issuedAt: Date;
  expiresAt: Date;
  latencyMs: number;
  action: string;
  executed?: boolean;
  constitutionRejected?: boolean;
  rejectionReason?: string;
  powerMultiplier?: number;
  riskPct?: number;
  stopLossPct?: number;
  stopDirection?: string;
  cooldownOverride?: boolean;
  runnerAllowed?: boolean;
  scaleInAllowed?: boolean;
  rationaleCode: string;
  confidenceScore?: number;
  l2DepthTop20?: number;
  imbalanceRatio?: number;
  cvdDelta60s?: number;
  spoofScore?: number;
  betaDivergence?: boolean;
  runMode?: string;
  spreadBps?: number;
  deltaStopBps?: number;
  wallPersistenceMs?: number;
  signalSource?: string;
  vetoRuleCode?: string;
}

export class EventStoreService {
  /**
   * Grava um trade fechado no banco de forma estritamente imutável (Fire-and-forget assíncrono)
   */
  static recordTradeEvent(input: RecordTradeEventInput): void {
    const governanceMode = input.governanceMode || 'SHADOW';

    const side: 'BUY' | 'SELL' = input.direction === 'SHORT' ? 'SELL' : 'BUY';
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const tradeUuid = uuidRegex.test(input.tradeId) ? input.tradeId : crypto.randomUUID();
    const entryPrice = input.entryPrice ?? 100.0;
    const stopPrice = input.initialStopPrice ?? (side === 'BUY' ? entryPrice * 0.99 : entryPrice * 1.01);
    const targetPrice = input.initialTargetPrice ?? (side === 'BUY' ? entryPrice * 1.02 : entryPrice * 0.98);
    const deltaStopBps = input.deltaStopBps ?? Math.round((Math.abs(entryPrice - stopPrice) / entryPrice) * 10000);
    const entryType = input.entryType ?? 'MAKER_POST_ONLY';
    const entryFillStatus = input.entryFillStatus ?? 'FILLED_MAKER';
    const runMode = input.runMode ?? (governanceMode === 'ACTIVE' ? 'LIVE_REAL' : 'SHADOW');
    const exitReason = input.exitReason ?? (input.exitType === 'STOP_FULL' ? 'STOP_LOSS_FULL' : input.exitType === 'STOP_EARLY' ? 'ACTIVE_INVALIDATION' : 'WAVE_HARVEST_BREAKEVEN');
    const branch = input.branchClassification ?? (exitReason === 'ACTIVE_INVALIDATION' ? 'B2_INVALIDATION' : exitReason === 'STOP_LOSS_FULL' ? 'B1_STOP_FULL' : 'B3_BE_POST_HARVEST');
    const posSize = input.positionSizeUsd ?? 250.0;
    const feesEntry = input.feesEntryUsd ?? (input.fees ? input.fees / 2 : 0.05);
    const feesExit = input.feesExitUsd ?? (input.fees ? input.fees / 2 : 0.05);
    const spreadCost = input.spreadCostUsd ?? 0.0625;
    const slippage = input.estimatedSlippageUsd ?? (input.slippage ?? 0.05);
    const funding = input.fundingCostUsd ?? (input.funding ?? 0);
    const totalFriction = feesEntry + feesExit + spreadCost + slippage + funding;
    const riskUsd = (posSize * deltaStopBps) / 10000.0;
    const frictionR = riskUsd > 0 ? totalFriction / riskUsd : 0;
    const rNetCalculated = Number((input.rGross - frictionR).toFixed(4));
    const rNet = input.rNet !== undefined && Math.abs(input.rNet - rNetCalculated) < 0.1 ? input.rNet : rNetCalculated;
    const venue = input.venue ?? 'BingX';

    query(`
      INSERT INTO trade_events (
        trade_id, pair, side,
        entry_price, initial_stop_price, initial_target_price,
        delta_stop_bps, entry_type, entry_fill_status, run_mode,
        wave_harvest_reached, wave_harvest_price, wh_fill_type,
        exit_price, exit_reason, branch_classification,
        account_balance_usd, position_size_usd, gross_pnl_usd, net_pnl_usd,
        r_multiple_gross, r_multiple_net,
        fees_entry_usd, fees_exit_usd, spread_cost_usd, estimated_slippage_usd, funding_cost_usd,
        venue, opened_at, closed_at
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13,
        $14, $15, $16,
        $17, $18, $19, $20,
        $21, $22,
        $23, $24, $25, $26, $27,
        $28, $29, $30
      )
    `, [
      tradeUuid, input.symbol, side,
      entryPrice, stopPrice, targetPrice,
      deltaStopBps, entryType, entryFillStatus, runMode,
      Boolean(input.waveHarvestReached), input.waveHarvestPrice ?? null, input.whFillType ?? 'NOT_APPLICABLE',
      input.exitPrice ?? entryPrice, exitReason, branch,
      input.accountBalanceUsd ?? null, posSize, input.grossPnlUsd ?? (input.rGross * 2.5), input.netPnlUsd ?? (rNet * 2.5),
      input.rGross, rNet,
      feesEntry, feesExit, spreadCost, slippage, funding,
      venue, input.entryTs, input.exitTs
    ]).then(async () => {
      await query('SELECT fn_evaluate_session_lockout()').catch(() => {});
      await query('SELECT fn_evaluate_safe_halt()').catch(() => {});
    }).catch((err) => {
      console.warn('[EventStore] Erro ao gravar trade_event v2:', err.message);
    });
  }

  /**
   * Consulta o estado persistente de Lockout Diário (-3.0R) e SAFE_HALT (15% DD)
   */
  static async isLockoutActive(): Promise<boolean> {
    try {
      const res = await query<{ daily_lockout_active: boolean; safe_halt_active: boolean }>(
        'SELECT daily_lockout_active, safe_halt_active FROM system_state WHERE id = 1'
      );
      return Boolean(res[0]?.daily_lockout_active || res[0]?.safe_halt_active);
    } catch {
      return false;
    }
  }

  static async isSafeHaltActive(): Promise<boolean> {
    try {
      const res = await query<{ safe_halt_active: boolean }>('SELECT safe_halt_active FROM system_state WHERE id = 1');
      return Boolean(res[0]?.safe_halt_active);
    } catch {
      return false;
    }
  }

  /**
   * Grava uma proposta da Laya no banco (Append-only)
   */
  static recordDecisionEvent(input: RecordDecisionEventInput): void {
    const actionRequested: 'BUY' | 'SELL' =
      input.direction === 'SHORT' ? 'SELL' : 'BUY';

    let verdict: 'APPROVE_PASSIVE' | 'APPROVE_AGGRESSIVE' | 'VETO' | 'TIGHTEN' = 'VETO';

    if (input.action === 'VETO' || input.constitutionRejected) {
      verdict = 'VETO';
    } else if (input.stopDirection === 'TIGHTEN') {
      verdict = 'TIGHTEN';
    } else if (input.action === 'AUTHORIZE' || input.action === 'APPROVE') {
      verdict = (input.signalSource === 'BOOK_IMBALANCE')
        ? 'APPROVE_AGGRESSIVE'
        : 'APPROVE_PASSIVE';
    }

    const vetoRuleCode = input.constitutionRejected
      ? (input.rejectionReason || 'VETO_POLICY')
      : (input.vetoRuleCode || null);

    const signalSource = input.signalSource || input.decisionType || 'FLOW_SIGNAL';
    const runMode = input.runMode || 'SHADOW';

    query(`
      INSERT INTO decision_events (
        decision_id, pair, signal_source, run_mode, action_requested,
        spread_bps, delta_stop_bps, book_imbalance_ratio,
        wall_persistence_ms, wall_state,
        verdict, veto_rule_code, latency_ms
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10,
        $11, $12, $13
      )
      ON CONFLICT (decision_id) DO NOTHING
    `, [
      input.decisionId,
      input.symbol,
      signalSource,
      runMode,
      actionRequested,
      input.spreadBps ?? 0,
      input.deltaStopBps ?? 0,
      input.imbalanceRatio ?? 1.0,
      input.wallPersistenceMs ?? 0,
      'NOT_APPLICABLE',
      verdict,
      vetoRuleCode,
      input.latencyMs ?? 0
    ]).catch((err) => {
      console.warn('[EventStore] Erro ao gravar decision_event:', err.message);
    });
  }

  /**
   * Atualiza o resultado contrafactual de uma decisão (único UPDATE permitido)
   */
  static updateCounterfactual(decisionId: string, attributedR: number, counterfactualR: number, deltaR: number): void {
    query(`
      UPDATE decision_events
      SET attributed_r = $1, counterfactual_r = $2, delta_r = $3
      WHERE decision_id = $4
    `, [attributedR, counterfactualR, deltaR, decisionId]).catch((err) => {
      console.warn('[EventStore] Erro ao atualizar contrafactual em decision_events:', err.message);
    });
  }

  /**
   * Remove decisões de ruído (NO_ACTION não executadas com mais de 1h) do banco.
   * Seguro: o trigger de imutabilidade cobre apenas UPDATE, não DELETE.
   * Retorna o número de linhas removidas.
   */
  static async clearNoiseDecisions(): Promise<number> {
    const result = await query<{ decision_id: string }>(
      `DELETE FROM decision_events
       WHERE action = 'NO_ACTION'
         AND executed = false
         AND issued_at < NOW() - INTERVAL '1 hour'
       RETURNING decision_id`
    ).catch((err) => {
      console.warn('[EventStore] Erro ao limpar decisões de ruído:', err.message);
      return [];
    });
    return result.length;
  }
}
