import crypto from 'crypto';
import type {
  LayaGovernanceRequest,
  LayaGovernanceResponse,
  ConstitutionContext,
  ConstitutionCheckResult,
  LayaMode,
  LayaMetrics
} from '../../../shared/layaGovernanceTypes.js';
import { macroSentinelClient } from './macroSentinelService.js';
import { MarketLayaAdapter } from './marketLayaAdapter.js';
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
  proposal: LayaGovernanceResponse,
  currentTimeMs: number = Date.now()
): boolean {
  if (!proposal.issuedAt || !proposal.expiresAt) return true;
  const validitySpan = proposal.expiresAt - proposal.issuedAt;
  if (validitySpan > MAX_VALIDITY_SPAN_MS || validitySpan <= 0) return true;
  return currentTimeMs > proposal.expiresAt;
}

export function validateConstitutionRules(
  proposal: LayaGovernanceResponse,
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

export interface LayaServiceOptions {
  mode?: LayaMode;
  fetchImpl?: typeof fetch;
  marketLayaAdapter?: MarketLayaAdapter;
  marketLayaShadowEnabled?: boolean;
  /** Janela de supressão de chamadas repetidas por símbolo em ms (0 = desativado). Configurável via LAYA_DEBOUNCE_MS */
  debounceMs?: number;
}

export interface GovernanceExecutionResult {
  executed: boolean;
  decision: LayaGovernanceResponse;
  fallbackLocal?: boolean;
  error?: string;
  rejectionReason?: string;
  latencyMs: number;
}

export class LayaGovernanceService {
  private mode: LayaMode;
  private fetchFn: typeof fetch;
  private marketLayaAdapter: MarketLayaAdapter;
  private marketLayaShadowEnabled: boolean;
  private latencyBuffer: number[] = [];
  private overridesUsedSession: number = 0;
  private pnlAttributedOverrides: number = 0;
  private recentDecisions: LayaMetrics['recentDecisions'] = [];
  private debounceMs: number;
  private lastCallTs: Map<string, number> = new Map();
  private vetoQuarantineMap: Map<string, { ts: number; reason: string }> = new Map();
  private decisionAuditContext: Map<string, {
    intentGroup?: string;
    intentSubgroup?: string;
    requestedAction?: string;
    remoteChoice?: string;
    remoteVerdict?: string;
    requestPayload?: Record<string, any>;
    responsePayload?: Record<string, any>;
  }> = new Map();

  constructor(options: LayaServiceOptions = {}) {
    this.mode = options.mode || (process.env.MARKET_GOVERNANCE_MODE as LayaMode) || (process.env.LAYA_MODE as LayaMode) || 'ACTIVE';
    this.fetchFn = options.fetchImpl || fetch;
    this.marketLayaAdapter = options.marketLayaAdapter || new MarketLayaAdapter({ fetchImpl: this.fetchFn });
    this.marketLayaShadowEnabled = options.marketLayaShadowEnabled
      ?? process.env.MARKET_LAYA_SHADOW_ENABLED === 'true';
    this.debounceMs = options.debounceMs ?? (Number(process.env.LAYA_DEBOUNCE_MS) || 0);
  }

  public setMode(mode: LayaMode): void {
    this.mode = mode;
  }

  public getMode(): LayaMode {
    return this.mode;
  }

  /**
   * Zera o estado de sessão: buffer de decisões em memória,
   * contadores de override, buffer de latência e mapa de debounce.
   * Chamado pelo endpoint POST /api/admin/laya/reset-decisions.
   */
  public resetSession(): void {
    this.recentDecisions = [];
    this.overridesUsedSession = 0;
    this.pnlAttributedOverrides = 0;
    this.latencyBuffer = [];
    this.lastCallTs.clear();
    this.vetoQuarantineMap.clear();
    console.log('[LayaGovernance] Sessão zerada: buffers limpos.');
  }

  public recordCounterfactual(decisionId: string, resultR: number): void {
    this.pnlAttributedOverrides += resultR;
    const target = this.recentDecisions.find(d => d.decisionId === decisionId);
    if (target) {
      (target as any).counterfactualR = resultR;
    }
  }

  public getMetrics(): LayaMetrics {
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

  private createDefaultFallbackResponse(req: LayaGovernanceRequest, action: any = 'NO_ACTION'): LayaGovernanceResponse {
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
    payload: LayaGovernanceRequest,
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

    let macroPred: any = null;
    if (!isProtection) {
      try {
        macroPred = await Promise.race([
          macroSentinelClient.getMacroPrediction(),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('SENTINEL_TIMEOUT_500MS')), 500)
          )
        ]);
      } catch (error: any) {
        console.warn(
          '[MarketGovernance] Sentinel indisponível; seguindo com o estado macro já presente no payload:',
          error?.message || error
        );
      }
    }

    const effectivePayload: LayaGovernanceRequest = {
      ...payload,
      macro: {
        ...(payload.macro || {}),
        regime: payload.macro?.regime || macroPred?.regime || payload.regime || 'NEUTRAL',
        isCircuitBreakerActive:
          payload.macro?.isCircuitBreakerActive ?? macroPred?.isCircuitBreakerActive ?? false,
        powerMultiplier:
          payload.macro?.powerMultiplier ?? macroPred?.powerMultiplier ?? 1.0,
        btcFundingRate:
          payload.macro?.btcFundingRate ?? macroPred?.btcFundingRate ?? 0.0001
      }
    };

    const local = evaluateMarketDeterministicGovernance(effectivePayload);

    // Laya original: somente System 1 advisory/shadow, e apenas após os gates determinísticos.
    if (this.marketLayaShadowEnabled && local.choice !== 'VETO') {
      void this.marketLayaAdapter.evaluate({
        symbol: payload.symbol,
        side: payload.side,
        currentPrice: Number(payload.currentPrice || payload.trace?.entryPrice || 0),
        intentGroup: payload.intentGroup,
        intentSubgroup: payload.intentSubgroup,
        spreadBps: Number(payload.trace?.spreadBps || 0),
        depthImbalanceRatio: Number(
          payload.trace?.depthImbalanceRatio ?? payload.trace?.imbalanceRatio ?? 1
        ),
        cvdDelta60s: Number(payload.trace?.cvdDelta60s || 0),
        spoofScore: Number(payload.trace?.spoofScore || 0),
        betaDivergence: Boolean(payload.trace?.betaDivergence),
        regime: effectivePayload.macro?.regime,
        circuitBreakerActive: Boolean(effectivePayload.macro?.isCircuitBreakerActive),
        currentRiskAggregatePct: payload.risk?.currentRiskAggregatePct,
        proposedRiskPct: payload.risk?.proposedRiskPct,
        currentR: payload.currentR
      }).then((shadow) => {
        console.log(
          `[LayaNativeMarket:SHADOW] symbol=${payload.symbol} route=${shadow.route} ` +
          `confidence=${shadow.routeConfidence.toFixed(4)} risk=${shadow.operationalRiskScore ?? 'n/a'} ` +
          `needsLlm=${shadow.needsLlm ?? 'n/a'} model=${shadow.routingModel ?? 'n/a'} ` +
          `latencyMs=${shadow.latencyMs}`
        );
      }).catch((err: any) => {
        console.warn(
          `[LayaNativeMarket:SHADOW] falha sem impacto financeiro: ${err?.message || err}`
        );
      });
    }

    const now = Date.now();
    const decisionId = crypto.randomUUID();

    let powerMultiplier = local.choice === 'AUTHORIZE' ? 1.5 : 1.0;
    if (local.choice === 'AUTHORIZE' && macroPred?.confidencePct >= 70) {
      const bullishBuy = macroPred.regime === 'BULLISH' && payload.side === 'BUY';
      const bearishSell = macroPred.regime === 'BEARISH_DUMP' && payload.side === 'SELL';
      if (bullishBuy || bearishSell) {
        powerMultiplier = Math.min(powerMultiplier * 1.25, MAX_ALLOWED_RISK_CAP);
      }
    }

    const isScaleIn =
      payload.intentGroup === 'POSITION_LIFECYCLE'
      && payload.intentSubgroup === 'SCALE_IN_REQUEST'
      && local.verdict === 'AUTHORIZE_SCALE_IN';

    const normalizedAction = isScaleIn ? 'AUTHORIZE_SCALE_IN' : local.choice;
    const proposal: LayaGovernanceResponse = {
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
      rationaleCode: local.rationale as any,
      trace: payload.trace,
      signalSource: payload.signalSource || payload.intentSubgroup || 'FLOW_SIGNAL',
      vetoRuleCode: local.choice === 'VETO' ? local.rationale : undefined
    };

    this.decisionAuditContext.set(decisionId, {
      intentGroup: payload.intentGroup,
      intentSubgroup: payload.intentSubgroup,
      requestedAction,
      remoteChoice: undefined,
      remoteVerdict: undefined,
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
        layaRole: 'SHADOW_ADVISORY_ONLY'
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

  private handleRejection(proposal: LayaGovernanceResponse, latencyMs: number, reason: string): GovernanceExecutionResult {
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

  private logDecision(proposal: LayaGovernanceResponse, executed: boolean, rejectionReason?: string) {
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
          confidenceScore: Number((audit?.responsePayload as any)?.answers?.action?.confidence || 0) || undefined,
          requestPayload: audit?.requestPayload,
          responsePayload: audit?.responsePayload,
          runMode: 'PAPER_MASTER'
        });
      }).catch(() => {});
    } catch {}
    this.decisionAuditContext.delete(proposal.decisionId);
  }
}

// Export singleton instance default
export const layaGovernanceService = new LayaGovernanceService();
