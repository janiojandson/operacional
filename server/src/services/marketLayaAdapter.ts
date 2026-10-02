export type MarketLayaRoute = 'MECHANICAL_PIPELINE' | 'DEEP_REVIEW' | 'ABSTAIN';
export type MarketLayaEntryAction = 'ENTER_LONG' | 'ENTER_SHORT' | 'WAIT' | 'ABSTAIN';
export type MarketLayaPositionAction = 'HOLD' | 'EXIT' | 'ABSTAIN';

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
  holdingSeconds?: number;
  partialTaken?: boolean;
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

export interface MarketLayaTacticalDecision<TAction extends string> {
  action: TAction;
  confidence: number;
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

interface ChoiceRequest<TAction extends string> {
  facts: MarketLayaFacts;
  contractVersion: string;
  stage: string;
  body: string;
  questionName: string;
  instructions: string;
  criteria: Record<TAction, string>;
  allowed: readonly TAction[];
  minConfidence: number;
}

export class MarketLayaAdapter {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: MarketLayaAdapterOptions = {}) {
    this.baseUrl = options.baseUrl || process.env.MARKET_LAYA_NATIVE_URL || '';
    this.apiKey = options.apiKey || process.env.MARKET_LAYA_AUTH_TOKEN || process.env.MARKET_LAYA_API_KEY;
    this.timeoutMs = options.timeoutMs ?? Number(process.env.MARKET_LAYA_TIMEOUT_MS || 4000);
    this.fetchFn = options.fetchImpl || fetch;
  }

  private assertConfigured(): void {
    if (!this.baseUrl) {
      throw new Error('MARKET_LAYA_NATIVE_URL ausente para contrato nativo do Mercado');
    }
    if (!this.apiKey) {
      throw new Error('MARKET_LAYA_API_KEY ausente para contrato nativo do Mercado');
    }
  }

  private async askChoice<TAction extends string>(
    request: ChoiceRequest<TAction>
  ): Promise<MarketLayaTacticalDecision<TAction>> {
    this.assertConfigured();

    const payload = {
      state: {
        body: request.body,
        domain: 'mercado_financeiro',
        contractVersion: request.contractVersion,
        stage: request.stage,
        hardSafetyGatesRemainAuthoritative: true,
        facts: request.facts
      },
      questions: {
        [request.questionName]: {
          type: 'choice',
          instructions: request.instructions,
          criteria: request.criteria
        }
      },
      lang: 'pt',
      min_confidence: request.minConfidence
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
      const answer = data.answers?.[request.questionName];
      const rawAction = String(answer?.choice || '').trim().toUpperCase() as TAction;

      if (!request.allowed.includes(rawAction)) {
        throw new Error(
          `Laya nativa retornou ação inválida em ${request.stage}: ${rawAction || 'ausente'}`
        );
      }

      const confidence = Number(answer?.answer_confidence);
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        throw new Error('Laya nativa retornou answer_confidence inválida');
      }

      const abstention = typeof answer?.abstention === 'string' ? answer.abstention : undefined;
      const lowConfidence = answer?.low_confidence === true || abstention === 'abstained';
      const effectiveAction = (
        lowConfidence && request.allowed.includes('ABSTAIN' as TAction)
          ? ('ABSTAIN' as TAction)
          : rawAction
      );

      return {
        action: effectiveAction,
        confidence,
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

  /** Contrato de triagem/roteamento já validado. */
  public async evaluate(facts: MarketLayaFacts): Promise<MarketLayaDecision> {
    const body = [
      'Contexto do projeto Mercado Financeiro já processado pelos filtros determinísticos do domínio.',
      `Ativo: ${facts.symbol}. Lado: ${facts.side || 'não informado'}. Preço: ${facts.currentPrice}.`,
      `Intenção: ${facts.intentGroup || 'não informada'} / ${facts.intentSubgroup || 'não informada'}.`,
      `Spread: ${facts.spreadBps ?? 'desconhecido'} bps. Imbalance L2: ${facts.depthImbalanceRatio ?? 'desconhecido'}.`,
      `CVD 60s: ${facts.cvdDelta60s ?? 'desconhecido'}. Spoof score: ${facts.spoofScore ?? 'desconhecido'}.`,
      `Regime macro: ${facts.regime || 'desconhecido'}. Circuit breaker: ${facts.circuitBreakerActive ? 'ativo' : 'inativo'}.`,
      `Risco agregado: ${facts.currentRiskAggregatePct ?? 'desconhecido'}%. Risco proposto: ${facts.proposedRiskPct ?? 'desconhecido'}%.`,
      `PnL atual em R: ${facts.currentR ?? 'não aplicável'}.`,
      'A Laya atua aqui como Sistema 1 de triagem. Regras de risco e execução continuam fora da Laya.',
      'Roteie para MECHANICAL_PIPELINE se o contexto estiver claro; DEEP_REVIEW se exigir análise deliberada; ABSTAIN se faltar informação.'
    ].join(' ');

    const result = await this.askChoice<MarketLayaRoute>({
      facts,
      contractVersion: 'market-laya/v1',
      stage: 'DOMAIN_TRIAGE',
      body,
      questionName: 'route',
      instructions: 'Para qual caminho de processamento este contexto deve ser encaminhado?',
      criteria: {
        MECHANICAL_PIPELINE: 'Contexto claro para seguir pelas regras determinísticas do Mercado Financeiro.',
        DEEP_REVIEW: 'Contexto ambíguo ou conflitante; exige análise deliberada adicional.',
        ABSTAIN: 'Informação insuficiente para triagem confiável.'
      },
      allowed: ['MECHANICAL_PIPELINE', 'DEEP_REVIEW', 'ABSTAIN'] as const,
      minConfidence: Number(process.env.MARKET_LAYA_MIN_CONFIDENCE || 0.85)
    });

    return {
      route: result.action,
      routeConfidence: result.confidence,
      abstention: result.abstention,
      lowConfidence: result.lowConfidence,
      routingModel: result.routingModel,
      latencyMs: result.latencyMs,
      raw: result.raw
    };
  }

  /**
   * Decisão tática de entrada.
   * O lado é um fato do projeto; a Laya escolhe se vale entrar nele agora ou aguardar.
   */
  public async evaluateEntry(
    facts: MarketLayaFacts
  ): Promise<MarketLayaTacticalDecision<MarketLayaEntryAction>> {
    const expected = facts.side === 'SELL' ? 'ENTER_SHORT' : 'ENTER_LONG';
    const body = [
      'Decisão tática de entrada no Mercado Financeiro após todos os hard gates determinísticos.',
      `Ativo: ${facts.symbol}. Lado candidato: ${facts.side || 'não informado'}. Preço: ${facts.currentPrice}.`,
      `Spread: ${facts.spreadBps ?? 'desconhecido'} bps. Imbalance: ${facts.depthImbalanceRatio ?? 'desconhecido'}.`,
      `CVD 60s: ${facts.cvdDelta60s ?? 'desconhecido'}. Regime: ${facts.regime || 'desconhecido'}.`,
      `Risco agregado/proposto: ${facts.currentRiskAggregatePct ?? 'desconhecido'}/${facts.proposedRiskPct ?? 'desconhecido'}.`,
      `O lado permitido pelo domínio neste contexto é ${expected}.`,
      'A Laya escolhe apenas entre entrar no lado já permitido, esperar ou abster-se. Ela não define tamanho, stop, margem ou tipo de ordem.'
    ].join(' ');

    return this.askChoice<MarketLayaEntryAction>({
      facts,
      contractVersion: 'market-laya-entry/v1',
      stage: 'ENTRY_DECISION',
      body,
      questionName: 'action',
      instructions: 'Qual ação tática de Sistema 1 é adequada para a entrada agora?',
      criteria: {
        ENTER_LONG: 'Entrar comprado somente quando o lado candidato do projeto for BUY e o contexto imediato estiver favorável.',
        ENTER_SHORT: 'Entrar vendido somente quando o lado candidato do projeto for SELL e o contexto imediato estiver favorável.',
        WAIT: 'Não abrir posição neste ciclo; aguardar confirmação adicional do mercado.',
        ABSTAIN: 'Não há confiança suficiente para escolher entrada ou espera.'
      },
      allowed: ['ENTER_LONG', 'ENTER_SHORT', 'WAIT', 'ABSTAIN'] as const,
      minConfidence: Number(process.env.MARKET_LAYA_MIN_CONFIDENCE || 0.85)
    });
  }

  /**
   * Decisão tática de permanência.
   * Stops, circuit breaker e invalidações determinísticas continuam soberanos.
   */
  public async evaluatePosition(
    facts: MarketLayaFacts
  ): Promise<MarketLayaTacticalDecision<MarketLayaPositionAction>> {
    const body = [
      'Gestão tática de uma posição já aberta no Mercado Financeiro.',
      'Nenhum hard exit determinístico deve ser retardado pela Laya; essas proteções continuam soberanas no projeto.',
      `Ativo: ${facts.symbol}. Posição: ${facts.side || 'não informada'}. Preço atual: ${facts.currentPrice}.`,
      `PnL atual: ${facts.currentR ?? 'desconhecido'}R. Tempo em posição: ${facts.holdingSeconds ?? 'desconhecido'}s.`,
      `Spread: ${facts.spreadBps ?? 'desconhecido'} bps. Imbalance: ${facts.depthImbalanceRatio ?? 'desconhecido'}.`,
      `CVD 60s: ${facts.cvdDelta60s ?? 'desconhecido'}. Regime: ${facts.regime || 'desconhecido'}.`,
      'HOLD mantém a posição sob as proteções existentes; EXIT antecipa o fechamento total; ABSTAIN não cria ação financeira.'
    ].join(' ');

    return this.askChoice<MarketLayaPositionAction>({
      facts,
      contractVersion: 'market-laya-position/v1',
      stage: 'POSITION_MANAGEMENT',
      body,
      questionName: 'action',
      instructions: 'Qual ação tática é mais adequada para esta posição agora?',
      criteria: {
        HOLD: 'A posição ainda merece permanecer aberta sob stops e proteções determinísticas.',
        EXIT: 'O contexto deteriorou o suficiente para antecipar o fechamento total da posição.',
        ABSTAIN: 'Não há confiança suficiente para alterar a manutenção normal da posição.'
      },
      allowed: ['HOLD', 'EXIT', 'ABSTAIN'] as const,
      minConfidence: Number(process.env.MARKET_LAYA_MIN_CONFIDENCE || 0.85)
    });
  }
}
