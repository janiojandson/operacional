import assert from 'node:assert/strict';
import test from 'node:test';
import { LayaGovernanceService, MarketGovernanceService } from './layaGovernanceService.js';
import type { LayaGovernanceRequest } from '../../../shared/layaGovernanceTypes.js';

function createMockRequest(overrides: Partial<LayaGovernanceRequest> = {}): LayaGovernanceRequest {
  return {
    stateVersion: 1,
    symbol: 'BTC/USDT',
    intentGroup: 'PRE_ENTRY',
    intentSubgroup: 'NEW_OPPORTUNITY',
    side: 'BUY',
    currentPrice: 65000,
    proposedStopLoss: 64500,
    requestedAction: 'AUTHORIZE',
    currentR: 0,
    trace: {
      l2DepthTop20: 250000,
      imbalanceRatio: 3.2,
      cvdDelta60s: 400,
      spoofScore: 0.02,
      betaDivergence: false,
      spreadBps: 2.0
    },
    ...overrides
  };
}

function neutralShadow(route = 'DEEP_REVIEW') {
  return {
    evaluate: async () => ({
      route,
      routeConfidence: 0.99,
      operationalRiskScore: 3,
      operationalRiskConfidence: 0.9,
      needsLlm: 1,
      needsLlmConfidence: 0.99,
      routingModel: 'multilingual',
      latencyMs: 1
    })
  } as any;
}

test('PRE_ENTRY é decidido pelo motor determinístico local, sem depender da Laya', async () => {
  const service = new LayaGovernanceService({
    mode: 'ACTIVE',
    marketLayaShadowEnabled: false,
    marketLayaTacticalMode: 'OFF'
  });
  const result = await service.requestGovernance(createMockRequest());

  assert.equal(result.executed, true);
  assert.equal(result.decision.action, 'AUTHORIZE');
  assert.equal(result.decision.governance.executionMode, 'TAKER_IOC');
  assert.equal(result.decision.rationaleCode, 'V08_IMBALANCE_AGGRESSIVE_APPROVED');
  assert.equal(result.fallbackLocal, true);
  assert.match(result.decision.decisionId, /^[0-9a-f-]{36}$/i);
});

test('spread tóxico é vetado pelo Mercado sem chamar Laya', async () => {
  let shadowCalls = 0;
  const service = new LayaGovernanceService({
    mode: 'ACTIVE',
    marketLayaShadowEnabled: true,
    marketLayaTacticalMode: 'OFF',
    marketLayaAdapter: {
      evaluate: async () => {
        shadowCalls++;
        return neutralShadow().evaluate();
      }
    } as any
  });

  const result = await service.requestGovernance(createMockRequest({
    trace: {
      l2DepthTop20: 250000,
      imbalanceRatio: 3.2,
      cvdDelta60s: 400,
      spoofScore: 0.02,
      betaDivergence: false,
      spreadBps: 8.0
    }
  }));

  assert.equal(result.executed, false);
  assert.equal(result.decision.action, 'VETO');
  assert.equal(result.decision.rationaleCode, 'V01_TOXIC_SPREAD');
  assert.equal(shadowCalls, 0);
});

test('Laya shadow adversa não altera autorização determinística do Mercado', async () => {
  let shadowCalls = 0;
  const service = new LayaGovernanceService({
    mode: 'ACTIVE',
    marketLayaShadowEnabled: true,
    marketLayaTacticalMode: 'OFF',
    marketLayaAdapter: {
      evaluate: async () => {
        shadowCalls++;
        return {
          route: 'ABSTAIN',
          routeConfidence: 0.55,
          operationalRiskScore: 3,
          needsLlm: 1,
          latencyMs: 1
        };
      }
    } as any
  });

  const result = await service.requestGovernance(createMockRequest());
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(shadowCalls, 1);
  assert.equal(result.executed, true);
  assert.equal(result.decision.action, 'AUTHORIZE');
  assert.equal(result.decision.rationaleCode, 'V08_IMBALANCE_AGGRESSIVE_APPROVED');
});

test('falha da Laya shadow não bloqueia decisão determinística', async () => {
  const service = new LayaGovernanceService({
    mode: 'ACTIVE',
    marketLayaShadowEnabled: true,
    marketLayaTacticalMode: 'OFF',
    marketLayaAdapter: {
      evaluate: async () => { throw new Error('laya-next offline'); }
    } as any
  });

  const result = await service.requestGovernance(createMockRequest());
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(result.executed, true);
  assert.equal(result.decision.action, 'AUTHORIZE');
  assert.equal(result.decision.rationaleCode, 'V08_IMBALANCE_AGGRESSIVE_APPROVED');
});

test('CLOSE_NOW exige evidência estruturada e prejuízo além de -0.3R', async () => {
  const service = new LayaGovernanceService({
    mode: 'ACTIVE',
    marketLayaShadowEnabled: false,
    marketLayaTacticalMode: 'OFF'
  });

  const noEvidence = await service.requestGovernance(createMockRequest({
    intentGroup: 'POSITION_LIFECYCLE',
    intentSubgroup: 'DEFENSE_CONTRARIAN_FLOW',
    requestedAction: 'CLOSE_NOW',
    proposedStopLoss: undefined,
    currentR: -0.5,
    evidence: { contrarianFlowConfirmed: false }
  }));
  assert.equal(noEvidence.executed, false);
  assert.equal(noEvidence.decision.action, 'HOLD');

  const confirmed = await service.requestGovernance(createMockRequest({
    intentGroup: 'POSITION_LIFECYCLE',
    intentSubgroup: 'DEFENSE_CONTRARIAN_FLOW',
    requestedAction: 'CLOSE_NOW',
    proposedStopLoss: undefined,
    currentR: -0.5,
    evidence: { contrarianFlowConfirmed: true }
  }));
  assert.equal(confirmed.executed, true);
  assert.equal(confirmed.decision.action, 'CLOSE_NOW');
  assert.equal(confirmed.decision.rationaleCode, 'DEFENSE_CONTRARIAN_EXIT');
});

test('teto de 3 overrides de cooldown continua no domínio Mercado', async () => {
  const service = new LayaGovernanceService({
    mode: 'ACTIVE',
    marketLayaShadowEnabled: false,
    marketLayaTacticalMode: 'OFF'
  });
  const request = createMockRequest({
    intentGroup: 'COOLDOWN_AUDIT',
    intentSubgroup: 'LIQUIDITY_SWEEP_REENTRY',
    requestedAction: 'OVERRIDE_COOLDOWN',
    proposedStopLoss: undefined,
    evidence: { liquiditySweepConfirmed: true, rejectionConfirmed: true }
  });

  const r1 = await service.requestGovernance(request);
  const r2 = await service.requestGovernance(request);
  const r3 = await service.requestGovernance(request);
  const r4 = await service.requestGovernance(request);

  assert.equal(r1.executed, true);
  assert.equal(r2.executed, true);
  assert.equal(r3.executed, true);
  assert.equal(r4.executed, false);
  assert.equal(r4.rejectionReason, 'REJECTED: SESSION_PARDON_LIMIT_EXCEEDED');
  assert.equal(service.getMetrics().overridesUsedSession, 3);
});

test('SHADOW calcula decisão local e preserva contrafactual sem executar', async () => {
  const service = new LayaGovernanceService({
    mode: 'SHADOW',
    marketLayaShadowEnabled: false,
    marketLayaTacticalMode: 'OFF'
  });

  const result = await service.requestGovernance(createMockRequest());
  assert.equal(result.executed, false);
  assert.equal(result.decision.action, 'AUTHORIZE');
  assert.equal(result.decision.rationaleCode, 'V08_IMBALANCE_AGGRESSIVE_APPROVED');

  service.recordCounterfactual(result.decision.decisionId, 2.3);
  const metrics = service.getMetrics();
  assert.equal(metrics.pnlAttributedOverrides, 2.3);
  assert.equal(metrics.recentDecisions[0].decisionId, result.decision.decisionId);
});

test('OFF não cria nova autorização mas mantém ação explícita de proteção', async () => {
  const service = new LayaGovernanceService({
    mode: 'OFF',
    marketLayaShadowEnabled: false,
    marketLayaTacticalMode: 'OFF'
  });

  const preEntry = await service.requestGovernance(createMockRequest());
  assert.equal(preEntry.executed, false);
  assert.equal(preEntry.decision.action, 'NO_ACTION');

  const protection = await service.requestGovernance(createMockRequest({
    intentGroup: 'POSITION_LIFECYCLE',
    intentSubgroup: 'DEFENSE_CONTRARIAN_FLOW',
    requestedAction: 'CLOSE_NOW',
    proposedStopLoss: undefined
  }));
  assert.equal(protection.executed, true);
  assert.equal(protection.decision.action, 'CLOSE_NOW');
});

test('MarketGovernanceService é o nome canônico e ignora LAYA_MODE legado', () => {
  assert.strictEqual(LayaGovernanceService, MarketGovernanceService);

  const previousMarket = process.env.MARKET_GOVERNANCE_MODE;
  const previousLegacy = process.env.LAYA_MODE;
  try {
    delete process.env.MARKET_GOVERNANCE_MODE;
    process.env.LAYA_MODE = 'OFF';
    const defaultService = new MarketGovernanceService({ marketLayaShadowEnabled: false, marketLayaTacticalMode: 'OFF' });
    assert.strictEqual(defaultService.getMode(), 'ACTIVE');

    process.env.MARKET_GOVERNANCE_MODE = 'SHADOW';
    const marketService = new MarketGovernanceService({ marketLayaShadowEnabled: false, marketLayaTacticalMode: 'OFF' });
    assert.strictEqual(marketService.getMode(), 'SHADOW');
  } finally {
    if (previousMarket === undefined) delete process.env.MARKET_GOVERNANCE_MODE;
    else process.env.MARKET_GOVERNANCE_MODE = previousMarket;
    if (previousLegacy === undefined) delete process.env.LAYA_MODE;
    else process.env.LAYA_MODE = previousLegacy;
  }
});

test('Laya tática ACTIVE confirma entrada somente no lado permitido pelo Mercado', async () => {
  const service = new MarketGovernanceService({
    mode: 'ACTIVE',
    marketLayaShadowEnabled: false,
    marketLayaTacticalMode: 'ACTIVE',
    marketLayaAdapter: {
      evaluateEntry: async () => ({
        action: 'ENTER_LONG',
        confidence: 0.94,
        abstention: 'passed',
        latencyMs: 1
      })
    } as any
  });

  const result = await service.requestGovernance(createMockRequest({ side: 'BUY' }));
  assert.equal(result.executed, true);
  assert.equal(result.decision.action, 'AUTHORIZE');
  assert.equal(result.decision.rationaleCode, 'V08_IMBALANCE_AGGRESSIVE_APPROVED');
});

test('Laya tática ACTIVE WAIT bloqueia nova entrada sem alterar hard gates', async () => {
  const service = new MarketGovernanceService({
    mode: 'ACTIVE',
    marketLayaShadowEnabled: false,
    marketLayaTacticalMode: 'ACTIVE',
    marketLayaAdapter: {
      evaluateEntry: async () => ({
        action: 'WAIT',
        confidence: 0.92,
        abstention: 'passed',
        latencyMs: 1
      })
    } as any
  });

  const result = await service.requestGovernance(createMockRequest());
  assert.equal(result.executed, false);
  assert.equal(result.decision.action, 'HOLD');
  assert.equal(result.decision.rationaleCode, 'LAYA_TACTICAL_WAIT');
});

test('falha da Laya tática ACTIVE bloqueia entrada de forma fail-closed', async () => {
  const service = new MarketGovernanceService({
    mode: 'ACTIVE',
    marketLayaShadowEnabled: false,
    marketLayaTacticalMode: 'ACTIVE',
    marketLayaAdapter: {
      evaluateEntry: async () => { throw new Error('laya offline'); }
    } as any
  });

  const result = await service.requestGovernance(createMockRequest());
  assert.equal(result.executed, false);
  assert.equal(result.decision.action, 'HOLD');
  assert.equal(result.decision.rationaleCode, 'LAYA_TACTICAL_UNAVAILABLE');
});

test('Laya tática ACTIVE pode antecipar EXIT em POSITION_MONITOR neutro', async () => {
  const service = new MarketGovernanceService({
    mode: 'ACTIVE',
    marketLayaShadowEnabled: false,
    marketLayaTacticalMode: 'ACTIVE',
    marketLayaAdapter: {
      evaluatePosition: async () => ({
        action: 'EXIT',
        confidence: 0.91,
        abstention: 'passed',
        latencyMs: 1
      })
    } as any
  });

  const result = await service.requestGovernance(createMockRequest({
    intentGroup: 'POSITION_LIFECYCLE',
    intentSubgroup: 'POSITION_MONITOR',
    requestedAction: 'HOLD',
    proposedStopLoss: undefined,
    currentR: 0.25
  }));

  assert.equal(result.executed, true);
  assert.equal(result.decision.action, 'CLOSE_NOW');
  assert.equal(result.decision.rationaleCode, 'LAYA_TACTICAL_EXIT');
});

test('hard exit determinístico permanece soberano e não consulta Laya tática', async () => {
  let calls = 0;
  const service = new MarketGovernanceService({
    mode: 'ACTIVE',
    marketLayaShadowEnabled: false,
    marketLayaTacticalMode: 'ACTIVE',
    marketLayaAdapter: {
      evaluatePosition: async () => {
        calls++;
        return { action: 'HOLD', confidence: 0.99, latencyMs: 1 };
      }
    } as any
  });

  const result = await service.requestGovernance(createMockRequest({
    intentGroup: 'POSITION_LIFECYCLE',
    intentSubgroup: 'DEFENSE_CONTRARIAN_FLOW',
    requestedAction: 'CLOSE_NOW',
    proposedStopLoss: undefined,
    currentR: -0.5,
    evidence: { contrarianFlowConfirmed: true }
  }));

  assert.equal(calls, 0);
  assert.equal(result.executed, true);
  assert.equal(result.decision.action, 'CLOSE_NOW');
  assert.equal(result.decision.rationaleCode, 'DEFENSE_CONTRARIAN_EXIT');
});

test('Laya tática ACTIVE ABSTAIN devolve decisão para governança determinística', async () => {
  const service = new MarketGovernanceService({
    mode: 'ACTIVE',
    marketLayaShadowEnabled: false,
    marketLayaTacticalMode: 'ACTIVE',
    marketLayaAdapter: {
      evaluateEntry: async () => ({
        action: 'ABSTAIN',
        confidence: 0.42,
        abstention: 'abstained',
        latencyMs: 1
      })
    } as any
  });

  const result = await service.requestGovernance(createMockRequest({ side: 'BUY' }));
  assert.equal(result.executed, true);
  assert.equal(result.decision.action, 'AUTHORIZE');
  assert.equal(result.decision.rationaleCode, 'V08_IMBALANCE_AGGRESSIVE_APPROVED');
});
