import type {
  LayaGovernanceRequest,
  LayaGovernanceResponse,
  ConstitutionContext,
  ConstitutionCheckResult,
  LayaMode,
  LayaMetrics
} from '../../../shared/layaGovernanceTypes.js';

export const MAX_FINANCIAL_RISK_PCT = 1.5;
export const MAX_VALIDITY_SPAN_MS = 3000;
export const MAX_SESSION_PARDONS = 3;

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
  serviceUrl?: string;
  timeoutMs?: number;
  mode?: LayaMode;
  fetchImpl?: typeof fetch;
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
  private serviceUrl: string;
  private timeoutMs: number;
  private mode: LayaMode;
  private fetchFn: typeof fetch;
  private latencyBuffer: number[] = [];
  private overridesUsedSession: number = 0;
  private pnlAttributedOverrides: number = 0;
  private recentDecisions: LayaMetrics['recentDecisions'] = [];

  constructor(options: LayaServiceOptions = {}) {
    this.serviceUrl = options.serviceUrl || process.env.LAYA_SERVICE_URL || 'http://nexus-decisor-laya.railway.internal:8000';
    this.timeoutMs = options.timeoutMs ?? 25;
    this.mode = options.mode || (process.env.LAYA_MODE as LayaMode) || 'SHADOW';
    this.fetchFn = options.fetchImpl || fetch;
  }

  public setMode(mode: LayaMode): void {
    this.mode = mode;
  }

  public getMode(): LayaMode {
    return this.mode;
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

  private isProtectionAction(action?: string): boolean {
    return action === 'CLOSE_NOW' || action === 'EARLY_HARVEST_CLOSE';
  }

  private createDefaultFallbackResponse(req: LayaGovernanceRequest, action: any = 'NO_ACTION'): LayaGovernanceResponse {
    const now = Date.now();
    return {
      decisionId: `local-fallback-${now}`,
      stateVersion: req.stateVersion,
      issuedAt: now,
      expiresAt: now + 1000,
      action,
      symbol: req.symbol,
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
    const requestedAction = payload.requestedAction || 'AUTHORIZE';
    const isProtection = this.isProtectionAction(requestedAction);

    // Modo OFF: Motor mecânico puro, ignora Laya
    if (this.mode === 'OFF') {
      const decision = this.createDefaultFallbackResponse(payload, isProtection ? requestedAction : 'NO_ACTION');
      return {
        executed: isProtection,
        decision,
        fallbackLocal: true,
        latencyMs: 0
      };
    }

    const startTime = performance.now();
    const controller = new AbortController();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        controller.abort();
        reject(new Error('TIMEOUT_25MS_EXCEEDED'));
      }, this.timeoutMs);
    });

    try {
      const fetchPromise = this.fetchFn(`${this.serviceUrl}/v1/systemone/market-governance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);


      const latencyMs = performance.now() - startTime;
      this.recordLatency(latencyMs);

      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }

      const proposal = (await response.json()) as LayaGovernanceResponse;

      // 1. Validação temporal de expiração
      if (isProposalExpired(proposal)) {
        return this.handleRejection(proposal, latencyMs, 'REJECTED: PROPOSAL_EXPIRED_OR_DILATED');
      }

      // 2. Validação da Constituição de Risco
      const constCheck = validateConstitutionRules(proposal, context);
      if (!constCheck.approved) {
        return this.handleRejection(proposal, latencyMs, constCheck.rejectionReason!);
      }

      // 3. Trava de teto de perdão de cooldown (máximo 3 por sessão)
      if (proposal.action === 'OVERRIDE_COOLDOWN' || proposal.governance?.cooldownOverride) {
        if (this.overridesUsedSession >= MAX_SESSION_PARDONS) {
          return this.handleRejection(proposal, latencyMs, 'REJECTED: SESSION_PARDON_LIMIT_EXCEEDED');
        }
      }

      // Sucesso na governança
      const isApprovedAction = proposal.action !== 'VETO' && proposal.action !== 'NO_ACTION';
      const executed = this.mode === 'ACTIVE' && isApprovedAction;
      if (executed && (proposal.action === 'OVERRIDE_COOLDOWN' || proposal.governance?.cooldownOverride)) {
        this.overridesUsedSession++;
      }

      this.logDecision(proposal, executed);

      return {
        executed,
        decision: proposal,
        latencyMs
      };
    } catch (err: any) {
      const latencyMs = performance.now() - startTime;
      this.recordLatency(latencyMs);

      // Semântica de Falha Dupla
      if (isProtection) {
        // Fail-Open para proteção: nunca impede o corte
        const fallbackDecision = this.createDefaultFallbackResponse(payload, requestedAction);
        this.logDecision(fallbackDecision, true, 'FALLBACK_LOCAL_PROTECTION');
        return {
          executed: true,
          decision: fallbackDecision,
          fallbackLocal: true,
          error: 'TIMEOUT_FAIL_OPEN',
          latencyMs
        };
      }

      // Fail-Closed para novo risco (entrada, scale-in, potência): sem resposta = recusa
      const noActionDecision = this.createDefaultFallbackResponse(payload, 'NO_ACTION');
      this.logDecision(noActionDecision, false, 'TIMEOUT_FAIL_CLOSED');
      return {
        executed: false,
        decision: noActionDecision,
        error: 'TIMEOUT_FAIL_CLOSED',
        latencyMs
      };
    }
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
  }
}

// Export singleton instance default
export const layaGovernanceService = new LayaGovernanceService();
