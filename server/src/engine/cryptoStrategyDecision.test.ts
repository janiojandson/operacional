import assert from 'node:assert/strict';
import { evaluateCryptoOpportunity } from './cryptoStrategyDecision.js';

const now = 1_700_000_000_000;

const validInput = {
  symbol: 'BTC/USDT',
  price: 100_000,
  signalType: 'BOOK_IMBALANCE' as const,
  signalSide: 'BUY' as const,
  bookTimestamp: now - 500,
  now,
  spreadPct: 0.0001,
  bidAskRatio: 3.2,
  flowConfirmed: true,
  regime: 'TREND' as const,
  hasOpenPosition: false,
  cooldownActive: false,
  orderExecutable: true,
  source: 'BYBIT' as const
};

const valid = evaluateCryptoOpportunity(validInput);
assert.equal(valid.approved, true);
assert.equal(valid.profileVersion, 'flow-crypto-v1');
assert.equal(valid.entrySide, 'BUY');
assert.equal(valid.takeProfit, 100_700);
assert.equal(valid.stopLoss, 99_720);
assert.equal(Math.round(((valid.takeProfit - validInput.price) / (validInput.price - valid.stopLoss)) * 10) / 10, 2.5);

const stale = evaluateCryptoOpportunity({ ...validInput, bookTimestamp: now - 30_001 });
assert.equal(stale.approved, false);
assert.ok(stale.reasons.includes('BOOK_DESATUALIZADO'));

const fallback = evaluateCryptoOpportunity({ ...validInput, source: 'LOCAL_FALLBACK' as const });
assert.equal(fallback.approved, false);
assert.ok(fallback.reasons.includes('FONTE_NAO_EXCHANGE'));

const sol = evaluateCryptoOpportunity({ ...validInput, symbol: 'SOL/USDT', price: 150 });
assert.equal(sol.takeProfit, 151.65);
assert.equal(sol.stopLoss, 149.34);

console.log('cryptoStrategyDecision: PASS');
