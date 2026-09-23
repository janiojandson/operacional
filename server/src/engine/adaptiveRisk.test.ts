import assert from 'node:assert/strict';
import { calculateAdaptiveRisk } from './adaptiveRisk.js';

const candles = [
  { high: 101, low: 99, close: 100 },
  { high: 102, low: 100, close: 101 },
  { high: 103, low: 101, close: 102 }
];

const input = {
  entryPrice: 100, side: 'BUY' as const, candles, structuralStopDistancePct: 0.008,
  spreadPct: 0.0002, slippageBufferPct: 0.0003, atrMultiplier: 1,
  requestedNotionalUsd: 2_000, accountBalanceUsd: 10_000, maxRiskUsd: 20,
  existingAggregateRiskUsd: 0, maxAggregateRiskUsd: 100, roundTripFeePct: 0.0011
};
const result = calculateAdaptiveRisk(input);
assert.equal(result.approved, true);
assert.equal(result.stopLoss, 98, 'ATR distance dominates the fixed 0.8% stop');
assert.equal(result.takeProfit, 105, 'target remains 2.5R from the adaptive stop');
assert.equal(result.notionalUsd, 1000, 'notional is capped by 20 USD risk over 2% distance');
assert.equal(result.grossR, 2.5);
assert.ok(result.netR !== null && result.netR < 2.5);

const aggregateBlocked = calculateAdaptiveRisk({ ...input, existingAggregateRiskUsd: 90 });
assert.equal(aggregateBlocked.approved, false);
assert.ok(aggregateBlocked.reasons.includes('RISCO_AGREGADO_EXCEDIDO'));

const unavailable = calculateAdaptiveRisk({ ...input, candles: [] });
assert.equal(unavailable.approved, false);
assert.ok(unavailable.reasons.includes('ATR_INDISPONIVEL'));
console.log('adaptiveRisk: PASS');
