import assert from 'node:assert/strict';
import { assessClientMarginCapacity } from './clientMarginGuard.js';

{
  const result = assessClientMarginCapacity({
    equityUsd: 1_000,
    availableUsd: 800,
    existingMarginUsd: 150,
    existingPositionCount: 1,
    newMarginUsd: 100,
    openFeeUsd: 1.1,
    maxMarginUsagePct: 0.30,
    maxOpenPositions: 3
  });
  assert.equal(result.approved, true);
  assert.equal(result.projectedMarginUsd, 250);
}

{
  const result = assessClientMarginCapacity({
    equityUsd: 1_000,
    availableUsd: 800,
    existingMarginUsd: 250,
    existingPositionCount: 1,
    newMarginUsd: 100,
    openFeeUsd: 1.1,
    maxMarginUsagePct: 0.30,
    maxOpenPositions: 3
  });
  assert.equal(result.approved, false);
  assert.equal(result.reason, 'MARGEM_AGREGADA_EXCEDIDA');
}

{
  const result = assessClientMarginCapacity({
    equityUsd: 1_000,
    availableUsd: 100,
    existingMarginUsd: 0,
    existingPositionCount: 3,
    newMarginUsd: 50,
    openFeeUsd: 0.1,
    maxMarginUsagePct: 0.30,
    maxOpenPositions: 3
  });
  assert.equal(result.approved, false);
  assert.equal(result.reason, 'LIMITE_POSICOES_ATINGIDO');
}

{
  const result = assessClientMarginCapacity({
    equityUsd: 1_000,
    availableUsd: 50,
    existingMarginUsd: 0,
    existingPositionCount: 0,
    newMarginUsd: 50,
    openFeeUsd: 0.1,
    maxMarginUsagePct: 0.30,
    maxOpenPositions: 3
  });
  assert.equal(result.approved, false);
  assert.equal(result.reason, 'SALDO_LIVRE_INSUFICIENTE');
}

console.log('clientMarginGuard: PASS');
