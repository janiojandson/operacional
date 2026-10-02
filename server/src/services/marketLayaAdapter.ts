export type MarketLayaRoute = 'MECHANICAL_PIPELINE' | 'DEEP_REVIEW' | 'ABSTAIN';

export interface MarketLayaFacts {
  symbol: string;
  side?: 'BUY' | 'SELL';
  currentPrice: number;
  intentGroup?: string;
  intentSubgroup?: string;
  spreadBps?: number;
  depthImbalanceRatio?: number;
  cvdDelta60s?: number;
  spoofScore?: number;
  betaDivergence?: boolean;
  regime?: string;
  circuitBreakerActive?: boolean;
  currentRiskAggregatePct?: number;
  proposedRiskPct?: number;
  currentR?: number;
}

export interface MarketLayaDecision {
  route: MarketLayaRoute;
  routeConfidence: number;
  operationalRiskScore?: number;
  operationalRiskConfidence?: number;
  needsLlm?: number;
  needsLlmConfidence?: number;
  routingModel?: string;
  latencyMs: number;
  raw?: unknown;
}

export interface MarketLayaAdapterOptions {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class MarketLayaAdapter {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: MarketLayaAdapterOptions = {}) {
    this.baseUrl = options.baseUrl
      || process.env.MARKET_LAYA_NATIVE_URL
      || 'http://nexus-decisor-laya.railway.internal:8000';
    this.apiKey = options.apiKey || process.env.MARKET_LAYA_API_KEY || process.env.LAYA_API_KEY;
    this.timeoutMs = options.timeoutMs ?? Number(process.env.MARKET_LAYA_TIMEOUT_MS || 4000);
    this.fetchFn = options.fetchImpl || fetch;
  }

  public async evaluate(facts: MarketLayaFacts): Promise<MarketLayaDecision> {
    if (!this.apiKey) {
      throw new Error('MARKET_LAYA_API_KEY/LAYA_API_KEY ausente para contrato nativo do Mercado');
    }
    const body = [
      'Contexto do projeto Mercado Financeiro já processado pelos filtros determinísticos do domínio.',
      `Ativo: ${facts.symbol}. Lado: ${facts.side || 'não informado'}. Preço: ${facts.currentPrice}.`,
      `Intenção: ${facts.intentGroup || 'não informada'} / ${facts.intentSubgroup || 'não informada'}.`,
      `Spread: ${facts.spreadBps ?? 'desconhecido'} bps. Imbalance L2: ${facts.depthImbalanceRatio ?? 'desconhecido'}.`,
      `CVD 60s: ${facts.cvdDelta60s ?? 'desconhecido'}. Spoof score: ${facts.spoofScore ?? 'desconhecido'}.`,
      `Regime macro: ${facts.regime || 'desconhecido'}. Circuit breaker: ${facts.circuitBreakerActive ? 'ativo' : 'inativo'}.`,
      `Risco agregado: ${facts.currentRiskAggregatePct ?? 'desconhecido'}%. Risco proposto: ${facts.proposedRiskPct ?? 'desconhecido'}%.`,
      `PnL atual em R: ${facts.currentR ?? 'não aplicável'}.`,
      'A Laya atua apenas como Sistema 1 de triagem e nunca autoriza ordem, tamanho, stop, fechamento, piramidagem ou execução.',
      'Roteie para MECHANICAL_PIPELINE se o contexto estiver claro para as regras determinísticas; DEEP_REVIEW se exigir análise deliberada; ABSTAIN se faltar informação.'
    ].join(' ');

    const payload = {
      state: {
        body,
        domain: 'mercado_financeiro',
        contractVersion: 'market-laya/v1',
        stage: 'DOMAIN_TRIAGE',
        facts
      },
      questions: {
        route: {
          type: 'choice',
          instructions: 'Para qual caminho de processamento este contexto deve ser encaminhado?',
          criteria: {
            MECHANICAL_PIPELINE: 'Contexto claro para seguir apenas pelas regras determinísticas do Mercado Financeiro.',
            DEEP_REVIEW: 'Contexto ambíguo ou conflitante; exige análise deliberada adicional.',
            ABSTAIN: 'Informação insuficiente para triagem confiável.'
          }
        },
        operational_risk: {
          type: 'score',
          instructions: 'Qual o risco operacional residual deste contexto para fins de triagem?',
          criteria: ['baixo', 'moderado', 'alto', 'crítico']
        },
        needs_llm: {
          type: 'noul',
          instructions: 'Este contexto exige análise deliberada adicional por um LLM?'
        }
      },
      lang: 'pt'
    };

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchFn(`${this.baseUrl.replace(/\/$/, '')}/v1/systemone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Laya nativa respondeu HTTP ${response.status}`);
      }

      const data: any = await response.json();
      const routeAnswer = data.answers?.route;
      const rawRoute = String(routeAnswer?.choice || '').trim().toUpperCase();
      if (!['MECHANICAL_PIPELINE', 'DEEP_REVIEW', 'ABSTAIN'].includes(rawRoute)) {
        throw new Error(`Laya nativa retornou route inválida: ${rawRoute || 'ausente'}`);
      }

      const routeConfidence = Number(routeAnswer?.answer_confidence);
      if (!Number.isFinite(routeConfidence) || routeConfidence < 0 || routeConfidence > 1) {
        throw new Error('Laya nativa retornou answer_confidence inválida');
      }
      const riskAnswer = data.answers?.operational_risk;
      const needsLlmAnswer = data.answers?.needs_llm;

      return {
        route: rawRoute as MarketLayaRoute,
        routeConfidence,
        operationalRiskScore: Number.isFinite(Number(riskAnswer?.score))
          ? Number(riskAnswer.score) : undefined,
        operationalRiskConfidence: Number.isFinite(Number(riskAnswer?.answer_confidence))
          ? Number(riskAnswer.answer_confidence) : undefined,
        needsLlm: Number.isFinite(Number(needsLlmAnswer?.noul))
          ? Number(needsLlmAnswer.noul) : undefined,
        needsLlmConfidence: Number.isFinite(Number(needsLlmAnswer?.answer_confidence))
          ? Number(needsLlmAnswer.answer_confidence) : undefined,
        routingModel: typeof data.routing?.model === 'string' ? data.routing.model : undefined,
        latencyMs: Date.now() - started,
        raw: data
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
