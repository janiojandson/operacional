import assert from 'node:assert/strict';
import { MARKET_DATA_INTERVALS } from './marketDataManager.js';

assert.equal(MARKET_DATA_INTERVALS.tickerMs, 2_000);
assert.equal(MARKET_DATA_INTERVALS.bookMs, 10_000, 'book refresh must remain inside every strategy freshness window');
assert.equal(MARKET_DATA_INTERVALS.candlesMs, 60_000, 'historical candles do not need order-book cadence');
assert.ok(MARKET_DATA_INTERVALS.bookMs < 20_000);
console.log('marketDataManager: PASS');
