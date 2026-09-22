import assert from 'node:assert/strict';
import { PaperTradingEngine } from './paperTradingEngine.js';
import { evaluateCryptoOpportunity } from './cryptoStrategyDecision.js';
import type { FlowSignal } from '../../../shared/types.js';

const signal: FlowSignal = {
  id: 'signal-1',
  type: 'BOOK_IMBALANCE',
  symbol: 'BTC/USDT',
  price: 100_000,
  volume: 10,
  message: 'Compradores com 3.2x mais liquidez profunda que vendedores.',
  timestamp: 1_700_000_000_000,
  severity: 'high'
};

const decision = evaluateCryptoOpportunity({
  symbol: 'BTC/USDT', price: 100_000, signalType: signal.type, signalSide: 'BUY',
  bookTimestamp: signal.timestamp, now: signal.timestamp, spreadPct: 0.0001,
  bidAskRatio: 3.2, flowConfirmed: true, regime: 'TREND', hasOpenPosition: false,
  cooldownActive: false, orderExecutable: true, source: 'BYBIT'
});

const rawEngine = new PaperTradingEngine();
rawEngine.handleSignal(signal, 100_000);
assert.equal(rawEngine.getAccountState().openPositions.length, 0, 'raw signal must not open a position');

const approvedEngine = new PaperTradingEngine();
approvedEngine.handleSignal(signal, 100_000, decision);
const open = approvedEngine.getAccountState().openPositions[0];
assert.equal(approvedEngine.getAccountState().openPositions.length, 1);
assert.equal(open.takeProfit, 102_000);
assert.equal(open.stopLoss, 99_200);
assert.equal(open.rMultiple, 0, 'an open position preserves 0R rather than replacing it');
assert.equal(open.strategyVersion, 'flow-crypto-v1');
assert.equal(open.closeReason, undefined);

console.log('paperTradingEngine: PASS');
