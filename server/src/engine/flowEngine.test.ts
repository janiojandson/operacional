import assert from 'node:assert/strict';
import test from 'node:test';
import { FlowEngine } from './flowEngine.js';
import type { OrderBookData, Trade } from '../../../shared/types.js';

function book(symbol: string, bid: number, ask: number): OrderBookData {
  return {
    symbol,
    bids: [{ price: bid, amount: 10, total: bid * 10 }],
    asks: [{ price: ask, amount: 10, total: ask * 10 }],
    timestamp: Date.now(),
    spread: ask - bid,
    bidDepthTotal: 10,
    askDepthTotal: 10,
    imbalanceRatio: 1
  };
}

function trade(symbol: string, price: number, side: 'buy' | 'sell', timestamp: number): Trade {
  return { id: `${symbol}-${timestamp}`, symbol, price, amount: 1, side, timestamp, cost: price };
}

test('confirma sweep de baixa + reclaim para reentrada BUY', () => {
  const engine = new FlowEngine();
  const symbol = 'BTC/USDT';
  const base = Date.now() - 4000;
  const prices = [100.2, 100.1, 100.0, 100.15, 100.05, 100.12];
  prices.forEach((price, i) => {
    engine.processTrade(trade(symbol, price, i % 2 === 0 ? 'buy' : 'sell', base + i * 400), book(symbol, price - 0.01, price + 0.01));
  });

  engine.processTrade(trade(symbol, 99.95, 'sell', base + 3000), book(symbol, 99.94, 99.96));
  assert.equal(engine.getRecentLiquiditySweepEvidence(symbol, 'BUY'), null);

  engine.processTrade(trade(symbol, 100.02, 'buy', base + 3150), book(symbol, 100.01, 100.03));
  const evidence = engine.getRecentLiquiditySweepEvidence(symbol, 'BUY');
  assert.ok(evidence);
  assert.equal(evidence.direction, 'DOWN');
  assert.ok(evidence.breachBps >= 2);
  assert.equal(engine.getRecentLiquiditySweepEvidence(symbol, 'SELL'), null);
});

test('não confirma sweep sem reclaim', () => {
  const engine = new FlowEngine();
  const symbol = 'ETH/USDT';
  const base = Date.now() - 4000;
  for (let i = 0; i < 6; i++) {
    const price = 2000 + (i % 2) * 0.2;
    engine.processTrade(trade(symbol, price, i % 2 === 0 ? 'buy' : 'sell', base + i * 400), book(symbol, price - 0.05, price + 0.05));
  }
  engine.processTrade(trade(symbol, 1999.4, 'sell', base + 3000), book(symbol, 1999.35, 1999.45));
  engine.processTrade(trade(symbol, 1999.6, 'buy', base + 3200), book(symbol, 1999.55, 1999.65));
  assert.equal(engine.getRecentLiquiditySweepEvidence(symbol, 'BUY'), null);
});
