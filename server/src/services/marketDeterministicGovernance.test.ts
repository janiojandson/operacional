import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMarketDeterministicGovernance } from './marketDeterministicGovernance.js';
import type { MarketGovernanceRequest } from '../../../shared/marketGovernanceTypes.js';

function req(overrides: Partial<MarketGovernanceRequest> = {}): MarketGovernanceRequest {
  return {
    stateVersion: 1,
    symbol: 'BTC/USDT',
    intentGroup: 'PRE_ENTRY',
    intentSubgroup: 'NEW_OPPORTUNITY',
    side: 'BUY',
    currentPrice: 100_000,
    proposedStopLoss: 99_000,
    signalSource: 'BOOK_IMBALANCE',
    trace: {
      l2DepthTop20: 250_000,
      imbalanceRatio: 3.0,
      cvdDelta60s: 10_000,
      spoofScore: 0,
      betaDivergence: false,
      spreadBps: 2
    },
    risk: {
      accountEquity: 10_000,
      currentRiskAggregatePct: 0.01,
      proposedRiskPct: 0.01
    },
    macro: { regime: 'NEUTRAL', isCircuitBreakerActive: false },
    ...overrides
  };
}

test('PRE_ENTRY aprova imbalance como taker agressivo', () => {
  const d = evaluateMarketDeterministicGovernance(req());
  assert.equal(d.choice, 'AUTHORIZE');
  assert.equal(d.verdict, 'APPROVE_AGGRESSIVE');
  assert.equal(d.rationale, 'V08_IMBALANCE_AGGRESSIVE_APPROVED');
  assert.equal(d.executionMode, 'TAKER_IOC');
});

test('PRE_ENTRY veta spread tóxico', () => {
  const d = evaluateMarketDeterministicGovernance(req({
    trace: { ...req().trace, spreadBps: 5.1 }
  }));
  assert.equal(d.choice, 'VETO');
  assert.equal(d.rationale, 'V01_TOXIC_SPREAD');
});

test('PRE_ENTRY veta risco agregado acima de 5% em escala fracionária', () => {
  const d = evaluateMarketDeterministicGovernance(req({
    risk: { accountEquity: 10_000, currentRiskAggregatePct: 0.04, proposedRiskPct: 0.02 }
  }));
  assert.equal(d.choice, 'VETO');
  assert.equal(d.rationale, 'V06_MAX_RISK_EXCEEDED');
});

test('COOLDOWN só perdoa com sweep e rejeição confirmados', () => {
  const d = evaluateMarketDeterministicGovernance(req({
    intentGroup: 'COOLDOWN_AUDIT',
    intentSubgroup: 'LIQUIDITY_SWEEP_REENTRY',
    proposedStopLoss: undefined,
    evidence: { liquiditySweepConfirmed: true, rejectionConfirmed: true }
  }));
  assert.equal(d.choice, 'OVERRIDE_COOLDOWN');
  assert.equal(d.rationale, 'COOLDOWN_PARDON_SWEEP_RECLAIM');
});

test('DEFENSE fecha somente com fluxo contrário confirmado e perda > 0.3R', () => {
  const d = evaluateMarketDeterministicGovernance(req({
    intentGroup: 'POSITION_LIFECYCLE',
    intentSubgroup: 'DEFENSE_CONTRARIAN_FLOW',
    proposedStopLoss: undefined,
    currentR: -0.5,
    evidence: { contrarianFlowConfirmed: true }
  }));
  assert.equal(d.choice, 'CLOSE_NOW');
  assert.equal(d.rationale, 'DEFENSE_CONTRARIAN_EXIT');
});
test('SCALE_IN respeita lucro mínimo e teto agregado de 5%', () => {
  const allowed = evaluateMarketDeterministicGovernance(req({
    intentGroup: 'POSITION_LIFECYCLE',
    intentSubgroup: 'SCALE_IN_REQUEST',
    currentR: 1.3,
    risk: { accountEquity: 10_000, currentRiskAggregatePct: 0.03, proposedRiskPct: 0.01 }
  }));
  assert.equal(allowed.verdict, 'AUTHORIZE_SCALE_IN');

  const blocked = evaluateMarketDeterministicGovernance(req({
    intentGroup: 'POSITION_LIFECYCLE',
    intentSubgroup: 'SCALE_IN_REQUEST',
    currentR: 1.3,
    risk: { accountEquity: 10_000, currentRiskAggregatePct: 0.04, proposedRiskPct: 0.02 }
  }));
  assert.equal(blocked.choice, 'VETO');
  assert.equal(blocked.rationale, 'SCALE_IN_RISK_REJECTED');
});
