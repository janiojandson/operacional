import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SYMBOLS } from './marketDataManager.js';

test('MarketDataManager - DEFAULT_SYMBOLS contém SUI, DOGE e BNB', () => {
  assert.ok(DEFAULT_SYMBOLS.includes('SUI/USDT'), 'Deve monitorar SUI/USDT');
  assert.ok(DEFAULT_SYMBOLS.includes('DOGE/USDT'), 'Deve monitorar DOGE/USDT');
  assert.ok(DEFAULT_SYMBOLS.includes('BNB/USDT'), 'Deve monitorar BNB/USDT quando disponível no terminal');
  assert.ok(DEFAULT_SYMBOLS.includes('BTC/USDT'), 'Deve monitorar BTC/USDT');
  assert.ok(DEFAULT_SYMBOLS.includes('ETH/USDT'), 'Deve monitorar ETH/USDT');
  assert.ok(DEFAULT_SYMBOLS.includes('SOL/USDT'), 'Deve monitorar SOL/USDT');
  assert.ok(DEFAULT_SYMBOLS.includes('XRP/USDT'), 'Deve monitorar XRP/USDT');
});
