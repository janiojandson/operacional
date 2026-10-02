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
  entryDecisionId?: string;
  exitDecisionId?: string;
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
  side?: 'BUY' | 'SELL';
  intentGroup?: string;
  intentSubgroup?: string;
  requestedAction?: string;
  normalizedAction?: string;
  governanceMode?: 'OFF' | 'SHADOW' | 'ACTIVE';
  executionMode?: 'MAKER_POST_ONLY' | 'TAKER_IOC';
  remoteChoice?: string;
  remoteVerdict?: string;
  requestPayload?: Record<string, any>;
  responsePayload?: Record<string, any>;
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
    const runMode = input.runMode ?? 'PAPER_MASTER';
    const exitReasonRaw = input.exitReason ?? (input.exitType === 'STOP_FULL' ? 'STOP_LOSS_FULL' : input.exitType === 'STOP_EARLY' ? 'ACTIVE_INVALIDATION' : 'WAVE_HARVEST_BREAKEVEN');
    const exitReason = exitReasonRaw === 'LAYA_CLOSE_NOW' ? 'ACTIVE_INVALIDATION'
      : exitReasonRaw === 'LAYA_EARLY_HARVEST' ? 'RUNNER_TRAILING'
      : ['WAVE_HARVEST_BREAKEVEN', 'RUNNER_TRAILING', 'ACTIVE_INVALIDATION', 'STOP_LOSS_FULL', 'CIRCUIT_BREAKER_EMERGENCY'].includes(exitReasonRaw)
        ? exitReasonRaw
        : 'ACTIVE_INVALIDATION';
    const branchRaw = input.branchClassification ?? (
      exitReasonRaw === 'LAYA_CLOSE_NOW' ? 'B7_LAYA_DEFENSE_EXIT'
      : exitReasonRaw === 'LAYA_EARLY_HARVEST' ? 'B8_LAYA_EARLY_HARVEST'
      : exitReason === 'ACTIVE_INVALIDATION' ? 'B2_INVALIDATION'
      : exitReason === 'STOP_LOSS_FULL' ? 'B1_STOP_FULL'
      : 'B3_BE_POST_HARVEST'
    );
    const branch = branchRaw === 'B7_LAYA_DEFENSE_EXIT' ? 'B2_INVALIDATION'
      : branchRaw === 'B8_LAYA_EARLY_HARVEST' ? 'B4_TARGET_RUNNER'
      : ['B1_STOP_FULL', 'B2_INVALIDATION', 'B3_BE_POST_HARVEST', 'B4_TARGET_RUNNER', 'B5_RUNNER_EXTREME', 'B6_MACRO_EMERGENCY'].includes(branchRaw)
        ? branchRaw
        : 'B3_BE_POST_HARVEST';
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

    const entryDecisionId = input.entryDecisionId && uuidRegex.test(input.entryDecisionId) ? input.entryDecisionId : null;
    const exitDecisionId = input.exitDecisionId && uuidRegex.test(input.exitDecisionId) ? input.exitDecisionId : null;

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
        venue, opened_at, closed_at,
        entry_decision_id, exit_decision_id, exit_reason_raw, branch_classification_raw,
        mfe_r, mae_r, rv_ol, beta_exposure
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13,
        $14, $15, $16,
        $17, $18, $19, $20,
        $21, $22,
        $23, $24, $25, $26, $27,
        $28, $29, $30,
        $31, $32, $33, $34,
        $35, $36, $37, $38
      )
      ON CONFLICT (trade_id) DO NOTHING
    `, [
      tradeUuid, input.symbol, side,
      entryPrice, stopPrice, targetPrice,
      deltaStopBps, entryType, entryFillStatus, runMode,
      Boolean(input.waveHarvestReached), input.waveHarvestPrice ?? null, input.whFillType ?? 'NOT_APPLICABLE',
      input.exitPrice ?? entryPrice, exitReason, branch,
      input.accountBalanceUsd ?? null, posSize, input.grossPnlUsd ?? (input.rGross * 2.5), input.netPnlUsd ?? (rNet * 2.5),
      input.rGross, rNet,
      feesEntry, feesExit, spreadCost, slippage, funding,
      venue, input.entryTs, input.exitTs,
      entryDecisionId, exitDecisionId, exitReasonRaw, branchRaw,
      input.mfeR ?? 0, input.maeR ?? 0, input.rvOL ?? null, input.betaExposure ?? 0
    ]).then(async () => {
      console.log('[EventStore][TRADE_EVENT_PERSISTED]', {
        tradeId: tradeUuid,
        pair: input.symbol,
        side,
        exitReason,
        exitReasonRaw,
        entryDecisionId,
        exitDecisionId,
        netPnlUsd: input.netPnlUsd
      });

      const linkedDecisionIds = [entryDecisionId, exitDecisionId].filter((id): id is string => Boolean(id));
      if (linkedDecisionIds.length > 0) {
        await query(
          'UPDATE decision_events SET trade_id = $1 WHERE decision_id = ANY($2::uuid[]) AND trade_id IS NULL',
          [tradeUuid, linkedDecisionIds]
        ).catch((err: any) => {
          console.error('[EventStore][DECISION_LINK_ERROR]', err?.stack ?? String(err));
        });
      }

      await query('SELECT fn_evaluate_session_lockout()').catch((err: any) => {
        console.error('[EventStore][LOCKOUT_EVAL_ERROR]', err?.stack ?? String(err));
      });
      await query('SELECT fn_evaluate_safe_halt()').catch((err: any) => {
        console.error('[EventStore][SAFE_HALT_EVAL_ERROR]', err?.stack ?? String(err));
      });
    }).catch((err) => {
      console.error('[EventStore][PERSISTENCE_ERROR] Erro ao gravar trade_event v2:', {
        tradeId: tradeUuid,
        pair: input.symbol,
        errorMessage: err?.message,
        errorCode: err?.code,
        errorStack: err?.stack
      });
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
    const side: 'BUY' | 'SELL' = input.side || (input.direction === 'SHORT' ? 'SELL' : 'BUY');
    const legacyActionRequested = input.intentGroup === 'COOLDOWN_AUDIT'
      ? 'COOLDOWN_OVERRIDE'
      : input.intentSubgroup === 'SCALE_IN_REQUEST'
        ? 'SCALE_IN'
        : input.intentGroup === 'POSITION_LIFECYCLE'
          ? 'EXIT_CHECK'
          : 'ENTRY';

    const allowedLegacyVerdicts = new Set(['APPROVE_PASSIVE', 'APPROVE_AGGRESSIVE', 'VETO', 'TIGHTEN']);
    let verdict: 'APPROVE_PASSIVE' | 'APPROVE_AGGRESSIVE' | 'VETO' | 'TIGHTEN' = 'VETO';
    if (input.remoteVerdict && allowedLegacyVerdicts.has(input.remoteVerdict)) {
      verdict = input.remoteVerdict as typeof verdict;
    } else if (input.action === 'VETO' || input.constitutionRejected) {
      verdict = 'VETO';
    } else if (input.stopDirection === 'TIGHTEN') {
      verdict = 'TIGHTEN';
    } else if (input.action === 'AUTHORIZE' || input.action === 'APPROVE' || input.action === 'AUTHORIZE_SCALE_IN') {
      verdict = input.executionMode === 'MAKER_POST_ONLY' ? 'APPROVE_PASSIVE' : 'APPROVE_AGGRESSIVE';
    }

    const vetoRuleCode = input.constitutionRejected
      ? (input.rejectionReason || 'VETO_POLICY')
      : (input.vetoRuleCode || null);
    const signalSource = input.signalSource || input.decisionType || 'FLOW_SIGNAL';
    const normalizedRunMode = input.runMode === 'LIVE_REAL' ? 'LIVE_REAL'
      : input.runMode === 'SHADOW' ? 'SHADOW'
      : 'PAPER_MASTER';
    const normalizedAction = input.normalizedAction || input.action;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const decisionUuid = uuidRegex.test(input.decisionId) ? input.decisionId : crypto.randomUUID();

    query(`
      INSERT INTO decision_events (
        decision_id, pair, signal_source, run_mode, action_requested, side,
        spread_bps, delta_stop_bps, book_imbalance_ratio,
        wall_persistence_ms, wall_state,
        verdict, veto_rule_code, latency_ms,
        intent_group, intent_subgroup, requested_action, normalized_action, governance_mode,
        remote_choice, remote_verdict, rationale_code, rejection_reason,
        executed, constitution_rejected, issued_at, expires_at, confidence_score, execution_mode,
        request_payload, response_payload,
        l2_depth_top20, cvd_delta_60s, spoof_score, beta_divergence
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11,
        $12, $13, $14,
        $15, $16, $17, $18, $19,
        $20, $21, $22, $23,
        $24, $25, $26, $27, $28, $29,
        $30, $31,
        $32, $33, $34, $35
      )
      ON CONFLICT (decision_id) DO NOTHING
    `, [
      decisionUuid, input.symbol, signalSource, normalizedRunMode, legacyActionRequested, side,
      input.spreadBps ?? 0, input.deltaStopBps ?? 0, input.imbalanceRatio ?? 1.0,
      Math.round(input.wallPersistenceMs ?? 0), 'NOT_APPLICABLE',
      verdict, vetoRuleCode, Math.round(input.latencyMs ?? 0),
      input.intentGroup ?? null, input.intentSubgroup ?? null, input.requestedAction ?? null, normalizedAction,
      input.governanceMode ?? null,
      input.remoteChoice ?? null, input.remoteVerdict ?? null, input.rationaleCode, input.rejectionReason ?? null,
      Boolean(input.executed), Boolean(input.constitutionRejected), input.issuedAt, input.expiresAt,
      input.confidenceScore ?? null, input.executionMode ?? null,
      input.requestPayload ?? null, input.responsePayload ?? null,
      input.l2DepthTop20 ?? null, input.cvdDelta60s ?? null, input.spoofScore ?? null, input.betaDivergence ?? false
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
      SET attributed_r = $1,
          counterfactual_r_multiple = $2,
          counterfactual_simulated = TRUE,
          delta_r = $3
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
       WHERE normalized_action = 'NO_ACTION'
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
