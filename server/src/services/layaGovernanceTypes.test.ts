import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isProposalExpired,
  validateConstitutionRules
} from './layaGovernanceService.js';
import type {
  LayaGovernanceResponse,
  LayaGovernanceRequest
} from '../../../shared/layaGovernanceTypes.js';

test('isProposalExpired detects proposals past expiresAt', () => {
  const now = Date.now();
  const expired: LayaGovernanceResponse = {
    decisionId: 'test-expired',
    stateVersion: 1,
    issuedAt: now - 4000,
    expiresAt: now - 1000, // already past
    action: 'AUTHORIZE',
    symbol: 'BTC/USDT',
    powerMultiplier: 2.0,
    riskPct: 1.0,
    governance: {},
    rationaleCode: 'SWEEP_RECLAIM_CVD_CONVERGENT',
    trace: {
      l2DepthTop20: 100000,
      imbalanceRatio: 2.5,
      cvdDelta60s: 300,
      spoofScore: 0.05,
      betaDivergence: false
    }
  };

  assert.equal(isProposalExpired(expired, now), true);
});

test('isProposalExpired rejects dilated validity windows exceeding 3000ms', () => {
  const now = Date.now();
  // Valid now, but validity span is 4000ms (> 3000ms tolerance)
  const dilated: LayaGovernanceResponse = {
    decisionId: 'test-dilated',
    stateVersion: 1,
    issuedAt: now - 500,
    expiresAt: now + 3500, // span = 4000ms
    action: 'AUTHORIZE',
    symbol: 'BTC/USDT',
    powerMultiplier: 2.0,
    riskPct: 1.0,
    governance: {},
    rationaleCode: 'SWEEP_RECLAIM_CVD_CONVERGENT',
    trace: {
      l2DepthTop20: 100000,
      imbalanceRatio: 2.5,
      cvdDelta60s: 300,
      spoofScore: 0.05,
      betaDivergence: false
    }
  };

  assert.equal(isProposalExpired(dilated, now), true);
});

test('isProposalExpired accepts valid proposal within 3000ms window', () => {
  const now = Date.now();
  const valid: LayaGovernanceResponse = {
    decisionId: 'test-valid',
    stateVersion: 1,
    issuedAt: now - 200,
    expiresAt: now + 1800, // span = 2000ms <= 3000ms, not expired
    action: 'AUTHORIZE',
    symbol: 'BTC/USDT',
    powerMultiplier: 2.0,
    riskPct: 1.0,
    governance: {},
    rationaleCode: 'SWEEP_RECLAIM_CVD_CONVERGENT',
    trace: {
      l2DepthTop20: 100000,
      imbalanceRatio: 2.5,
      cvdDelta60s: 300,
      spoofScore: 0.05,
      betaDivergence: false
    }
  };

  assert.equal(isProposalExpired(valid, now), false);
});

test('validateConstitutionRules rejects WIDEN stop proposal', () => {
  const proposal: LayaGovernanceResponse = {
    decisionId: 'test-widen',
    stateVersion: 1,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 2000,
    action: 'AUTHORIZE',
    symbol: 'BTC/USDT',
    powerMultiplier: 2.0,
    riskPct: 1.0,
    governance: {
      stopLossMoveDirection: 'WIDEN'
    },
    rationaleCode: 'MICRO_STOP_REORGANIZATION',
    trace: {
      l2DepthTop20: 100000,
      imbalanceRatio: 2.5,
      cvdDelta60s: 300,
      spoofScore: 0.05,
      betaDivergence: false
    }
  };

  const result = validateConstitutionRules(proposal, { currentR: 0, clusterExposureUsdt: 0 });
  assert.equal(result.approved, false);
  assert.equal(result.rejectionReason, 'REJECTED_BY_CONSTITUTION: STOP_CANNOT_WIDEN');
});

test('validateConstitutionRules enforces risk cap <= 1.5%', () => {
  const proposal: LayaGovernanceResponse = {
    decisionId: 'test-risk-cap',
    stateVersion: 1,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 2000,
    action: 'AUTHORIZE',
    symbol: 'BTC/USDT',
    powerMultiplier: 5.0,
    riskPct: 2.5, // Exceeds 1.5% constitution cap
    governance: {},
    rationaleCode: 'DYNAMIC_POWER_AGGRESSION',
    trace: {
      l2DepthTop20: 100000,
      imbalanceRatio: 2.5,
      cvdDelta60s: 300,
      spoofScore: 0.05,
      betaDivergence: false
    }
  };

  const result = validateConstitutionRules(proposal, { currentR: 0, clusterExposureUsdt: 0 });
  assert.equal(result.approved, false);
  assert.equal(result.rejectionReason, 'REJECTED_BY_CONSTITUTION: RISK_EXCEEDS_MAX_CAP');
});
