import assert from 'node:assert/strict';
import test from 'node:test';
import { LayaGovernanceService } from './layaGovernanceService.js';
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

function layaResponse(choice: string, verdict: string, rationale: string) {
  return {
    success: true,
    answers: {
      action: {
        choice,
        verdict,
        rationale,
        confidence: 0.98,
        answer_confidence: 0.98
      }
    },
    verdict,
    rationale_code: rationale,
    routing: { model: 'laya-v2-quant-fastpath', latency_ms: 1.2 }
  };
}

test('timeout em PRE_ENTRY retorna NO_ACTION não executado', async () => {
  const mockFetch = async () => {
    await new Promise(resolve => setTimeout(resolve, 60));
    return new Response(JSON.stringify({}), { status: 200 });
  };
  const service = new LayaGovernanceService({ fetchImpl: mockFetch as any, timeoutMs: 25, mode: 'ACTIVE' });
  const result = await service.requestGovernance(createMockRequest());
  assert.equal(result.executed, false);
  assert.equal(result.decision.action, 'NO_ACTION');
  assert.match(result.error || '', /ETIMEDOUT|TIMEOUT/i);
});

test('timeout em CLOSE_NOW usa fallback local de proteção', async () => {
  const mockFetch = async () => await new Promise<Response>(() => {});
  const service = new LayaGovernanceService({ fetchImpl: mockFetch as any, timeoutMs: 25, mode: 'ACTIVE', debounceMs: 0 });
  const result = await service.requestGovernance(createMockRequest({
    intentGroup: 'POSITION_LIFECYCLE',
    intentSubgroup: 'DEFENSE_CONTRARIAN_FLOW',
    requestedAction: 'CLOSE_NOW',
    proposedStopLoss: undefined
  }));
  assert.equal(result.executed, true);
  assert.equal(result.decision.action, 'CLOSE_NOW');
  assert.equal(result.fallbackLocal, true);
});

test('APPROVE_PASSIVE é preservado como AUTHORIZE + MAKER_POST_ONLY', async () => {
  const service = new LayaGovernanceService({
    fetchImpl: (async () => new Response(JSON.stringify(
      layaResponse('AUTHORIZE', 'APPROVE_PASSIVE', 'V08_ABSORPTION_PASSIVE_APPROVED')
    ), { status: 200 })) as any,
    mode: 'ACTIVE'
  });
  const result = await service.requestGovernance(createMockRequest());
  assert.equal(result.executed, true);
  assert.equal(result.decision.action, 'AUTHORIZE');
  assert.equal(result.decision.governance.executionMode, 'MAKER_POST_ONLY');
  assert.equal(result.decision.rationaleCode, 'V08_ABSORPTION_PASSIVE_APPROVED');
  assert.match(result.decision.decisionId, /^[0-9a-f-]{36}$/i);
});

test('VETO remoto permanece fail-closed com rationale original', async () => {
  const service = new LayaGovernanceService({
    fetchImpl: (async () => new Response(JSON.stringify(
      layaResponse('VETO', 'VETO', 'V05_SPOOFING_SUSPECT')
    ), { status: 200 })) as any,
    mode: 'ACTIVE'
  });
  const result = await service.requestGovernance(createMockRequest());
  assert.equal(result.executed, false);
  assert.equal(result.decision.action, 'VETO');
  assert.equal(result.decision.rationaleCode, 'V05_SPOOFING_SUSPECT');
});

test('ação fora do contrato vira VETO em PRE_ENTRY', async () => {
  const service = new LayaGovernanceService({
    fetchImpl: (async () => new Response(JSON.stringify(
      layaResponse('BUY', 'BUY', 'UNEXPECTED_ACTION')
    ), { status: 200 })) as any,
    mode: 'ACTIVE'
  });
  const result = await service.requestGovernance(createMockRequest());
  assert.equal(result.executed, false);
  assert.equal(result.decision.action, 'VETO');
  assert.equal(result.decision.rationaleCode, 'LAYA_CONTRACT_ACTION_INVALID');
});

test('teto de 3 overrides de cooldown continua ativo', async () => {
  const service = new LayaGovernanceService({
    fetchImpl: (async () => new Response(JSON.stringify(
      layaResponse('OVERRIDE_COOLDOWN', 'OVERRIDE_COOLDOWN', 'COOLDOWN_PARDON_SWEEP_RECLAIM')
    ), { status: 200 })) as any,
    mode: 'ACTIVE',
    debounceMs: 0
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

test('SHADOW preserva decisão para contrafactual sem executar', async () => {
  const service = new LayaGovernanceService({
    fetchImpl: (async () => new Response(JSON.stringify(
      layaResponse('AUTHORIZE', 'APPROVE_AGGRESSIVE', 'V08_IMBALANCE_AGGRESSIVE_APPROVED')
    ), { status: 200 })) as any,
    mode: 'SHADOW'
  });
  const result = await service.requestGovernance(createMockRequest());
  assert.equal(result.executed, false);
  service.recordCounterfactual(result.decision.decisionId, 2.3);
  const metrics = service.getMetrics();
  assert.equal(metrics.pnlAttributedOverrides, 2.3);
  assert.equal(metrics.recentDecisions[0].decisionId, result.decision.decisionId);
});
