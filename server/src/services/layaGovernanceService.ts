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
  private serviceUrl: string;
  private timeoutMs: number;
  private mode: LayaMode;
  private fetchFn: typeof fetch;
  private latencyBuffer: number[] = [];
  private overridesUsedSession: number = 0;
  private pnlAttributedOverrides: number = 0;
  private recentDecisions: LayaMetrics['recentDecisions'] = [];
  private debounceMs: number;
  private lastCallTs: Map<string, number> = new Map();

  constructor(options: LayaServiceOptions = {}) {
    this.serviceUrl = options.serviceUrl || process.env.LAYA_SERVICE_URL || 'http://nexus-decisor-laya.railway.internal:8000';
    this.timeoutMs = options.timeoutMs ?? (Number(process.env.LAYA_TIMEOUT_MS) || 1500);
    this.mode = options.mode || (process.env.LAYA_MODE as LayaMode) || 'ACTIVE';
    this.fetchFn = options.fetchImpl || fetch;
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

    // Debounce por símbolo: suprime chamadas dentro da janela configurada.
    // Ações de proteção (CLOSE_NOW, EARLY_HARVEST_CLOSE) nunca são suprimidas.
    if (this.debounceMs > 0 && !isProtection) {
      const lastTs = this.lastCallTs.get(payload.symbol) ?? 0;
      const now = Date.now();
      if (now - lastTs < this.debounceMs) {
        const silentDecision = this.createDefaultFallbackResponse(payload, 'NO_ACTION');
        return {
          executed: false,
          decision: silentDecision,
          fallbackLocal: true,
          latencyMs: 0
        };
      }
      this.lastCallTs.set(payload.symbol, now);
    }

    const startTime = performance.now();
    const controller = new AbortController();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        controller.abort();
        reject(new Error(`TIMEOUT_${this.timeoutMs}MS_EXCEEDED`));
      }, this.timeoutMs);
    });

    let finalServiceUrl = this.serviceUrl;
    const publicUrl = process.env.RAILWAY_SERVICE_NEXUS_DECISOR_LAYA_URL
      ? `https://${process.env.RAILWAY_SERVICE_NEXUS_DECISOR_LAYA_URL}`
      : 'https://nexus-decisor-laya-production.up.railway.app';

    try {
      // Mapeamento para o contrato oficial do Laya System 1 (POST /v1/systemone)
      const systemOnePayload = {
        state: {
          origem: 'mercado_financeiro',
          body: `Symbol: ${payload.symbol}, Side: ${payload.side || 'BUY'}, Price: ${payload.currentPrice}, RequestedAction: ${requestedAction}, Regime: ${payload.regime || 'NORMAL'}, Imbalance: ${payload.trace?.imbalanceRatio || 0}, CVD: ${payload.trace?.cvdDelta60s || 0}`
        },
        questions: {
          action: {
            type: 'choice',
            instructions: 'Qual acao de governanca tomar para esta oportunidade de mercado?',
            criteria: {
              AUTHORIZE: 'Permitir entrada na operacao ou scale-in',
              VETO: 'Bloquear operacao por confluencia toxica ou risco',
              NO_ACTION: 'Sem acao no momento'
            }
          }
        }
      };

      const doFetch = (url: string) => this.fetchFn(`${url}/v1/systemone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(systemOnePayload),
        signal: controller.signal
      });

      let response: Response;
      try {
        const fetchPromise = doFetch(finalServiceUrl);
        response = await Promise.race([fetchPromise, timeoutPromise]);
      } catch (firstErr: any) {
        // Se a rota interna falhar por DNS/conexão imediata e não for timeout, tenta a URL pública
        if (firstErr?.message?.includes('TIMEOUT') || controller.signal.aborted) {
          throw firstErr;
        }
        console.warn(`[LayaGovernance] Rota interna ${finalServiceUrl} falhou (${firstErr.message}). Tentando fallback: ${publicUrl}`);
        finalServiceUrl = publicUrl;
        const fallbackPromise = doFetch(finalServiceUrl);
        response = await Promise.race([fallbackPromise, timeoutPromise]);
      }

      const latencyMs = performance.now() - startTime;
      this.recordLatency(latencyMs);

      if (!response.ok) {
        const statusText = await response.text().catch(() => '');
        console.error(`[LayaGovernance] Erro HTTP ${response.status} da Laya em ${finalServiceUrl}:`, statusText.slice(0, 200));
        throw new Error(`HTTP_${response.status}`);
      }

      const layaRaw = (await response.json()) as any;
      const choice = layaRaw?.answers?.action?.choice || 'NO_ACTION';
      const now = Date.now();

      const proposal: LayaGovernanceResponse = {
        decisionId: `laya-${layaRaw?.model || 'rl'}-${now}`,
        stateVersion: payload.stateVersion,
        issuedAt: now,
        expiresAt: now + 3000,
        action: choice as any,
        symbol: payload.symbol,
        powerMultiplier: choice === 'AUTHORIZE' ? 1.5 : 1.0,
        riskPct: choice === 'AUTHORIZE' ? 1.0 : 0.5,
        governance: {
          allowScaleIn: choice === 'AUTHORIZE',
          cooldownOverride: false
        },
        rationaleCode: choice === 'AUTHORIZE' ? 'DYNAMIC_POWER_AGGRESSION' : (choice === 'VETO' ? 'SPREAD_TOXIC_VETO' : 'NO_OPPORTUNITY'),
        trace: payload.trace
      };

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

      // Identifica o erro exato
      const isTimeout = err?.message?.includes('TIMEOUT') || controller.signal.aborted;
      const errorLabel = isTimeout ? `TIMEOUT_${this.timeoutMs}MS` : (err?.message || 'NETWORK_ERROR');
      console.warn(`[LayaGovernance] Falha na governança Laya (${errorLabel}) após ${latencyMs.toFixed(1)}ms`);

      // Semântica de Falha Dupla
      if (isProtection) {
        // Fail-Open para proteção: nunca impede o corte
        const fallbackDecision = this.createDefaultFallbackResponse(payload, requestedAction);
        this.logDecision(fallbackDecision, true, 'FALLBACK_LOCAL_PROTECTION');
        return {
          executed: true,
          decision: fallbackDecision,
          fallbackLocal: true,
          error: errorLabel,
          latencyMs
        };
      }

      // Fail-Closed para novo risco (entrada, scale-in, potência): sem resposta = recusa
      const noActionDecision = this.createDefaultFallbackResponse(payload, 'NO_ACTION');
      this.logDecision(noActionDecision, false, errorLabel);
      return {
        executed: false,
        decision: noActionDecision,
        error: errorLabel,
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

    // Persistência assíncrona no Event Store v3.0 (PostgreSQL)
    try {
      import('./eventStoreService.js').then(({ EventStoreService }) => {
        EventStoreService.recordDecisionEvent({
          decisionId: proposal.decisionId,
          decisionType: proposal.action,
          symbol: proposal.symbol,
          issuedAt: new Date(proposal.issuedAt || Date.now()),
          expiresAt: new Date(proposal.expiresAt || (Date.now() + 3000)),
          latencyMs: this.latencyBuffer[this.latencyBuffer.length - 1] ?? 0,
          action: proposal.action,
          executed,
          constitutionRejected: Boolean(rejectionReason),
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
          betaDivergence: proposal.trace?.betaDivergence
        });
      }).catch(() => {});
    } catch {}
  }
}

// Export singleton instance default
export const layaGovernanceService = new LayaGovernanceService();
