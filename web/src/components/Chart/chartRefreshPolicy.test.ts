import assert from 'node:assert/strict';
import test from 'node:test';
import { chartHistoryKey } from './chartRefreshPolicy.js';

test('reloads chart history only when symbol or timeframe changes', () => {
  assert.equal(chartHistoryKey('BTCUSDT', '1m'), chartHistoryKey('BTCUSDT', '1m'));
  assert.notEqual(chartHistoryKey('BTCUSDT', '1m'), chartHistoryKey('BTCUSDT', '5m'));
  assert.notEqual(chartHistoryKey('BTCUSDT', '1m'), chartHistoryKey('ETHUSDT', '1m'));
});
