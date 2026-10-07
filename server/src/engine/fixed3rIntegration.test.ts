import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PaperTradingEngine, MirrorTradingEngine } from './paperTradingEngine.js';
import { evaluateCryptoOpportunity } from './cryptoStrategyDecision.js';
import type { SimulatedTrade } from '../../../shared/paperTypes.js';

delete process.env.MARKET_EXIT_POLICY;
const signal = { id: '3r', type: 'BOOK_IMBALANCE' as const, symbol: 'BTC/USDT', price: 100_000,
  volume: 10, message: 'Compradores com 3.2x mais liquidez', timestamp: Date.now(), severity: 'high' as const };
const decision = evaluateCryptoOpportunity({ symbol: signal.symbol, price: signal.price,
  signalType: signal.type, signalSide: 'BUY', bookTimestamp: signal.timestamp, now: signal.timestamp,
  spreadPct: .0001, bidAskRatio: 3.2, flowConfirmed: true, regime: 'TREND', hasOpenPosition: false,
  cooldownActive: false, orderExecutable: true, source: 'BYBIT' });
function open() {
  const engine = new PaperTradingEngine();
  engine.handleSignal(signal, signal.price, decision, { approved: true, reasons: [], stopLoss: 98_000,
    takeProfit: 105_000, stopDistancePct: .02, notionalUsd: 1_000, riskUsd: 20, grossR: 2.5, netR: 2.31 });
  return engine;
}

test('default new position keeps the full lot through +0.6R, adverse flow and a return to entry', () => {
  const engine = open();
  const trade = engine.getAccountState().openPositions[0] as any;
  assert.equal(trade.exitPolicy, 'FIXED_3R');
  assert.equal(trade.takeProfit, 106_000);
  assert.equal(trade.initialRiskUsd, 20);
  trade.entryTime -= 13 * 3600;
  trade.marketRegime = 'NEUTRAL_RANGING';
  engine.updatePrice(signal.symbol, 101_200, { imbalanceRatio: .1, bidDepthTotal: 1, askDepthTotal: 10 },
    { dominantSide: 'sell', whaleCount: 2 });
  engine.updatePrice(signal.symbol, 100_000);
  assert.equal(engine.getAccountState().openPositions.length, 1);
  assert.equal(trade.stopLoss, 98_000);
  assert.equal(trade.qty, .01);
  assert.equal(trade.partialTaken, undefined);
  assert.equal(trade.isRunner, undefined);
  engine.updatePrice(signal.symbol, 106_000);
  const closed = engine.getAccountState().history[0];
  assert.equal(closed.closeReason, 'FIXED_TP');
  assert.equal(closed.grossR, 3);
  assert(Math.abs(closed.rMultiple - (closed.totalNetPnl! / 20)) < 1e-9);
});

test('stop gap realizes observed loss using immutable risk, not a mutated stop', () => {
  const engine = open();
  const trade = engine.getAccountState().openPositions[0] as any;
  trade.stopLoss = 100_100; // A stale external mutation must not change the contracted barrier or R.
  engine.updatePrice(signal.symbol, 99_000);
  assert.equal(engine.getAccountState().openPositions.length, 1);
  engine.updatePrice(signal.symbol, 97_000);
  const closed = engine.getAccountState().history[0];
  assert.equal(closed.closeReason, 'STOP_LOSS');
  assert.equal(closed.grossR, -1.5);
  assert(Math.abs(closed.rMultiple - closed.totalNetPnl! / 20) < 1e-9);
});

test('Mirror uses its own immutable quantity and risk and holds through legacy trailing zone', () => {
  const master = open().getAccountState().openPositions[0];
  const mirror = new MirrorTradingEngine();
  mirror.resetData(10_000);
  assert.equal(mirror.replicateMasterTrade(master).success, true);
  const position = mirror.getAccountState().openPositions[0] as any;
  assert.equal(position.exitPolicy, 'FIXED_3R');
  assert.equal(position.initialQty, position.qty);
  assert.equal(position.initialRiskUsd, position.qty * 2_000);
  mirror.updatePrice(signal.symbol, 103_000);
  mirror.updatePrice(signal.symbol, 101_000);
  assert.equal(mirror.getAccountState().openPositions.length, 1);
  mirror.updatePrice(signal.symbol, 106_000);
  assert.equal(mirror.getAccountState().history[0].closeReason, 'FIXED_TP');
  assert(Math.abs(mirror.getAccountState().history[0].grossR! - 3) < 1e-9);
});

test('four hydrated old positions preserve their prices, sizes and LEGACY policy', () => {
  const template = open().getAccountState().openPositions[0];
  const old = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT'].map((symbol, i) => {
    const t = { ...template, symbol, id: `old-${i}`, partialTaken: true, qty: .005, notionalUsd: 500 } as any;
    for (const key of ['exitPolicy', 'initialStopLoss', 'initialQty', 'initialNotionalUsd', 'initialRiskUsd']) delete t[key];
    return t as SimulatedTrade;
  });
  const expected = structuredClone(old);
  const engine = new PaperTradingEngine();
  engine.hydrateFromStorage({ balance: 10_000, realizedPnl: 0, openPositions: old, history: [] });
  const positions = engine.getAccountState().openPositions as any[];
  positions.forEach((p, i) => {
    assert.equal(p.exitPolicy, 'LEGACY');
    const { exitPolicy, ...unchanged } = p;
    assert.deepEqual(unchanged, expected[i]);
  });
});

test('restart and reversal of the global flag preserve the contracted fixed policy', () => {
  const original = open().getAccountState().openPositions[0];
  const restored = new PaperTradingEngine();
  restored.hydrateFromStorage({balance:10_000,realizedPnl:0,openPositions:[structuredClone(original)],history:[]});
  process.env.MARKET_EXIT_POLICY='LEGACY';
  try {
    restored.updatePrice(signal.symbol,101_200);
    restored.updatePrice(signal.symbol,100_000);
    const held = restored.getAccountState().openPositions[0];
    assert.equal(held.exitPolicy,'FIXED_3R');
    assert.equal(held.initialRiskUsd,20);
    assert.equal(held.stopLoss,98_000);
    restored.updatePrice(signal.symbol,106_000);
    assert.equal(restored.getAccountState().history[0].closeReason,'FIXED_TP');
  } finally {delete process.env.MARKET_EXIT_POLICY;}
});

test('legacy harvest pays its exit fee exactly once in consolidated net PnL', () => {
  process.env.MARKET_EXIT_POLICY='LEGACY';
  try {
    const engine=open();
    engine.updatePrice(signal.symbol,101_200);
    engine.closePosition(signal.symbol,100_000,false,'MANUAL');
    const closed=engine.getAccountState().history[0];
    assert.equal(closed.totalNetPnl,4.9);
    assert.equal(closed.fee,1.1);
    assert(Math.abs(closed.grossR!-.3)<1e-9);
    assert.equal(closed.rMultiple,4.9/20);
  } finally {delete process.env.MARKET_EXIT_POLICY;}
});
