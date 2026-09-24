import assert from 'node:assert/strict';
import test from 'node:test';
import { bookStatus } from './bookStatus.js';

test('marks a fresh Bybit book with its source and age', () => {
  assert.deepEqual(bookStatus({ source: 'BYBIT', timestamp: 99_000 }, 100_000), { source: 'BYBIT', age: '1s', stale: false });
});

test('marks a fresh Binance book with its source and age', () => {
  assert.deepEqual(bookStatus({ source: 'BINANCE', timestamp: 99_000 }, 100_000), { source: 'BINANCE', age: '1s', stale: false });
});

test('marks an old fallback book as stale', () => {
  assert.deepEqual(bookStatus({ source: 'LOCAL_FALLBACK', timestamp: 80_000 }, 100_000), { source: 'SIMULADO', age: '20s', stale: true });
});
