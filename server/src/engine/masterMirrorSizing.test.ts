import assert from 'node:assert/strict';
import {
  calculateMasterMirrorSize,
  type MasterMirrorSizingInput
} from './masterMirrorSizing.js';

function input(overrides: Partial<MasterMirrorSizingInput> = {}): MasterMirrorSizingInput {
  return {
    balanceUsd: 500,
    masterExposureRatio: 0.2,
    entryPrice: 100000,
    leverage: 10,
    minQty: 0.001,
    qtyStep: 0.001,
    feeRate: 0.00055,
    ...overrides
  };
}

{
  const result = calculateMasterMirrorSize(input());
  assert.equal(result.status, 'EXECUTABLE');
  assert.equal(result.qty, 0.001);
  assert.equal(result.notionalUsd, 100);
  assert.equal(result.marginUsd, 10);
  assert.equal(result.openFeeUsd, 0.055);
}

{
  const result = calculateMasterMirrorSize(input({ balanceUsd: 499 }));
  assert.equal(result.status, 'BLOCKED_MIN_LOT');
  assert.equal(result.qty, 0);
  assert.equal(result.minimumBankUsd, 500);
}

{
  const result = calculateMasterMirrorSize(input({ balanceUsd: 10, masterExposureRatio: 100 }));
  assert.equal(result.status, 'BLOCKED_MARGIN_OR_FEE');
  assert.equal(result.qty, 0);
}

console.log('masterMirrorSizing: PASS');
