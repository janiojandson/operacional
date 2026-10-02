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
  serviceUrl?: string;
  timeoutMs?: number;
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
  private serviceUrl: string;
  private apiKey: string;
  private timeoutMs: number;
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
    this.serviceUrl = options.serviceUrl || process.env.LAYA_SERVICE_URL || 'http://nexus-decisor-laya.railway.internal:8000';
    this.apiKey = process.env.LAYA_API_KEY || '';
    this.timeoutMs = options.timeoutMs ?? (Number(process.env.LAYA_TIMEOUT_MS) || 1500);
    this.mode = options.mode || (process.env.LAYA_MODE as LayaMode) || 'ACTIVE';
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

    // 🛡️ 0. Macro Sentinel (Defesa Direcional, Circuit Breaker e Modulação Ofensiva)
    let macroPred: any = null;
    if (!isProtection) {
      try {
        const sentinelTimeoutMs = 500;
        macroPred = await Promise.race([
          macroSentinelClient.getMacroPrediction(),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('SENTINEL_TIMEOUT_500MS')), sentinelTimeoutMs))
        ]);

        if (macroPred?.isCircuitBreakerActive) {
          const now = Date.now();
          const vetoDecision: LayaGovernanceResponse = {
            decisionId: crypto.randomUUID(),
            stateVersion: payload.stateVersion,
            issuedAt: now,
            expiresAt: now + 3000,
            action: 'VETO',
            symbol: payload.symbol,
            side: payload.side,
            powerMultiplier: 0.5,
            riskPct: 0.2,
            governance: {},
            rationaleCode: 'SENTINEL_CIRCUIT_BREAKER_VETO',
            trace: payload.trace
          };
          this.logDecision(vetoDecision, false, 'SENTINEL_CIRCUIT_BREAKER_TRIGGERED');
          return {
            executed: false,
            decision: vetoDecision,
            fallbackLocal: true,
            rejectionReason: 'MACRO_SENTINEL_CIRCUIT_BREAKER_ACTIVE',
            latencyMs: 0
          };
        }

        // 🛡️ Veto Direcional: Se regime for BEARISH_DUMP, veta ordens de BUY (compras em faca caindo)
        if (macroPred?.regime === 'BEARISH_DUMP' && payload.side === 'BUY') {
          const now = Date.now();
          const vetoDecision: LayaGovernanceResponse = {
            decisionId: crypto.randomUUID(),
            stateVersion: payload.stateVersion,
            issuedAt: now,
            expiresAt: now + 3000,
            action: 'VETO',
            symbol: payload.symbol,
            side: payload.side,
            powerMultiplier: 0.5,
            riskPct: 0.2,
            governance: {},
            rationaleCode: 'SENTINEL_DIRECTIONAL_VETO' as any,
            trace: payload.trace
          };
          this.logDecision(vetoDecision, false, 'SENTINEL_BEARISH_DUMP_BUY_VETO');
          return {
            executed: false,
            decision: vetoDecision,
            fallbackLocal: true,
            rejectionReason: 'SENTINEL_BEARISH_DUMP_BUY_VETO',
            latencyMs: 0
          };
        }
      } catch (error: any) {
        console.warn('[WARN] Sentinel unavailable, defaulting to neutral governance:', error?.message || error);
        macroPred = null;
      }
    }

    // 🛡️ 1. Quarentena de VETO Local: pares com spread tóxico confirmado suprimidos por 60s
    //    NÃO bloqueia pares que entraram em quarentena por outros motivos (ex: VETO genérico da Laya)
    if (!isProtection) {
      const quarantine = this.vetoQuarantineMap.get(payload.symbol);
      const now = Date.now();
      if (quarantine && now - quarantine.ts < VETO_QUARANTINE_MS && quarantine.reason === 'SPREAD_TOXIC_VETO') {
        // Verifica se o spread ATUAL ainda é tóxico antes de suprimir
        const currentSpread = Number(payload.trace?.spreadBps || 0);
        if (currentSpread > MAX_SAFE_SPREAD_BPS) {
          const vetoDecision: LayaGovernanceResponse = {
            decisionId: crypto.randomUUID(),
            stateVersion: payload.stateVersion,
            issuedAt: now,
            expiresAt: now + 2000,
            action: 'VETO',
            symbol: payload.symbol,
            side: payload.side,
            powerMultiplier: 1.0,
            riskPct: 0.5,
            governance: {},
            rationaleCode: 'SPREAD_TOXIC_VETO' as any,
            trace: payload.trace,
            signalSource: payload.signalSource || payload.intentSubgroup || 'FLOW_SIGNAL',
            vetoRuleCode: 'V03_TOXIC_SPREAD'
          };
          this.logDecision(vetoDecision, false, 'QUARANTINE_ACTIVE_SPREAD_TOXIC');
          return {
            executed: false,
            decision: vetoDecision,
            fallbackLocal: true,
            rejectionReason: `QUARANTINE_ACTIVE: ${quarantine.reason}`,
            latencyMs: 0
          };
        } else {
          // Spread normalizou: libera o par imediatamente
          this.vetoQuarantineMap.delete(payload.symbol);
        }
      } else if (quarantine && now - quarantine.ts >= VETO_QUARANTINE_MS) {
        // Quarentena expirada: limpa
        this.vetoQuarantineMap.delete(payload.symbol);
      }
    }

    // 🛡️ 2. Pré-Filtro Local de Spread Tóxico: Se o spread do book L2 for > 5 bps, veta localmente sem HTTP
    const spreadBps = Number(payload.trace?.spreadBps || 0);
    if (isSpreadToxicLocal(spreadBps) && !isProtection) {
      const now = Date.now();
      this.vetoQuarantineMap.set(payload.symbol, { ts: now, reason: 'SPREAD_TOXIC_VETO' });

      console.warn(
        `[LayaPreFilter:SPREAD_TOXIC] Sinal ${payload.symbol} descartado localmente | ` +
        `Spread: ${spreadBps.toFixed(2)} bps > Limite: 5.00 bps`
      );

      const vetoDecision: LayaGovernanceResponse = {
        decisionId: crypto.randomUUID(),
        stateVersion: payload.stateVersion,
        issuedAt: now,
        expiresAt: now + 2000,
        action: 'VETO',
        symbol: payload.symbol,
        side: payload.side,
        powerMultiplier: 1.0,
        riskPct: 0.5,
        governance: {},
        rationaleCode: 'SPREAD_TOXIC_VETO',
        trace: payload.trace,
        signalSource: payload.signalSource || payload.intentSubgroup || 'FLOW_SIGNAL',
        vetoRuleCode: 'V03_TOXIC_SPREAD'
      };
      this.logDecision(vetoDecision, false, 'SPREAD_TOXIC_VETO_LOCAL');
      return {
        executed: false,
        decision: vetoDecision,
        fallbackLocal: true,
        rejectionReason: 'LOCAL_SPREAD_EXCEEDS_MAX_CAP',
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
    let outboundRequestId: string | undefined;
    const publicUrl = process.env.RAILWAY_SERVICE_NEXUS_DECISOR_LAYA_URL
      ? `https://${process.env.RAILWAY_SERVICE_NEXUS_DECISOR_LAYA_URL}`
      : 'https://nexus-decisor-laya-production.up.railway.app';

    try {
      // 🧠 Mapeamento Dinâmico por Grupo e Subgrupo de Intenção (3 Grupos da Laya)
      const intentGroup = payload.intentGroup || 'PRE_ENTRY';
      const intentSubgroup = payload.intentSubgroup || 'NEW_OPPORTUNITY';

      // Laya upstream em SHADOW: apenas triagem System 1, sem poder financeiro.
      if (this.marketLayaShadowEnabled) {
        void this.marketLayaAdapter.evaluate({
          symbol: payload.symbol,
          side: payload.side,
          currentPrice: Number(payload.currentPrice || payload.trace?.entryPrice || 0),
          intentGroup,
          intentSubgroup,
          spreadBps: Number(payload.trace?.spreadBps || 0),
          depthImbalanceRatio: Number(payload.trace?.depthImbalanceRatio ?? payload.trace?.imbalanceRatio ?? 1),
          cvdDelta60s: Number(payload.trace?.cvdDelta60s || 0),
          spoofScore: Number(payload.trace?.spoofScore || 0),
          betaDivergence: Boolean(payload.trace?.betaDivergence),
          regime: payload.regime || payload.macro?.regime,
          circuitBreakerActive: Boolean(payload.macro?.isCircuitBreakerActive),
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
          console.warn(`[LayaNativeMarket:SHADOW] falha sem impacto financeiro: ${err?.message || err}`);
        });
      }

      let contextDescription = `Contexto: ${intentGroup} | Subgrupo: ${intentSubgroup}. Symbol: ${payload.symbol}, Side: ${payload.side || 'BUY'}, Price: ${payload.currentPrice}`;
      let questionInstructions = 'Qual ação de governança tomar?';
      let criteria: Record<string, string> = {
        AUTHORIZE: 'Permitir entrada com potência adequada',
        VETO: 'Bloquear por confluência tóxica ou risco'
      };

      if (intentGroup === 'PRE_ENTRY') {
        contextDescription += `, Regime: ${payload.regime || 'NORMAL'}, Imbalance: ${payload.trace?.imbalanceRatio || 0}, CVD: ${payload.trace?.cvdDelta60s || 0}. Triagem de nova oportunidade do zero.`;
        questionInstructions = 'Decisão de pré-entrada no ativo:';
        criteria = {
          AUTHORIZE: 'Aprovar entrada e dimensionar potência (1.5x a 6.0x)',
          VETO: 'Vetar por risco de spread, spoofing ou consolidação'
        };
      } else if (intentGroup === 'COOLDOWN_AUDIT') {
        contextDescription += `, UltimaSaidaMs: ${payload.lastExitMsAgo || 0}. Avaliar se houve Liquidity Sweep para quebra de cooldown.`;
        questionInstructions = 'Decisão sobre perdão de cooldown pós-stop:';
        criteria = {
          OVERRIDE_COOLDOWN: 'Conceder perdão: Liquidity sweep e rejeição confirmados',
          VETO: 'Manter cooldown: Mercado sem estrutura de reversão'
        };
      } else if (intentGroup === 'POSITION_LIFECYCLE') {
        contextDescription += `, PnL_R: ${payload.currentR || 0}R, CVD: ${payload.trace?.cvdDelta60s || 0}. Posição aberta em curso.`;
        if (intentSubgroup === 'DEFENSE_CONTRARIAN_FLOW') {
          questionInstructions = 'Ação de defesa ativa por fluxo contrário:';
          criteria = {
            CLOSE_NOW: 'Encerrar posição imediatamente a mercado',
            HOLD: 'Manter posição: oscilação normal'
          };
        } else if (intentSubgroup === 'RUNNER_EVALUATION') {
          questionInstructions = 'Ação de colheita/expansão de lucro parcial:';
          criteria = {
            CONVERT_TO_SUPER_RUNNER: 'Esticar trade: vácuo institucional sem resistência',
            EARLY_HARVEST_CLOSE: 'Colher lucro no topo: absorção passiva e exaustão',
            HOLD: 'Manter trailing normal'
          };
        } else if (intentSubgroup === 'SCALE_IN_REQUEST') {
          questionInstructions = 'Decisão sobre piramidagem de lote a favor:';
          criteria = {
            AUTHORIZE: 'Autorizar scale-in adicional',
            VETO: 'Bloquear scale-in: risco assimétrico desfavorável'
          };
        }
      }

      const currentPrice = Number(payload.currentPrice || payload.trace?.entryPrice || 0);
      const proposedStop = Number(payload.proposedStopLoss || payload.trace?.stopPrice || 0);
      const deltaStopBps = currentPrice > 0 && proposedStop > 0
        ? Number(((Math.abs(currentPrice - proposedStop) / currentPrice) * 10000).toFixed(2))
        : 0;

      const requestId = crypto.randomUUID();
      const systemOnePayload = {
        state: {
          origem: 'mercado_financeiro',
          body: contextDescription,
          stateVersion: '2.0',
          requestId,
          timestamp: Date.now(),
          symbol: payload.symbol,
          side: payload.side,
          currentPrice,
          proposedStopLoss: proposedStop,
          proposedTakeProfit: Number(payload.proposedTakeProfit || 0),
          delta_stop_bps: deltaStopBps,
          intentGroup,
          intentSubgroup,
          currentR: Number(payload.currentR || 0),
          evidence: payload.evidence || {},
          signalSource: payload.signalSource || payload.intentSubgroup || 'FLOW_SIGNAL',
          microstructure: {
            bestBid: Number(payload.trace?.bestBid || 0),
            bestAsk: Number(payload.trace?.bestAsk || 0),
            spreadBps: Number(payload.trace?.spreadBps || 0),
            depthImbalanceRatio: Number(payload.trace?.depthImbalanceRatio ?? payload.trace?.imbalanceRatio ?? 1.0),
            whaleWallDetected: Boolean(payload.trace?.whaleWallDetected),
            whaleWallDistancePct: Number(payload.trace?.whaleWallDistancePct || 0),
            whaleWallVolumeUsd: Number(payload.trace?.whaleWallVolumeUsd || 0),
            wall_persistence_ms: Number(payload.trace?.wallPersistenceMs || 0)
          },
          macro: {
            regime: payload.macro?.regime || macroPred?.regime || 'NEUTRAL',
            circuitBreakerActive: Boolean(payload.macro?.isCircuitBreakerActive ?? macroPred?.isCircuitBreakerActive ?? false),
            powerMultiplier: Number(payload.macro?.powerMultiplier ?? macroPred?.powerMultiplier ?? 1.0),
            btcFundingRate: Number(payload.macro?.btcFundingRate ?? macroPred?.btcFundingRate ?? 0.0001)
          },
          risk: {
            accountEquity: Number(payload.risk?.accountEquity || 10000),
            currentRiskAggregatePct: Number(payload.risk?.currentRiskAggregatePct || 0),
            proposedRiskPct: Number(payload.risk?.proposedRiskPct || 0.01),
            atr14: Number(payload.risk?.atr14 || 0)
          }
        },
        questions: {
          action: {
            type: 'choice',
            instructions: questionInstructions,
            criteria
          }
        }
      };

      outboundRequestId = requestId;
      this.decisionAuditContext.set(requestId, {
        intentGroup,
        intentSubgroup,
        requestedAction,
        requestPayload: systemOnePayload
      });

      const doFetch = (url: string) => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (this.apiKey) headers['x-laya-key'] = this.apiKey;
        return this.fetchFn(`${url}/v1/systemone`, {
          method: 'POST',
          headers,
          body: JSON.stringify(systemOnePayload),
          signal: controller.signal
        });
      };

      let response: Response;
      try {
        const fetchPromise = doFetch(finalServiceUrl);
        response = await Promise.race([fetchPromise, timeoutPromise]);
        console.log(`[LayaGovernance] Resposta via rota interna (${finalServiceUrl}) em ${(performance.now() - startTime).toFixed(1)}ms`);
      } catch (firstErr: any) {
        // Se a rota interna falhar por DNS/conexão imediata e não for timeout, tenta a URL pública
        if (firstErr?.message?.includes('TIMEOUT') || controller.signal.aborted) {
          throw firstErr;
        }
        console.warn(`[LayaGovernance] Rota interna ${finalServiceUrl} falhou (${firstErr.message}). Tentando fallback: ${publicUrl}`);
        finalServiceUrl = publicUrl;
        const fallbackPromise = doFetch(finalServiceUrl);
        response = await Promise.race([fallbackPromise, timeoutPromise]);
        console.warn(`[LayaGovernance] Resposta via FALLBACK PUBLICO (${publicUrl}) em ${(performance.now() - startTime).toFixed(1)}ms`);
      }

      const latencyMs = performance.now() - startTime;
      this.recordLatency(latencyMs);

      if (!response.ok) {
        const statusText = await response.text().catch(() => '');
        const currentAudit = this.decisionAuditContext.get(requestId);
        if (currentAudit) {
          this.decisionAuditContext.set(requestId, {
            ...currentAudit,
            responsePayload: { httpStatus: response.status, body: statusText.slice(0, 2000) }
          });
        }
        console.error(`[LayaGovernance] Erro HTTP ${response.status} da Laya em ${finalServiceUrl}:`, statusText.slice(0, 200));
        throw new Error(`HTTP_${response.status}`);
      }

      const layaRaw = (await response.json()) as any;
      const rawChoice = String(layaRaw?.answers?.action?.choice || 'NO_ACTION').toUpperCase();
      const remoteVerdict = String(layaRaw?.answers?.action?.verdict || layaRaw?.verdict || '').toUpperCase();
      const remoteRationale = String(layaRaw?.answers?.action?.rationale || layaRaw?.rationale_code || '');

      if (process.env.MARKET_DETERMINISTIC_GOVERNANCE_SHADOW_ENABLED === 'true') {
        const local = evaluateMarketDeterministicGovernance(payload);
        const agrees = local.choice === rawChoice
          && (!remoteVerdict || local.verdict === remoteVerdict)
          && (!remoteRationale || local.rationale === remoteRationale);
        console.log(
          `[MarketGovernance:SHADOW_COMPARE] symbol=${payload.symbol} agrees=${agrees} ` +
          `local=${local.choice}/${local.verdict}/${local.rationale} ` +
          `legacy=${rawChoice}/${remoteVerdict || 'n/a'}/${remoteRationale || 'n/a'}`
        );
      }

      const now = Date.now();

      const allowedActions = intentGroup === 'PRE_ENTRY'
        ? new Set(['AUTHORIZE', 'VETO'])
        : intentGroup === 'COOLDOWN_AUDIT'
          ? new Set(['OVERRIDE_COOLDOWN', 'VETO'])
          : intentSubgroup === 'DEFENSE_CONTRARIAN_FLOW'
            ? new Set(['CLOSE_NOW', 'HOLD'])
            : intentSubgroup === 'RUNNER_EVALUATION'
              ? new Set(['EARLY_HARVEST_CLOSE', 'CONVERT_TO_SUPER_RUNNER', 'HOLD'])
              : new Set(['AUTHORIZE', 'VETO']);

      const contractActionValid = allowedActions.has(rawChoice);
      const safeFallbackAction = intentGroup === 'POSITION_LIFECYCLE' ? 'HOLD' : 'VETO';
      const choice = contractActionValid ? rawChoice : safeFallbackAction;

      // Desacoplamento constitucional: allowScaleIn só é TRUE se for explicitamente SCALE_IN_REQUEST.
      const isScaleInIntent = intentGroup === 'POSITION_LIFECYCLE' && intentSubgroup === 'SCALE_IN_REQUEST';
      const allowScaleIn = isScaleInIntent && choice === 'AUTHORIZE' && remoteVerdict === 'AUTHORIZE_SCALE_IN';

      let baseMultiplier = choice === 'AUTHORIZE' ? 1.5 : 1.0;
      let rationaleCode = contractActionValid
        ? (remoteRationale || (choice === 'AUTHORIZE' ? 'DYNAMIC_POWER_AGGRESSION' : choice === 'VETO' ? 'LAYA_REMOTE_VETO' : 'NO_OPPORTUNITY'))
        : 'LAYA_CONTRACT_ACTION_INVALID';

      // 🚀 Modulação Ofensiva pelo Sentinel (se score e confiança forem altos)
      if (choice === 'AUTHORIZE' && macroPred && macroPred.confidencePct >= 70) {
        if (macroPred.regime === 'BULLISH' && payload.side === 'BUY') {
          baseMultiplier = Math.min(baseMultiplier * 1.25, MAX_ALLOWED_RISK_CAP);
          rationaleCode = 'SENTINEL_OFFENSIVE_SURGE' as any;
        } else if (macroPred.regime === 'BEARISH_DUMP' && payload.side === 'SELL') {
          baseMultiplier = Math.min(baseMultiplier * 1.25, MAX_ALLOWED_RISK_CAP);
          rationaleCode = 'SENTINEL_OFFENSIVE_SURGE' as any;
        }
      }

      const finalMultiplier = Math.min(Math.max(baseMultiplier, 0.5), MAX_ALLOWED_RISK_CAP);
      const normalizedAction = isScaleInIntent && choice === 'AUTHORIZE' && remoteVerdict === 'AUTHORIZE_SCALE_IN'
        ? 'AUTHORIZE_SCALE_IN'
        : choice;
      const executionMode = remoteVerdict === 'APPROVE_PASSIVE'
        ? 'MAKER_POST_ONLY'
        : remoteVerdict === 'APPROVE_AGGRESSIVE'
          ? 'TAKER_IOC'
          : undefined;

      const proposal: LayaGovernanceResponse = {
        decisionId: requestId,
        stateVersion: payload.stateVersion,
        issuedAt: now,
        expiresAt: now + 3000,
        action: normalizedAction as any,
        symbol: payload.symbol,
        side: payload.side,
        powerMultiplier: finalMultiplier,
        riskPct: choice === 'AUTHORIZE' ? 1.0 : 0.5,
        governance: {
          allowScaleIn,
          cooldownOverride: choice === 'OVERRIDE_COOLDOWN',
          executionMode
        },
        rationaleCode: rationaleCode as any,
        trace: payload.trace,
        signalSource: payload.signalSource || payload.intentSubgroup || 'FLOW_SIGNAL',
        vetoRuleCode: choice === 'VETO' ? (remoteRationale || rationaleCode) : undefined
      };

      this.decisionAuditContext.set(requestId, {
        ...(this.decisionAuditContext.get(requestId) || {}),
        intentGroup,
        intentSubgroup,
        requestedAction,
        remoteChoice: rawChoice,
        remoteVerdict,
        requestPayload: systemOnePayload,
        responsePayload: layaRaw
      });

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

      // Se a IA respondeu VETO por spread tóxico confirmado, colocar em quarentena de 60s
      // VETOs genéricos da Laya (ex: por confluência, regime) NÃO entram em quarentena
      if (proposal.action === 'VETO' && proposal.rationaleCode === 'SPREAD_TOXIC_VETO') {
        this.vetoQuarantineMap.set(payload.symbol, { ts: Date.now(), reason: 'SPREAD_TOXIC_VETO' });
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

      const isAbort = controller.signal.aborted;
      const isTimeout = err?.message?.includes('TIMEOUT') || isAbort;
      const errorCode = err?.code || (isTimeout ? 'ETIMEDOUT' : 'NETWORK_ERROR');
      const errorDetails = err?.response?.data
        ? JSON.stringify(err.response.data)
        : (err?.message || 'UNKNOWN');

      console.error(
        `[LayaGovernance:ERROR] Falha de comunicação com a Laya (:8080) | ` +
        `Code: ${errorCode} | Host: ${this.serviceUrl} | Latencia: ${latencyMs.toFixed(1)}ms | Detalhes: ${errorDetails}`
      );

      if (outboundRequestId) {
        const currentAudit = this.decisionAuditContext.get(outboundRequestId);
        if (currentAudit) {
          this.decisionAuditContext.set(outboundRequestId, {
            ...currentAudit,
            responsePayload: currentAudit.responsePayload || {
              errorCode,
              errorDetails: String(errorDetails).slice(0, 2000),
              timeout: isTimeout
            }
          });
        }
      }

      if (isProtection) {
        const fallbackDecision = this.createDefaultFallbackResponse(payload, requestedAction);
        if (outboundRequestId) fallbackDecision.decisionId = outboundRequestId;
        this.logDecision(fallbackDecision, true, 'FALLBACK_LOCAL_PROTECTION');
        return {
          executed: true,
          decision: fallbackDecision,
          fallbackLocal: true,
          error: `${errorCode}: ${errorDetails}`,
          latencyMs
        };
      }

      const noActionDecision = this.createDefaultFallbackResponse(payload, 'NO_ACTION');
      if (outboundRequestId) noActionDecision.decisionId = outboundRequestId;
      this.logDecision(noActionDecision, false, `${errorCode}: ${errorDetails}`);
      return {
        executed: false,
        decision: noActionDecision,
        error: `${errorCode}: ${errorDetails}`,
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
