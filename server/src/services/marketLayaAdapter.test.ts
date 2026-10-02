import test from 'node:test';
import assert from 'node:assert';
import { MarketLayaAdapter } from './marketLayaAdapter.js';
import type { LayaGovernanceRequest } from '../../../shared/layaGovernanceTypes.js';

function request(overrides: Partial<LayaGovernanceRequest> = {}): LayaGovernanceRequest {
  return {
    stateVersion: 2,
    symbol: 'BTC/USDT',
    intentGroup: 'PRE_ENTRY',
    intentSubgroup: 'NEW_OPPORTUNITY',
    side: 'BUY',
    currentPrice: 100_000,
    proposedStopLoss: 99_000,
    proposedTakeProfit: 102_000,
    regime: 'NEUTRAL',
    trace: {
      l2DepthTop20: 500_000,
      imbalanceRatio: 2.1,
      cvdDelta60s: 120_000,
      spoofScore: 0.1,
      betaDivergence: false,
      spreadBps: 2.0
    },
    risk: { accountEquity: 10_000, currentRiskAggregatePct: 0.5, proposedRiskPct: 0.5 },
    ...overrides
  };
}

test('MarketLayaAdapter usa Bearer e contrato market-laya/v1', async () => {
  let seenUrl = '';
  let seenHeaders: any;
  let seenBody: any;
  const fetchImpl = async (url: any, init: any) => {
    seenUrl = String(url);
    seenHeaders = init.headers;
    seenBody = JSON.parse(init.body);
    return new Response(JSON.stringify({
      answers: {
        action: { choice: 'AUTHORIZE', answer_confidence: 0.91 },
        residual_risk: { score: 0.8, answer_confidence: 0.84 },
        needs_review: { noul: 0.2, answer_confidence: 0.8 }
      },
      routing: { model: 'multilingual' }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const adapter = new MarketLayaAdapter({
    baseUrl: 'http://laya-next.internal:8080/',
    apiKey: 'secret',
    fetchImpl: fetchImpl as any
  });

  const result = await adapter.evaluate(request());

  assert.strictEqual(seenUrl, 'http://laya-next.internal:8080/v1/systemone');
  assert.strictEqual(seenHeaders.Authorization, 'Bearer secret');
  assert.strictEqual(seenBody.state.domain, 'mercado_financeiro');
  assert.strictEqual(seenBody.state.contractVersion, 'market-laya/v1');
  assert.strictEqual(seenBody.state.domainPreFiltersPassed, true);
  assert.strictEqual(seenBody.questions.action.type, 'choice');
  assert.strictEqual(seenBody.questions.residual_risk.type, 'score');
  assert.strictEqual(seenBody.questions.needs_review.type, 'noul');
  assert.strictEqual(result.action, 'AUTHORIZE');
  assert.strictEqual(result.actionConfidence, 0.91);
  assert.strictEqual(result.routingModel, 'multilingual');
});

test('MarketLayaAdapter usa critérios de lifecycle sem embutir thresholds da constituição', async () => {
  let body: any;
  const adapter = new MarketLayaAdapter({
    apiKey: 'secret',
    fetchImpl: (async (_url: any, init: any) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({
        answers: { action: { choice: 'CLOSE_NOW', answer_confidence: 0.88 } }
      }), { status: 200 });
    }) as any
  });

  await adapter.evaluate(request({
    intentGroup: 'POSITION_LIFECYCLE',
    intentSubgroup: 'DEFENSE_CONTRARIAN_FLOW',
    currentR: -0.4
  }));

  const criteria = body.questions.action.criteria;
  assert.deepStrictEqual(Object.keys(criteria).sort(), ['CLOSE_NOW', 'HOLD']);
  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, /5\.0 bps|55 bps|MAX_FINANCIAL_RISK|1\.5%/);
});

test('MarketLayaAdapter exige credencial e rejeita HTTP inválido', async () => {
  const old = process.env.LAYA_API_KEY;
  delete process.env.LAYA_API_KEY;
  try {
    const noKey = new MarketLayaAdapter({ apiKey: '' });
    await assert.rejects(() => noKey.evaluate(request()), /LAYA_API_KEY ausente/);
  } finally {
    if (old !== undefined) process.env.LAYA_API_KEY = old;
  }

  const badHttp = new MarketLayaAdapter({
    apiKey: 'secret',
    fetchImpl: (async () => new Response('denied', { status: 401 })) as any
  });
  await assert.rejects(() => badHttp.evaluate(request()), /LAYA_NATIVE_HTTP_401/);
});
