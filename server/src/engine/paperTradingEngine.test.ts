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
approvedEngine.handleSignal(signal, 100_000, decision, {
  approved: true,
  reasons: [],
  stopLoss: 98_000,
  takeProfit: 105_000,
  stopDistancePct: 0.02,
  notionalUsd: 1_000,
  riskUsd: 20,
  grossR: 2.5,
  netR: 2.31
});
const open = approvedEngine.getAccountState().openPositions[0];
assert.equal(approvedEngine.getAccountState().openPositions.length, 1);
assert.equal(open.takeProfit, 105_000);
assert.equal(open.stopLoss, 98_000);
assert.equal(open.notionalUsd, 1_000, 'adaptive risk cap must control the paper notional');
assert.equal(open.riskUsd, 20);
assert.equal(open.grossR, 2.5);
assert.equal(open.netR, 2.31);
assert.equal(open.rMultiple, 0, 'an open position preserves 0R rather than replacing it');
assert.equal(open.strategyVersion, 'flow-crypto-v1');
assert.equal(open.closeReason, undefined);

approvedEngine.updatePrice('BTC/USDT', 105_000);
approvedEngine.updatePrice('BTC/USDT', 103_900);
const trailingClosed = approvedEngine.getAccountState().history[0];
assert.equal(trailingClosed.closeReason, 'RUNNER_TRAILING_EXIT');
assert.ok(trailingClosed.rMultiple >= 1.9, 'runner trailing exit must lock at least high R above target entry');

const rejectedRiskEngine = new PaperTradingEngine();
rejectedRiskEngine.handleSignal(signal, 100_000, decision, {
  approved: false,
  reasons: ['RISCO_AGREGADO_EXCEDIDO'],
  stopLoss: null,
  takeProfit: null,
  stopDistancePct: null,
  notionalUsd: null,
  riskUsd: null,
  grossR: null,
  netR: null
});
assert.equal(rejectedRiskEngine.getAccountState().openPositions.length, 0, 'a rejected adaptive-risk plan must not open a position');

const belowLotEngine = new PaperTradingEngine();
belowLotEngine.handleSignal(signal, 100_000, decision, {
  approved: true,
  reasons: [],
  stopLoss: 98_000,
  takeProfit: 105_000,
  stopDistancePct: 0.02,
  notionalUsd: 50,
  riskUsd: 1,
  grossR: 2.5,
  netR: 2.31
});
assert.equal(belowLotEngine.getAccountState().openPositions.length, 0, 'paper master must not simulate a BTC order below the Bybit minimum lot');

// Teste de Invalidação Ativa por Order Flow adverso
const flowInvalidationEngine = new PaperTradingEngine();
flowInvalidationEngine.handleSignal(signal, 100_000, decision, {
  approved: true, reasons: [], stopLoss: 98_000, takeProfit: 105_000,
  stopDistancePct: 0.02, notionalUsd: 1_000, riskUsd: 20, grossR: 2.5, netR: 2.31
});
assert.equal(flowInvalidationEngine.getAccountState().openPositions.length, 1);
// Em leve prejuízo (-0.5R = 99_000) com book imbalance vendedor severo (< 0.35) e agressão de venda
flowInvalidationEngine.updatePrice(
  'BTC/USDT',
  99_000,
  { imbalanceRatio: 0.25, bidDepthTotal: 10, askDepthTotal: 40 },
  { dominantSide: 'sell', whaleCount: 1 }
);
assert.equal(flowInvalidationEngine.getAccountState().openPositions.length, 0);
const invalidatedTrade = flowInvalidationEngine.getAccountState().history[0];
assert.equal(invalidatedTrade.closeReason, 'ACTIVE_FLOW_INVALIDATION');
assert.ok(invalidatedTrade.rMultiple > -1.0, 'early flow invalidation must protect from full -1.0R loss');

// Teste de Trailing Stop Desativado (Sai no TP Fixo 100%)
const fixedTpEngine = new PaperTradingEngine();
fixedTpEngine.setTrailingStopEnabled(false);
fixedTpEngine.handleSignal(signal, 100_000, decision, {
  approved: true, reasons: [], stopLoss: 98_000, takeProfit: 105_000,
  stopDistancePct: 0.02, notionalUsd: 1_000, riskUsd: 20, grossR: 2.5, netR: 2.31
});
fixedTpEngine.updatePrice('BTC/USDT', 105_000);
assert.equal(fixedTpEngine.getAccountState().openPositions.length, 0);
const fixedClosed = fixedTpEngine.getAccountState().history[0];
assert.equal(fixedClosed.closeReason, 'FIXED_TP');
assert.equal(fixedClosed.rMultiple, 2.5);

console.log('paperTradingEngine: PASS');
