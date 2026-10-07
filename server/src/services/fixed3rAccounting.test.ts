import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as events from './eventStoreService.js';

test('Event Store derives net and gross R from exact original USD risk and consolidated PnL', () => {
  const accounting = (events as any).resolveTradeAccounting;
  assert.equal(typeof accounting, 'function');
  const result = accounting({ initialRiskUsd:20, grossPnlUsd:60, netPnlUsd:58.9,
    rGross:999, rNet:999, positionSizeUsd:500, deltaStopBps:15 });
  assert.deepEqual(result,{ rGross:3, rNet:2.945 });
  assert.throws(() => accounting({ initialRiskUsd:0, grossPnlUsd:60, netPnlUsd:58.9 }), /INVALID_ORIGINAL_RISK/);
});
