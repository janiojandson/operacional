import assert from 'node:assert/strict';
import test from 'node:test';
import { positionRiskSummary } from './positionRiskSummary.js';

test('shows notional, risk, margin and exposure from an existing master position in pt-BR', () => {
  assert.deepEqual(positionRiskSummary({ notionalUsd: 2000, riskUsd: 20, marginUsd: 200, masterExposureRatio: 0.2 }), {
    notionalUsd: '$ 2.000,00',
    riskUsd: '$ 20,00',
    marginUsd: '$ 200,00',
    exposurePct: '20,00%',
    isBreakeven: false
  });
});

test('identifies breakeven zero risk position', () => {
  assert.deepEqual(positionRiskSummary({ notionalUsd: 1000, riskUsd: 0, marginUsd: 100, masterExposureRatio: 0.1 }), {
    notionalUsd: '$ 1.000,00',
    riskUsd: 'BREAKEVEN — RISCO ZERO',
    marginUsd: '$ 100,00',
    exposurePct: '10,00%',
    isBreakeven: true
  });
});
