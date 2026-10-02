import type { LayaGovernanceRequest } from '../../../shared/layaGovernanceTypes.js';

export interface MarketLayaNativeDecision {
  action: string;
  actionConfidence: number;
  residualRiskScore?: number;
  residualRiskConfidence?: number;
  needsReview?: number;
  needsReviewConfidence?: number;
  routingModel?: string;
  latencyMs: number;
}

export interface MarketLayaAdapterOptions {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class MarketLayaAdapter {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: MarketLayaAdapterOptions = {}) {
    this.baseUrl = options.baseUrl
      || process.env.MARKET_LAYA_NATIVE_URL
      || 'http://nexus-decisor-laya-next.railway.internal:8080';
    this.apiKey = options.apiKey ?? process.env.LAYA_API_KEY ?? '';
    this.timeoutMs = options.timeoutMs ?? Number(process.env.MARKET_LAYA_TIMEOUT_MS || 2500);
    this.fetchFn = options.fetchImpl || fetch;
  }

  private actionQuestion(payload: LayaGovernanceRequest) {
    const group = payload.intentGroup || 'PRE_ENTRY';
    const subgroup = payload.intentSubgroup || 'NEW_OPPORTUNITY';

    if (group === 'COOLDOWN_AUDIT') {
      return {
        instructions: 'Qual decisão residual de Sistema 1 cabe ao pedido de reentrada após cooldown?',
        criteria: {
          OVERRIDE_COOLDOWN: 'Evidências preparadas pelo domínio sustentam reavaliação da reentrada.',
          VETO: 'Evidências são insuficientes ou contraditórias; manter cooldown.'
        }
      };
    }
    if (group === 'POSITION_LIFECYCLE' && subgroup === 'DEFENSE_CONTRARIAN_FLOW') {
      return {
        instructions: 'Qual decisão residual cabe à defesa da posição diante do fluxo contrário?',
        criteria: {
          CLOSE_NOW: 'Os fatos fornecidos indicam deterioração coerente com encerramento defensivo.',
          HOLD: 'Os fatos ainda são compatíveis com oscilação normal da posição.'
        }
      };
    }
    if (group === 'POSITION_LIFECYCLE' && subgroup === 'RUNNER_EVALUATION') {
      return {
        instructions: 'Qual decisão residual cabe ao runner já lucrativo?',
        criteria: {
          EARLY_HARVEST_CLOSE: 'Os fatos indicam exaustão suficiente para colher antecipadamente.',
          CONVERT_TO_SUPER_RUNNER: 'Os fatos indicam continuidade excepcional sem exaustão relevante.',
          HOLD: 'Não há evidência residual suficiente para alterar o trailing normal.'
        }
      };
    }
    if (group === 'POSITION_LIFECYCLE' && subgroup === 'SCALE_IN_REQUEST') {
      return {
        instructions: 'Qual decisão residual cabe ao pedido de scale-in?',
        criteria: {
          AUTHORIZE: 'Os fatos permanecem coerentes para seguir à validação determinística do scale-in.',
          VETO: 'Há inconsistência residual suficiente para bloquear o scale-in.'
        }
      };
    }
    return {
      instructions: 'Qual decisão residual de Sistema 1 cabe à oportunidade de pré-entrada?',
      criteria: {
        AUTHORIZE: 'Os fatos preparados pelo motor do domínio permanecem coerentes; seguir à validação final.',
        VETO: 'Há contradição residual relevante; bloquear a oportunidade.'
      }
    };
  }

  public async evaluate(payload: LayaGovernanceRequest): Promise<MarketLayaNativeDecision> {
    if (!this.apiKey) throw new Error('LAYA_API_KEY ausente para contrato nativo de mercado');
    const action = this.actionQuestion(payload);
    const body = {
      state: {
        domain: 'mercado_financeiro',
        contractVersion: 'market-laya/v1',
        stage: payload.intentGroup || 'PRE_ENTRY',
        substage: payload.intentSubgroup || 'NEW_OPPORTUNITY',
        domainPreFiltersPassed: true,
        facts: {
          symbol: payload.symbol,
          side: payload.side,
          currentPrice: payload.currentPrice,
          proposedStopLoss: payload.proposedStopLoss,
          proposedTakeProfit: payload.proposedTakeProfit,
          currentR: payload.currentR,
          lastExitMsAgo: payload.lastExitMsAgo,
          regime: payload.regime,
          signalSource: payload.signalSource,
          evidence: payload.evidence || {},
          trace: payload.trace || {},
          macro: payload.macro || {},
          risk: payload.risk || {}
        }
      },
      questions: {
        action: { type: 'choice', instructions: action.instructions, criteria: action.criteria },
        residual_risk: {
          type: 'score',
          instructions: 'Qual o risco residual após os filtros determinísticos do domínio?',
          criteria: ['baixo', 'moderado', 'alto', 'crítico']
        },
        needs_review: {
          type: 'noul',
          instructions: 'Os fatos apresentam ambiguidade que exige revisão adicional antes de mudar exposição?'
        }
      },
      lang: 'pt'
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = performance.now();
    try {
      const response = await this.fetchFn(`${this.baseUrl.replace(/\/$/, '')}/v1/systemone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`LAYA_NATIVE_HTTP_${response.status}`);

      const data: any = await response.json();
      const answer = data.answers?.action;
      const actionChoice = String(answer?.choice || '').trim().toUpperCase();
      const actionConfidence = Number(answer?.answer_confidence);
      if (!actionChoice || !Number.isFinite(actionConfidence)) {
        throw new Error('LAYA_NATIVE_INVALID_RESPONSE');
      }
      const risk = data.answers?.residual_risk;
      const review = data.answers?.needs_review;
      return {
        action: actionChoice,
        actionConfidence,
        residualRiskScore: Number.isFinite(Number(risk?.score)) ? Number(risk.score) : undefined,
        residualRiskConfidence: Number.isFinite(Number(risk?.answer_confidence))
          ? Number(risk.answer_confidence) : undefined,
        needsReview: Number.isFinite(Number(review?.noul)) ? Number(review.noul) : undefined,
        needsReviewConfidence: Number.isFinite(Number(review?.answer_confidence))
          ? Number(review.answer_confidence) : undefined,
        routingModel: typeof data.routing?.model === 'string' ? data.routing.model : undefined,
        latencyMs: performance.now() - started
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
