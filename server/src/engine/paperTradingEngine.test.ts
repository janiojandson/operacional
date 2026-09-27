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

// Teste de Cooldown pós-saída registrado no engine
assert.ok(fixedTpEngine.getLastExitTimestamp('BTC/USDT') !== undefined, 'closing position must register lastExitTimestamp');
assert.equal(fixedTpEngine.isCooldownActive('BTC/USDT', 15 * 60 * 1000), true, '15-min cooldown must be active right after close');
assert.equal(fixedTpEngine.isCooldownActive('ETH/USDT', 15 * 60 * 1000), false, 'untraded pair must not be in cooldown');

// Teste de Micro-Stop sugerido pela Laya
const microStopEngine = new PaperTradingEngine();
microStopEngine.handleSignal(signal, 100_000, decision, {
  approved: true, reasons: [], stopLoss: 98_000, takeProfit: 105_000,
  stopDistancePct: 0.02, notionalUsd: 1_000, riskUsd: 20, grossR: 2.5, netR: 2.31
}, {
  decisionId: 'micro-test',
  stateVersion: 1,
  issuedAt: Date.now(),
  expiresAt: Date.now() + 2000,
  action: 'AUTHORIZE',
  symbol: 'BTC/USDT',
  powerMultiplier: 2.0,
  riskPct: 1.0,
  governance: {
    stopLossProposalPct: 0.50, // 0.50% de 100_000 = stop em 99_500 (mais justo que 98_000)
    stopLossMoveDirection: 'TIGHTEN'
  },
  rationaleCode: 'MICRO_STOP_REORGANIZATION',
  trace: { l2DepthTop20: 100, imbalanceRatio: 2, cvdDelta60s: 10, spoofScore: 0, betaDivergence: false }
});

// Teste de Realização Parcial em +0.6R com Breakeven (Risco Zero)
const waveEngine = new PaperTradingEngine();
waveEngine.handleSignal(signal, 100_000, decision, {
  approved: true, reasons: [], stopLoss: 98_000, takeProfit: 105_000,
  stopDistancePct: 0.02, notionalUsd: 1_000, riskUsd: 20, grossR: 2.5, netR: 2.31
});
// R = 2.000 de distância de SL (100k - 98k). +0.6R = +1.200 (preço 101.200)
waveEngine.updatePrice('BTC/USDT', 101_250); // Atinge +0.625R
const waveTrade = waveEngine.getAccountState().openPositions[0];
assert.ok(waveTrade, 'Posição deve continuar aberta após parcial');
assert.equal(waveTrade.partialTaken, true, 'partialTaken deve ser true após bater +0.6R');
assert.equal(waveTrade.stopLoss, 100_000, 'Stop Loss deve ter sido movido para o ponto de entrada (Breakeven)');
assert.ok(waveTrade.partialPnlUsd && waveTrade.partialPnlUsd > 0, 'Lucro parcial deve ser positivo e registrado');
// Teste de Trailing Stop Vivo ancorado no Book L2
const bookTrailingEngine = new PaperTradingEngine();
bookTrailingEngine.handleSignal(signal, 100_000, decision, {
  approved: true, reasons: [], stopLoss: 98_000, takeProfit: 105_000,
  stopDistancePct: 0.02, notionalUsd: 1_000, riskUsd: 20, grossR: 2.5, netR: 2.31
});
// Simula preço atingindo o TP para virar Runner (105.000) e fornecendo Book L2 com parede em 104.800
bookTrailingEngine.updatePrice('BTC/USDT', 105_100, {
  imbalanceRatio: 2.0,
  bidDepthTotal: 100,
  askDepthTotal: 50,
  bids: [
    { price: 105_000, amount: 2 },
    { price: 104_800, amount: 50 }, // Maior parede da baleia
    { price: 104_500, amount: 5 }
  ],
  asks: []
});
const runnerTrade = bookTrailingEngine.getAccountState().openPositions[0];
assert.ok(runnerTrade, 'Runner deve estar ativo');
assert.equal(runnerTrade.isRunner, true);
assert.ok(runnerTrade.trailingStopPrice && runnerTrade.trailingStopPrice >= 104_799, 'Trailing stop deve estar ancorado 1 tick atrás da parede de 104.800');

console.log('paperTradingEngine: PASS');
