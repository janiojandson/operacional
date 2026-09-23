import assert from 'node:assert/strict';
import { classifyBybitOrderState, verifyIsolatedLeverage } from './bybitExecutionSafety.js';

assert.deepEqual(
  verifyIsolatedLeverage([{ symbol: 'BTC/USDT:USDT', marginMode: 'isolated', leverage: 10 }], 'BTC/USDT:USDT', 10),
  { verified: true }
);
assert.equal(
  verifyIsolatedLeverage([{ symbol: 'BTC/USDT:USDT', marginMode: 'cross', leverage: 10 }], 'BTC/USDT:USDT', 10).verified,
  false
);
assert.equal(
  verifyIsolatedLeverage([], 'BTC/USDT:USDT', 10).verified,
  false
);

assert.equal(classifyBybitOrderState({ status: 'closed', filled: 1, amount: 1 }), 'PREENCHIDA');
assert.equal(classifyBybitOrderState({ status: 'open', filled: 0, amount: 1 }), 'ABERTA');
assert.equal(classifyBybitOrderState({ status: 'open', filled: 0.4, amount: 1 }), 'PARCIAL');
assert.equal(classifyBybitOrderState({ status: 'canceled', filled: 0, amount: 1 }), 'CANCELADA');
assert.equal(classifyBybitOrderState({ status: 'rejected', filled: 0, amount: 1 }), 'REJEITADA');

console.log('bybitExecutionSafety: PASS');
