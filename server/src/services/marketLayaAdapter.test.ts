import test from 'node:test';
import assert from 'node:assert';
import { MarketLayaAdapter } from './marketLayaAdapter.js';

const FACTS = {
  symbol: 'BTC/USDT',
  side: 'BUY' as const,
  currentPrice: 100_000,
  intentGroup: 'PRE_ENTRY',
  intentSubgroup: 'NEW_OPPORTUNITY',
  spreadBps: 1.8,
  depthImbalanceRatio: 2.7,
  cvdDelta60s: 120_000,
  spoofScore: 0.1,
  betaDivergence: false,
  regime: 'NEUTRAL_RANGING',
  circuitBreakerActive: false,
  currentRiskAggregatePct: 1,
  proposedRiskPct: 0.5
};

test('MarketLayaAdapter usa a Laya original apenas como triagem System 1', async () => {
  let seenPayload: any;
  let seenHeaders: any;
  const adapter = new MarketLayaAdapter({
    baseUrl: 'http://nexus-decisor-laya.railway.internal:8000',
    apiKey: 'test-key',
    fetchImpl: (async (_url: string, init: any) => {
      seenPayload = JSON.parse(init.body);
      seenHeaders = init.headers;
      return {
        ok: true,
        json: async () => ({
          answers: {
            route: { choice: 'MECHANICAL_PIPELINE', answer_confidence: 0.94 },
            operational_risk: { score: 0.6, answer_confidence: 0.81 },
            needs_llm: { noul: 0.2, answer_confidence: 0.8 }
          },
          routing: { model: 'multilingual' }
        })
      } as Response;
    }) as any
  });

  const result = await adapter.evaluate(FACTS);
  assert.strictEqual(seenHeaders.Authorization, 'Bearer test-key');
  assert.strictEqual(seenPayload.state.domain, 'mercado_financeiro');
  assert.strictEqual(seenPayload.state.contractVersion, 'market-laya/v1');
  assert.match(seenPayload.state.body, /nunca autoriza ordem, tamanho, stop, fechamento/);
  assert.strictEqual(seenPayload.questions.route.type, 'choice');
  assert.strictEqual(seenPayload.questions.operational_risk.type, 'score');
  assert.strictEqual(seenPayload.questions.needs_llm.type, 'noul');
  assert.strictEqual(result.route, 'MECHANICAL_PIPELINE');
  assert.strictEqual(result.routeConfidence, 0.94);
  assert.strictEqual(result.routingModel, 'multilingual');
});

test('MarketLayaAdapter falha fechado com rota/confiança inválidas', async () => {
  const bad = new MarketLayaAdapter({
    apiKey: 'k',
    fetchImpl: (async () => ({
      ok: true,
      json: async () => ({ answers: { route: { choice: 'BUY', answer_confidence: 0.99 } } })
    } as Response)) as any
  });
  await assert.rejects(() => bad.evaluate(FACTS), /route inválida/);
});

test('MarketLayaAdapter não aceita LAYA_API_KEY genérica como credencial do Mercado', async () => {
  const previousMarket = process.env.MARKET_LAYA_API_KEY;
  const previousGeneric = process.env.LAYA_API_KEY;
  try {
    delete process.env.MARKET_LAYA_API_KEY;
    process.env.LAYA_API_KEY = 'legacy-key';
    const adapter = new MarketLayaAdapter({
      fetchImpl: (async () => {
        throw new Error('fetch não deveria ser chamado sem MARKET_LAYA_API_KEY');
      }) as any
    });
    await assert.rejects(() => adapter.evaluate(FACTS), /MARKET_LAYA_API_KEY ausente/);
  } finally {
    if (previousMarket === undefined) delete process.env.MARKET_LAYA_API_KEY;
    else process.env.MARKET_LAYA_API_KEY = previousMarket;
    if (previousGeneric === undefined) delete process.env.LAYA_API_KEY;
    else process.env.LAYA_API_KEY = previousGeneric;
  }
});
