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
    baseUrl: 'https://laya.example',
    apiKey: 'test-key',
    fetchImpl: (async (_url: string, init: any) => {
      seenPayload = JSON.parse(init.body);
      seenHeaders = init.headers;
      return {
        ok: true,
        json: async () => ({
          answers: {
            route: { choice: 'MECHANICAL_PIPELINE', answer_confidence: 0.94, abstention: 'passed' }
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
  assert.match(seenPayload.state.body, /Regras de risco e execução continuam fora da Laya/);
  assert.strictEqual(seenPayload.questions.route.type, 'choice');
  assert.deepStrictEqual(Object.keys(seenPayload.questions), ['route']);
  assert.strictEqual(seenPayload.min_confidence, 0.85);
  assert.strictEqual(result.route, 'MECHANICAL_PIPELINE');
  assert.strictEqual(result.routeConfidence, 0.94);
  assert.strictEqual(result.routingModel, 'multilingual');
});

test('MarketLayaAdapter falha fechado com rota/confiança inválidas', async () => {
  const bad = new MarketLayaAdapter({
    baseUrl: 'https://laya.example',
    apiKey: 'k',
    fetchImpl: (async () => ({
      ok: true,
      json: async () => ({ answers: { route: { choice: 'BUY', answer_confidence: 0.99 } } })
    } as Response)) as any
  });
  await assert.rejects(() => bad.evaluate(FACTS), /ação inválida em DOMAIN_TRIAGE/);
});

test('MarketLayaAdapter exige credencial em endpoint público', async () => {
  const previousAuth = process.env.MARKET_LAYA_AUTH_TOKEN;
  const previousMarket = process.env.MARKET_LAYA_API_KEY;
  const previousGeneric = process.env.LAYA_API_KEY;
  try {
    delete process.env.MARKET_LAYA_AUTH_TOKEN;
    delete process.env.MARKET_LAYA_API_KEY;
    process.env.LAYA_API_KEY = 'legacy-key';
    const adapter = new MarketLayaAdapter({
      baseUrl: 'https://laya.example',
      fetchImpl: (async () => {
        throw new Error('fetch não deveria ser chamado sem credencial pública');
      }) as any
    });
    await assert.rejects(() => adapter.evaluate(FACTS), /Credencial Laya ausente/);
  } finally {
    if (previousAuth === undefined) delete process.env.MARKET_LAYA_AUTH_TOKEN;
    else process.env.MARKET_LAYA_AUTH_TOKEN = previousAuth;
    if (previousMarket === undefined) delete process.env.MARKET_LAYA_API_KEY;
    else process.env.MARKET_LAYA_API_KEY = previousMarket;
    if (previousGeneric === undefined) delete process.env.LAYA_API_KEY;
    else process.env.LAYA_API_KEY = previousGeneric;
  }
});

test('MarketLayaAdapter decide entrada no lado já permitido pelo projeto', async () => {
  let seenPayload: any;
  const adapter = new MarketLayaAdapter({
    baseUrl: 'https://laya.example',
    apiKey: 'k',
    fetchImpl: (async (_url: string, init: any) => {
      seenPayload = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          answers: {
            action: { choice: 'ENTER_LONG', answer_confidence: 0.92, abstention: 'passed' }
          },
          routing: { model: 'multilingual' }
        })
      } as Response;
    }) as any
  });

  const result = await adapter.evaluateEntry(FACTS);
  assert.strictEqual(seenPayload.state.stage, 'ENTRY_DECISION');
  assert.strictEqual(seenPayload.state.contractVersion, 'market-laya-entry/v1');
  assert.deepStrictEqual(Object.keys(seenPayload.questions), ['action']);
  assert.deepStrictEqual(
    Object.keys(seenPayload.questions.action.criteria),
    ['ENTER_LONG', 'ENTER_SHORT', 'WAIT', 'ABSTAIN']
  );
  assert.strictEqual(seenPayload.min_confidence, 0.85);
  assert.strictEqual(result.action, 'ENTER_LONG');
  assert.strictEqual(result.confidence, 0.92);
});

test('MarketLayaAdapter força ABSTAIN em posição quando o upstream abstém', async () => {
  const adapter = new MarketLayaAdapter({
    baseUrl: 'https://laya.example',
    apiKey: 'k',
    fetchImpl: (async () => ({
      ok: true,
      json: async () => ({
        answers: {
          action: {
            choice: 'EXIT',
            answer_confidence: 0.41,
            abstention: 'abstained',
            low_confidence: true
          }
        },
        routing: { model: 'multilingual' }
      })
    } as Response)) as any
  });

  const result = await adapter.evaluatePosition({
    ...FACTS,
    intentGroup: 'POSITION_LIFECYCLE',
    intentSubgroup: 'POSITION_MONITOR',
    currentR: 0.4,
    holdingSeconds: 240
  });

  assert.strictEqual(result.action, 'ABSTAIN');
  assert.strictEqual(result.lowConfidence, true);
});

test('MarketLayaAdapter usa proxy privado sem bearer do cliente', async () => {
  const oldAuth = process.env.MARKET_LAYA_AUTH_TOKEN;
  const oldCompat = process.env.MARKET_LAYA_API_KEY;
  try {
    delete process.env.MARKET_LAYA_AUTH_TOKEN;
    delete process.env.MARKET_LAYA_API_KEY;
    let seenHeaders: any = null;
    const adapter = new MarketLayaAdapter({
      baseUrl: 'http://nexus-decisor-laya.railway.internal:8001',
      fetchImpl: (async (_url: string, init: any) => {
        seenHeaders = init.headers;
        return { ok: true, json: async () => ({ answers: { route: {
          choice: 'MECHANICAL_PIPELINE', answer_confidence: 0.91, abstention: 'passed'
        } } }) } as Response;
      }) as any
    });
    const result = await adapter.evaluate(FACTS);
    assert.strictEqual(seenHeaders.Authorization, undefined);
    assert.strictEqual(result.route, 'MECHANICAL_PIPELINE');
  } finally {
    if (oldAuth === undefined) delete process.env.MARKET_LAYA_AUTH_TOKEN;
    else process.env.MARKET_LAYA_AUTH_TOKEN = oldAuth;
    if (oldCompat === undefined) delete process.env.MARKET_LAYA_API_KEY;
    else process.env.MARKET_LAYA_API_KEY = oldCompat;
  }
});

test('MarketLayaAdapter respeita 503 server busy e faz somente um retry', async () => {
  let calls = 0;
  const adapter = new MarketLayaAdapter({
    baseUrl: 'https://laya.example',
    apiKey: 'k',
    busyRetryMs: 0,
    fetchImpl: (async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          status: 503,
          headers: { get: () => '0' }
        } as any;
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          answers: {
            action: { choice: 'WAIT', answer_confidence: 0.91, abstention: 'passed' }
          },
          routing: { model: 'multilingual' }
        })
      } as any;
    }) as any
  });

  const result = await adapter.evaluateEntry(FACTS);
  assert.strictEqual(calls, 2);
  assert.strictEqual(result.action, 'WAIT');
});

test('MarketLayaAdapter limita rigidamente a duas inferências simultâneas', async () => {
  let active = 0;
  let maxSeen = 0;
  const adapter = new MarketLayaAdapter({
    baseUrl: 'https://laya.example',
    apiKey: 'k',
    maxConcurrent: 2,
    fetchImpl: (async () => {
      active += 1;
      maxSeen = Math.max(maxSeen, active);
      await new Promise((resolve) => setTimeout(resolve, 25));
      active -= 1;
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          answers: {
            action: { choice: 'ABSTAIN', answer_confidence: 0.4, abstention: 'abstained' }
          },
          routing: { model: 'multilingual' }
        })
      } as any;
    }) as any
  });

  await Promise.all([
    adapter.evaluateEntry({ ...FACTS, symbol: 'BTC/USDT' }),
    adapter.evaluateEntry({ ...FACTS, symbol: 'ETH/USDT' }),
    adapter.evaluateEntry({ ...FACTS, symbol: 'SOL/USDT' }),
    adapter.evaluateEntry({ ...FACTS, symbol: 'XRP/USDT' })
  ]);

  assert.strictEqual(maxSeen, 2);
});
