import assert from 'node:assert/strict';
import { QuantStrategyEngine } from './quantStrategyEngine.js';
import type { PaperAccount, SimulatedTrade } from '../../../shared/paperTypes.js';

const closed: SimulatedTrade = {
  id: 'closed-1', symbol: 'BTC/USDT', type: 'BUY', entryPrice: 100, currentPrice: 105,
  takeProfit: 102.5, stopLoss: 99, pnlUsd: 75, netPnl: 50, pnlPct: 5, rMultiple: 0,
  powerMultiplier: 1.5, temperature: 'NORMAL', session: 'NY', dayOfWeek: 'Seg',
  marketRegime: 'TREND', status: 'CLOSED_TP', entryTime: 1, closeTime: 2, signalReason: 'fixture'
};

const open: SimulatedTrade = { ...closed, id: 'open-1', status: 'OPEN', pnlUsd: 999, netPnl: 999 };
const account: PaperAccount = {
  initialBalance: 500, balance: 550, equity: 550, winRate: 100, totalTrades: 1,
  winningTrades: 1, losingTrades: 0, realizedPnl: 50, openPositions: [open], history: [open, closed]
};

const report = QuantStrategyEngine.generateHealthReport(account);
assert.equal(report.financial.netProfit, 50, 'uses net PnL from closed positions only');
assert.equal(report.financial.returnPct, 10, 'uses account initial balance, not a fixed 10000');
assert.equal(report.financial.mathExpectationR, 0, 'a valid 0R must remain 0R');
console.log('quantStrategyEngine: PASS');
