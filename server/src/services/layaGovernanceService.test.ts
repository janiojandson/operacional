import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LayaGovernanceService
} from './layaGovernanceService.js';
import type {
  LayaGovernanceRequest,
  LayaGovernanceResponse
} from '../../../shared/layaGovernanceTypes.js';

// Helper mock request
function createMockRequest(requestedAction: string = 'AUTHORIZE'): LayaGovernanceRequest {
  return {
    stateVersion: 1,
    symbol: 'BTC/USDT',
    side: 'BUY',
    currentPrice: 65000,
    requestedAction,
    lastExitMsAgo: 120000,
    regime: 'TRENDING_UP',
    currentR: 0,
    trace: {
      l2DepthTop20: 250000,
      imbalanceRatio: 3.2,
      cvdDelta60s: 400,
      spoofScore: 0.02,
      betaDivergence: false
    }
  };
}

test('LayaGovernanceService - Test 1: Semântica Fail-Closed em timeout em risco novo', async () => {
  // Mock fetch that hangs or exceeds 25ms
  const mockFetch = async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
    return new Response(JSON.stringify({}), { status: 200 });
  };

  const service = new LayaGovernanceService({
    fetchImpl: mockFetch as any,
    timeoutMs: 25,
    mode: 'ACTIVE'
  });

  const request = createMockRequest('AUTHORIZE');
  const result = await service.requestGovernance(request);

  assert.equal(result.executed, false);
  assert.equal(result.decision.action, 'NO_ACTION');
  assert.equal(result.error, 'TIMEOUT_FAIL_CLOSED');
});

test('LayaGovernanceService - Test 2: Semântica Fail-Open em timeout em ações de proteção', async () => {
  const mockFetch = async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
    return new Response(JSON.stringify({}), { status: 200 });
  };

  const service = new LayaGovernanceService({
    fetchImpl: mockFetch as any,
    timeoutMs: 25,
    mode: 'ACTIVE'
  });

  // Ação de proteção: CLOSE_NOW
  const request = createMockRequest('CLOSE_NOW');
  const result = await service.requestGovernance(request);

  // Na proteção, o motor nunca trava: permite seguir com a proteção local
  assert.equal(result.executed, true);
  assert.equal(result.decision.action, 'CLOSE_NOW');
  assert.equal(result.fallbackLocal, true);
});

test('LayaGovernanceService - Test 3: Rejeição Constitucional (WIDEN ou riskPct > 1.5%)', async () => {
  const now = Date.now();
  const illegalWidenResponse: LayaGovernanceResponse = {
    decisionId: 'dec-widen',
    stateVersion: 1,
    issuedAt: now,
    expiresAt: now + 2000,
    action: 'AUTHORIZE',
    symbol: 'BTC/USDT',
    powerMultiplier: 2.0,
    riskPct: 1.0,
    governance: {
      stopLossMoveDirection: 'WIDEN'
    },
    rationaleCode: 'MICRO_STOP_REORGANIZATION',
    trace: { l2DepthTop20: 100, imbalanceRatio: 2, cvdDelta60s: 10, spoofScore: 0.01, betaDivergence: false }
  };

  const mockFetch = async () => {
    return new Response(JSON.stringify(illegalWidenResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const service = new LayaGovernanceService({
    fetchImpl: mockFetch as any,
    mode: 'ACTIVE'
  });

  const request = createMockRequest('AUTHORIZE');
  const result = await service.requestGovernance(request);

  assert.equal(result.executed, false);
  assert.equal(result.rejectionReason, 'REJECTED_BY_CONSTITUTION: STOP_CANNOT_WIDEN');
});

test('LayaGovernanceService - Test 4: Teto de 3 perdões de cooldown por sessão', async () => {
  const now = Date.now();
  const createPardonResponse = (id: string): LayaGovernanceResponse => ({
    decisionId: id,
    stateVersion: 1,
    issuedAt: now,
    expiresAt: now + 2000,
    action: 'OVERRIDE_COOLDOWN',
    symbol: 'BTC/USDT',
    powerMultiplier: 1.5,
    riskPct: 1.0,
    governance: {
      cooldownOverride: true,
      cooldownOverrideReason: 'LIQUIDITY_SWEEP_CONFIRMED'
    },
    rationaleCode: 'SWEEP_RECLAIM_CVD_CONVERGENT',
    trace: { l2DepthTop20: 100, imbalanceRatio: 2, cvdDelta60s: 10, spoofScore: 0.01, betaDivergence: false }
  });

  let callCount = 0;
  const mockFetch = async () => {
    callCount++;
    return new Response(JSON.stringify(createPardonResponse(`pardon-${callCount}`)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const service = new LayaGovernanceService({
    fetchImpl: mockFetch as any,
    mode: 'ACTIVE'
  });

  // 1º perdão
  const r1 = await service.requestGovernance(createMockRequest('OVERRIDE_COOLDOWN'));
  assert.equal(r1.executed, true);

  // 2º perdão
  const r2 = await service.requestGovernance(createMockRequest('OVERRIDE_COOLDOWN'));
  assert.equal(r2.executed, true);

  // 3º perdão (limite)
  const r3 = await service.requestGovernance(createMockRequest('OVERRIDE_COOLDOWN'));
  assert.equal(r3.executed, true);

  // 4º perdão -> deve ser bloqueado por exceder o teto da sessão
  const r4 = await service.requestGovernance(createMockRequest('OVERRIDE_COOLDOWN'));
  assert.equal(r4.executed, false);
  assert.equal(r4.rejectionReason, 'REJECTED: SESSION_PARDON_LIMIT_EXCEEDED');
  assert.equal(service.getMetrics().overridesUsedSession, 3);
});

test('LayaGovernanceService - Test 5: Métricas p50/p95 e gravação de contrafactual em SHADOW', async () => {
  const now = Date.now();
  const mockResponse: LayaGovernanceResponse = {
    decisionId: 'shadow-dec-1',
    stateVersion: 1,
    issuedAt: now,
    expiresAt: now + 2000,
    action: 'AUTHORIZE',
    symbol: 'BTC/USDT',
    powerMultiplier: 4.0,
    riskPct: 1.0,
    governance: {},
    rationaleCode: 'DYNAMIC_POWER_AGGRESSION',
    trace: { l2DepthTop20: 500000, imbalanceRatio: 4, cvdDelta60s: 500, spoofScore: 0.01, betaDivergence: false }
  };

  const mockFetch = async () => {
    // simula 10ms de latência interna
    await new Promise((r) => setTimeout(r, 10));
    return new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const service = new LayaGovernanceService({
    fetchImpl: mockFetch as any,
    mode: 'SHADOW'
  });

  const request = createMockRequest('AUTHORIZE');
  const result = await service.requestGovernance(request);

  // No modo SHADOW, executed DEVE ser false (não altera o motor real)
  assert.equal(result.executed, false);
  assert.equal(result.decision.decisionId, 'shadow-dec-1');

  // Registrar resultado contrafactual
  service.recordCounterfactual('shadow-dec-1', 2.3);

  const metrics = service.getMetrics();
  assert.equal(metrics.mode, 'SHADOW');
  assert.ok(metrics.p50LatencyMs >= 0);
  assert.ok(metrics.p95LatencyMs >= metrics.p50LatencyMs);
  assert.equal(metrics.pnlAttributedOverrides, 2.3);
  assert.equal(metrics.recentDecisions.length, 1);
  assert.equal(metrics.recentDecisions[0].decisionId, 'shadow-dec-1');
});

test('LayaGovernanceService - Test 6: Gatekeeper VETO bloqueia execução no modo ACTIVE', async () => {
  const now = Date.now();
  const vetoResponse: LayaGovernanceResponse = {
    decisionId: 'veto-dec-1',
    stateVersion: 1,
    issuedAt: now,
    expiresAt: now + 2000,
    action: 'VETO',
    symbol: 'BTC/USDT',
    powerMultiplier: 1.0,
    riskPct: 0.5,
    governance: {},
    rationaleCode: 'SPOOFING_DETECTED_VETO',
    trace: { l2DepthTop20: 100, imbalanceRatio: 1.0, cvdDelta60s: -200, spoofScore: 0.85, betaDivergence: true }
  };

  const service = new LayaGovernanceService({
    fetchImpl: (async () => new Response(JSON.stringify(vetoResponse), { status: 200 })) as any,
    mode: 'ACTIVE'
  });

  const res = await service.requestGovernance(createMockRequest('AUTHORIZE'));
  assert.equal(res.executed, false);
  assert.equal(res.decision.action, 'VETO');
  assert.equal(res.decision.rationaleCode, 'SPOOFING_DETECTED_VETO');
});

test('LayaGovernanceService - Test 7: Micro-stop TIGHTEN é aprovado e recebido pelo motor', async () => {
  const now = Date.now();
  const microStopResponse: LayaGovernanceResponse = {
    decisionId: 'micro-stop-1',
    stateVersion: 1,
    issuedAt: now,
    expiresAt: now + 2000,
    action: 'AUTHORIZE',
    symbol: 'BTC/USDT',
    powerMultiplier: 2.0,
    riskPct: 1.0,
    governance: {
      stopLossProposalPct: 0.40,
      stopLossMoveDirection: 'TIGHTEN'
    },
    rationaleCode: 'MICRO_STOP_REORGANIZATION',
    trace: { l2DepthTop20: 500000, imbalanceRatio: 3.0, cvdDelta60s: 250, spoofScore: 0.02, betaDivergence: false }
  };

  const service = new LayaGovernanceService({
    fetchImpl: (async () => new Response(JSON.stringify(microStopResponse), { status: 200 })) as any,
    mode: 'ACTIVE'
  });

  const res = await service.requestGovernance(createMockRequest('AUTHORIZE'));
  assert.equal(res.executed, true);
  assert.equal(res.decision.governance.stopLossProposalPct, 0.40);
  assert.equal(res.decision.governance.stopLossMoveDirection, 'TIGHTEN');
});

