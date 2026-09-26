// ==============================================================================
// 📁 server/src/services/eventStoreService.ts
// Service Layer para gravação imutável no Event Store (PostgreSQL) - Nexus v3.0
// ==============================================================================

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
}

export class EventStoreService {
  /**
   * Grava um trade fechado no banco de forma estritamente imutável (Fire-and-forget assíncrono)
   */
  static recordTradeEvent(input: RecordTradeEventInput): void {
    const sessionHour = input.sessionHour ?? input.entryTs.getUTCHours();
    const clusterId = input.clusterId || (input.symbol.startsWith('BTC') ? 'BTC_MAJOR' : 'ALT_L1');
    const governanceMode = input.governanceMode || 'SHADOW';

    query(`
      INSERT INTO trade_events (
        trade_id, symbol, cluster_id, direction,
        entry_ts, exit_ts, session_hour, exit_type,
        risk_planned_r, r_gross, r_net, fees, funding, slippage,
        mfe_r, mae_r, rv_ol, beta_exposure,
        decision_id, decision_type, governance_mode
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      )
    `, [
      input.tradeId, input.symbol, clusterId, input.direction,
      input.entryTs, input.exitTs, sessionHour, input.exitType,
      input.riskPlannedR, input.rGross, input.rNet,
      input.fees ?? 0, input.funding ?? 0, input.slippage ?? 0,
      input.mfeR ?? 0, input.maeR ?? 0, input.rvOL ?? 1.0, input.betaExposure ?? 0,
      input.decisionId ?? null, input.decisionType ?? null, governanceMode
    ]).catch((err) => {
      console.warn('[EventStore] Erro ao gravar trade_event:', err.message);
    });
  }

  /**
   * Grava uma proposta da Laya no banco (Append-only)
   */
  static recordDecisionEvent(input: RecordDecisionEventInput): void {
    query(`
      INSERT INTO decision_events (
        decision_id, decision_type, symbol, direction,
        issued_at, expires_at, latency_ms, action, executed,
        constitution_rejected, rejection_reason, power_multiplier,
        risk_pct, stop_loss_pct, stop_direction, cooldown_override,
        runner_allowed, scale_in_allowed, rationale_code, confidence_score,
        l2_depth_top20, imbalance_ratio, cvd_delta_60s, spoof_score, beta_divergence
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
      )
      ON CONFLICT (decision_id) DO NOTHING
    `, [
      input.decisionId, input.decisionType, input.symbol, input.direction ?? null,
      input.issuedAt, input.expiresAt, input.latencyMs, input.action, Boolean(input.executed),
      Boolean(input.constitutionRejected), input.rejectionReason ?? null, input.powerMultiplier ?? 1.0,
      input.riskPct ?? 1.0, input.stopLossPct ?? null, input.stopDirection ?? null,
      Boolean(input.cooldownOverride), Boolean(input.runnerAllowed), Boolean(input.scaleInAllowed),
      input.rationaleCode, input.confidenceScore ?? 80,
      input.l2DepthTop20 ?? 0, input.imbalanceRatio ?? 1.0, input.cvdDelta60s ?? 0,
      input.spoofScore ?? 0, Boolean(input.betaDivergence)
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
}
