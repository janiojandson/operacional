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
  /** Legacy telemetry fields retained only for backward-compatible readers. */
  operationalRiskScore?: number;
  operationalRiskConfidence?: number;
  needsLlm?: number;
  needsLlmConfidence?: number;
  abstention?: string;
  lowConfidence?: boolean;
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
    this.baseUrl = options.baseUrl || process.env.MARKET_LAYA_NATIVE_URL || '';
    this.apiKey = options.apiKey || process.env.MARKET_LAYA_API_KEY;
    this.timeoutMs = options.timeoutMs ?? Number(process.env.MARKET_LAYA_TIMEOUT_MS || 4000);
    this.fetchFn = options.fetchImpl || fetch;
  }

  public async evaluate(facts: MarketLayaFacts): Promise<MarketLayaDecision> {
    if (!this.baseUrl) {
      throw new Error('MARKET_LAYA_NATIVE_URL ausente para contrato nativo do Mercado');
    }
    if (!this.apiKey) {
      throw new Error('MARKET_LAYA_API_KEY ausente para contrato nativo do Mercado');
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
        }
      },
      lang: 'pt',
      min_confidence: Number(process.env.MARKET_LAYA_MIN_CONFIDENCE || 0.85)
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
      const abstention = typeof routeAnswer?.abstention === 'string' ? routeAnswer.abstention : undefined;
      const lowConfidence = routeAnswer?.low_confidence === true || abstention === 'abstained';

      return {
        route: (lowConfidence ? 'ABSTAIN' : rawRoute) as MarketLayaRoute,
        routeConfidence,
        abstention,
        lowConfidence,
        routingModel: typeof data.routing?.model === 'string' ? data.routing.model : undefined,
        latencyMs: Date.now() - started,
        raw: data
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
