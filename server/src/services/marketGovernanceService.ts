import crypto from 'crypto';
import type {
  MarketGovernanceRequest,
  MarketGovernanceResponse,
  ConstitutionContext,
  ConstitutionCheckResult,
  MarketGovernanceMode,
  MarketMetrics
} from '../../../shared/marketGovernanceTypes.js';

import { evaluateMarketDeterministicGovernance } from './marketDeterministicGovernance.js';

export const MAX_FINANCIAL_RISK_PCT = 1.5;
export const MAX_VALIDITY_SPAN_MS = 3000;
export const MAX_SESSION_PARDONS = 3;
export const MAX_SAFE_SPREAD_BPS = 5.0; // 5 basis points = 0.05% de spread máximo tolerável
export const VETO_QUARANTINE_MS = 60000; // 60s de quarentena para pares que tomaram VETO
export const MAX_ALLOWED_RISK_CAP = 2.0; // Teto prudente de potência (PowerMultiplier max 2.0x)



export function isSpreadToxicLocal(spreadBps?: number): boolean {
  if (spreadBps === undefined || spreadBps === null || spreadBps <= 0) return false;
  return spreadBps > MAX_SAFE_SPREAD_BPS;
}

export function isProposalExpired(
  proposal: MarketGovernanceResponse,
  currentTimeMs: number = Date.now()
): boolean {
  if (!proposal.issuedAt || !proposal.expiresAt) return true;
  const validitySpan = proposal.expiresAt - proposal.issuedAt;
  if (validitySpan > MAX_VALIDITY_SPAN_MS || validitySpan <= 0) return true;
  return currentTimeMs > proposal.expiresAt;
}

export function validateConstitutionRules(
  proposal: MarketGovernanceResponse,
  context: ConstitutionContext = {}
): ConstitutionCheckResult {
  if (proposal.governance?.stopLossMoveDirection === 'WIDEN') {
    return { approved: false, rejectionReason: 'REJECTED_BY_CONSTITUTION: STOP_CANNOT_WIDEN' };
  }
  if (proposal.riskPct > MAX_FINANCIAL_RISK_PCT) {
    return { approved: false, rejectionReason: 'REJECTED_BY_CONSTITUTION: RISK_EXCEEDS_MAX_CAP' };
  }
  if (proposal.action === 'AUTHORIZE_SCALE_IN' || proposal.governance?.allowScaleIn) {
    const currentR = context.currentR ?? 0;
    if (currentR < 1.2) {
      return { approved: false, rejectionReason: 'REJECTED_BY_CONSTITUTION: SCALE_IN_REQUIRES_1_2R_PROFIT' };
    }
  }
  if (context.clusterExposureUsdt && context.maxClusterExposureUsdt) {
    if (context.clusterExposureUsdt >= context.maxClusterExposureUsdt) {
      return { approved: false, rejectionReason: 'REJECTED_BY_CONSTITUTION: CLUSTER_BETA_EXPOSURE_CAP_REACHED' };
    }
  }
  return { approved: true };
}

export interface MarketGovernanceServiceOptions {
  mode?: MarketGovernanceMode;
  fetchImpl?: typeof fetch;
}

export interface GovernanceExecutionResult {
  executed: boolean;
  decision: MarketGovernanceResponse;
  fallbackLocal?: boolean;
  error?: string;
  rejectionReason?: string;
  latencyMs: number;
}

export class MarketGovernanceService {
  private mode: MarketGovernanceMode;
  private latencyBuffer: number[] = [];
  private overridesUsedSession: number = 0;
  private pnlAttributedOverrides: number = 0;
  private recentDecisions: MarketMetrics['recentDecisions'] = [];
  private decisionAuditContext: Map<string, {
    intentGroup?: string;
    intentSubgroup?: string;
    requestedAction?: string;
    remoteChoice?: string;
    remoteVerdict?: string;
    requestPayload?: Record<string, any>;
    responsePayload?: Record<string, any>;
  }> = new Map();

  constructor(options: MarketGovernanceServiceOptions = {}) {
    this.mode = options.mode || (process.env.MARKET_GOVERNANCE_MODE as MarketGovernanceMode) || 'ACTIVE';
    // Legacy integration options are accepted for compatibility, never executed.
  }

  public setMode(mode: MarketGovernanceMode): void {
    this.mode = mode;
  }

  public getMode(): MarketGovernanceMode {
    return this.mode;
  }

  /**
   * Zera o estado de sessão: buffer de decisões em memória,
   * contadores de override e buffer de latência.
   * Chamado pelo endpoint POST /api/admin/laya/reset-decisions.
   */
  public resetSession(): void {
    this.recentDecisions = [];
    this.overridesUsedSession = 0;
    this.pnlAttributedOverrides = 0;
    this.latencyBuffer = [];
    console.log('[MarketGovernance] Sessão zerada: buffers limpos.');
  }

  public recordCounterfactual(decisionId: string, resultR: number): void {
    this.pnlAttributedOverrides += resultR;
    const target = this.recentDecisions.find((d: any) => d.decisionId === decisionId);
    if (target) {
      (target as any).counterfactualR = resultR;
    }
  }

  public getMetrics(): MarketMetrics {
    const sorted = [...this.latencyBuffer].sort((a, b) => a - b);
    const p50 = sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : 0;
    const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;

    return {
      mode: this.mode,
      p50LatencyMs: Number(p50.toFixed(2)),
      p95LatencyMs: Number(p95.toFixed(2)),
      overridesUsedSession: this.overridesUsedSession,
      maxOverridesPerSession: MAX_SESSION_PARDONS,
      pnlAttributedOverrides: Number(this.pnlAttributedOverrides.toFixed(2)),
      recentDecisions: [...this.recentDecisions]
    };
  }

  public getStatus() {
    const metrics = this.getMetrics();
    return {
      mode: this.mode,
      source: 'MARKET_DETERMINISTIC_GOVERNANCE',
      integrations: { laya: 'REMOVED', sentinel: 'REMOVED' },
      layaTacticalMode: 'OFF' as const,
      metrics: {
        latencyP50: metrics.p50LatencyMs,
        latencyP95: metrics.p95LatencyMs,
        sessionPardonsUsed: metrics.overridesUsedSession,
        maxSessionPardons: metrics.maxOverridesPerSession,
        totalDecisions: this.recentDecisions.length,
        counterfactualPnL: metrics.pnlAttributedOverrides
      },
      recentDecisions: metrics.recentDecisions
    };
  }

  private isProtectionAction(action?: string): boolean {
    return action === 'CLOSE_NOW' || action === 'EARLY_HARVEST_CLOSE';
  }

  private createDefaultFallbackResponse(req: MarketGovernanceRequest, action: any = 'NO_ACTION'): MarketGovernanceResponse {
    const now = Date.now();
    return {
      decisionId: crypto.randomUUID(),
      stateVersion: req.stateVersion,
      issuedAt: now,
      expiresAt: now + 1000,
      action,
      symbol: req.symbol,
      side: req.side,
      powerMultiplier: 1.0,
      riskPct: 0.5,
      governance: {},
      rationaleCode: 'NO_OPPORTUNITY',
      trace: req.trace
    };
  }

  public async requestGovernance(
    payload: MarketGovernanceRequest,
    context: ConstitutionContext = {}
  ): Promise<GovernanceExecutionResult> {
    const started = performance.now();
    const requestedAction = payload.requestedAction || 'AUTHORIZE';
    const isProtection = this.isProtectionAction(requestedAction);

    // OFF preserva o comportamento legado: não cria nova autorização,
    // mas nunca impede uma ação explícita de proteção.
    if (this.mode === 'OFF') {
      const decision = this.createDefaultFallbackResponse(
        payload,
        isProtection ? requestedAction : 'NO_ACTION'
      );
      return {
        executed: isProtection,
        decision,
        fallbackLocal: true,
        latencyMs: performance.now() - started
      };
    }

    const effectivePayload: MarketGovernanceRequest = {
      ...payload,
      macro: {
        ...(payload.macro || {}),
        regime: payload.macro?.regime || payload.regime || 'UNKNOWN'
      }
    };
    const local = evaluateMarketDeterministicGovernance(effectivePayload);

    const now = Date.now();
    const decisionId = crypto.randomUUID();

    const powerMultiplier = local.choice === 'AUTHORIZE' ? 1.5 : 1.0;

    const isScaleIn =
      payload.intentGroup === 'POSITION_LIFECYCLE'
      && payload.intentSubgroup === 'SCALE_IN_REQUEST'
      && local.verdict === 'AUTHORIZE_SCALE_IN';

    let normalizedAction: string = isScaleIn ? 'AUTHORIZE_SCALE_IN' : local.choice;
    let normalizedRationale = local.rationale;

    const proposal: MarketGovernanceResponse = {
      decisionId,
      stateVersion: payload.stateVersion,
      issuedAt: now,
      expiresAt: now + 3000,
      action: normalizedAction as any,
      symbol: payload.symbol,
      side: payload.side,
      powerMultiplier: Math.min(Math.max(powerMultiplier, 0.5), MAX_ALLOWED_RISK_CAP),
      riskPct: local.choice === 'AUTHORIZE' ? 1.0 : 0.5,
      governance: {
        allowScaleIn: isScaleIn,
        cooldownOverride: local.choice === 'OVERRIDE_COOLDOWN',
        executionMode: local.executionMode
      },
      rationaleCode: normalizedRationale as any,
      trace: payload.trace,
      signalSource: payload.signalSource || payload.intentSubgroup || 'FLOW_SIGNAL',
      vetoRuleCode: local.choice === 'VETO' ? local.rationale : undefined
    };

    this.decisionAuditContext.set(decisionId, {
      intentGroup: payload.intentGroup,
      intentSubgroup: payload.intentSubgroup,
      requestedAction,
      requestPayload: {
        contractVersion: 'market-deterministic-governance/v1',
        payload: effectivePayload
      },
      responsePayload: {
        source: 'MARKET_DETERMINISTIC_GOVERNANCE',
        choice: local.choice,
        verdict: local.verdict,
        rationale: local.rationale,
        confidence: local.confidence,
        normalizedAction,
        normalizedRationale,
        integrations: { laya: 'REMOVED', sentinel: 'REMOVED' }
      }
    });

    const latencyMs = performance.now() - started;
    this.recordLatency(latencyMs);

    if (isProposalExpired(proposal)) {
      return this.handleRejection(
        proposal,
        latencyMs,
        'REJECTED: PROPOSAL_EXPIRED_OR_DILATED'
      );
    }

    const constitution = validateConstitutionRules(proposal, context);
    if (!constitution.approved) {
      return this.handleRejection(
        proposal,
        latencyMs,
        constitution.rejectionReason!
      );
    }

    if (proposal.action === 'OVERRIDE_COOLDOWN' || proposal.governance?.cooldownOverride) {
      if (this.overridesUsedSession >= MAX_SESSION_PARDONS) {
        return this.handleRejection(
          proposal,
          latencyMs,
          'REJECTED: SESSION_PARDON_LIMIT_EXCEEDED'
        );
      }
    }

    const isApprovedAction =
      proposal.action !== 'VETO'
      && proposal.action !== 'NO_ACTION'
      && proposal.action !== 'HOLD';
    const executed = this.mode === 'ACTIVE' && isApprovedAction;

    if (
      executed
      && (proposal.action === 'OVERRIDE_COOLDOWN' || proposal.governance?.cooldownOverride)
    ) {
      this.overridesUsedSession++;
    }

    this.logDecision(proposal, executed);
    return {
      executed,
      decision: proposal,
      fallbackLocal: true,
      latencyMs
    };
  }

  private handleRejection(proposal: MarketGovernanceResponse, latencyMs: number, reason: string): GovernanceExecutionResult {
    this.logDecision(proposal, false, reason);
    return {
      executed: false,
      decision: proposal,
      rejectionReason: reason,
      latencyMs
    };
  }

  private recordLatency(ms: number) {
    this.latencyBuffer.push(ms);
    if (this.latencyBuffer.length > 200) {
      this.latencyBuffer.shift();
    }
  }

  private logDecision(proposal: MarketGovernanceResponse, executed: boolean, rejectionReason?: string) {
    const audit = this.decisionAuditContext.get(proposal.decisionId);
    this.recentDecisions.unshift({
      decisionId: proposal.decisionId,
      timestamp: Date.now(),
      action: proposal.action,
      symbol: proposal.symbol,
      executed,
      rejectionReason,
      rationaleCode: proposal.rationaleCode
    });
    if (this.recentDecisions.length > 50) {
      this.recentDecisions.pop();
    }

    // Persistência assíncrona no Event Store v3.0 (PostgreSQL)
    try {
      import('./eventStoreService.js').then(({ EventStoreService }) => {
        EventStoreService.recordDecisionEvent({
          decisionId: proposal.decisionId,
          decisionType: proposal.action,
          symbol: proposal.symbol,
          side: proposal.side,
          direction: proposal.side === 'SELL' ? 'SHORT' : proposal.side === 'BUY' ? 'LONG' : null,
          issuedAt: new Date(proposal.issuedAt || Date.now()),
          expiresAt: new Date(proposal.expiresAt || (Date.now() + 3000)),
          latencyMs: this.latencyBuffer[this.latencyBuffer.length - 1] ?? 0,
          action: proposal.action,
          normalizedAction: proposal.action,
          executed,
          constitutionRejected: Boolean(rejectionReason?.startsWith('REJECTED_BY_CONSTITUTION')),
          rejectionReason,
          powerMultiplier: proposal.powerMultiplier,
          riskPct: proposal.riskPct,
          stopLossPct: proposal.governance?.stopLossProposalPct,
          stopDirection: proposal.governance?.stopLossMoveDirection,
          cooldownOverride: proposal.governance?.cooldownOverride,
          runnerAllowed: proposal.governance?.runnerModeAllowed,
          scaleInAllowed: proposal.governance?.allowScaleIn,
          rationaleCode: proposal.rationaleCode,
          l2DepthTop20: proposal.trace?.l2DepthTop20,
          imbalanceRatio: proposal.trace?.imbalanceRatio,
          cvdDelta60s: proposal.trace?.cvdDelta60s,
          spoofScore: proposal.trace?.spoofScore,
          betaDivergence: proposal.trace?.betaDivergence,
          signalSource: proposal.signalSource,
          spreadBps: proposal.trace?.spreadBps,
          deltaStopBps: Number((audit?.requestPayload as any)?.state?.delta_stop_bps || 0),
          wallPersistenceMs: Number(proposal.trace?.wallPersistenceMs || 0),
          vetoRuleCode: proposal.vetoRuleCode,
          intentGroup: audit?.intentGroup,
          intentSubgroup: audit?.intentSubgroup,
          requestedAction: audit?.requestedAction,
          governanceMode: this.mode,
          executionMode: proposal.governance?.executionMode,
          remoteChoice: audit?.remoteChoice,
          remoteVerdict: audit?.remoteVerdict,
          confidenceScore: Number((audit?.responsePayload as any)?.confidence || 0) || undefined,
          requestPayload: audit?.requestPayload,
          responsePayload: audit?.responsePayload,
          runMode: 'PAPER_MASTER'
        });
      }).catch(() => {});
    } catch {}
    this.decisionAuditContext.delete(proposal.decisionId);
  }
}

export const marketGovernanceService = new MarketGovernanceService();
