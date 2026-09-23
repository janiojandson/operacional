import assert from 'node:assert/strict';
import { calculateTrailingConfiguration } from './bybitExecutionEngine.js';

const buy = calculateTrailingConfiguration({ entryPrice: 100, takeProfit: 105, side: 'BUY' });
assert.deepEqual(buy, { activationPrice: 104, callbackDistance: 1 });

const sell = calculateTrailingConfiguration({ entryPrice: 100, takeProfit: 95, side: 'SELL' });
assert.deepEqual(sell, { activationPrice: 96, callbackDistance: 1 });

assert.equal(calculateTrailingConfiguration({ entryPrice: 100, takeProfit: 100, side: 'BUY' }), null);
console.log('bybitExecutionEngine: PASS');
