import assert from 'node:assert/strict';
import test from 'node:test';
import { positionRiskSummary } from './positionRiskSummary.js';

test('shows notional, risk, margin and exposure from an existing master position', () => {
  assert.deepEqual(positionRiskSummary({ notionalUsd: 2000, riskUsd: 20, marginUsd: 200, masterExposureRatio: 0.2 }), {
    notionalUsd: '$2,000.00',
    riskUsd: '$20.00',
    marginUsd: '$200.00',
    exposurePct: '20.00%'
  });
});
