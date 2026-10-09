import assert from 'node:assert/strict';
import { PaperTradingEngine } from './paperTradingEngine.js';
import { evaluateCryptoOpportunity } from './cryptoStrategyDecision.js';
import type { FlowSignal } from '../../../shared/types.js';

// Regression suite for the explicitly retained legacy policy.
process.env.MARKET_EXIT_POLICY = 'LEGACY';

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

// Teste de Invalidação Ativa por Order Flow adverso (Calibração Defensiva a -0.70R)
const flowInvalidationEngine = new PaperTradingEngine();
flowInvalidationEngine.handleSignal(signal, 100_000, decision, {
  approved: true, reasons: [], stopLoss: 98_000, takeProfit: 105_000,
  stopDistancePct: 0.02, notionalUsd: 1_000, riskUsd: 20, grossR: 2.5, netR: 2.31
});
assert.equal(flowInvalidationEngine.getAccountState().openPositions.length, 1);

// Em pullback normal (-0.5R = 99_000): NÃO deve fechar prematuramente por mero ruído
flowInvalidationEngine.updatePrice(
  'BTC/USDT',
  99_000,
  { imbalanceRatio: 0.25, bidDepthTotal: 10, askDepthTotal: 40 },
  { dominantSide: 'sell', whaleCount: 1 }
);
assert.equal(flowInvalidationEngine.getAccountState().openPositions.length, 1, 'pullback normal a -0.50R deve respirar');

// Em estresse severo (-0.75R = 98_500) com book imbalance severo (0.15 <= 0.20) e agressão de venda: DEVE fechar
flowInvalidationEngine.updatePrice(
  'BTC/USDT',
  98_500,
  { imbalanceRatio: 0.15, bidDepthTotal: 5, askDepthTotal: 35 },
  { dominantSide: 'sell', whaleCount: 1 }
);
assert.equal(flowInvalidationEngine.getAccountState().openPositions.length, 0, 'deve invalidar quando estresse >= -0.70R com confluência');
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
assert.equal(fixedClosed.grossR, 2.5);
assert.equal(fixedClosed.rMultiple, fixedClosed.totalNetPnl! / fixedClosed.initialRiskUsd!);

// Teste de Cooldown pós-saída registrado no engine
assert.ok(fixedTpEngine.getLastExitTimestamp('BTC/USDT') !== undefined, 'closing position must register lastExitTimestamp');
assert.equal(fixedTpEngine.isCooldownActive('BTC/USDT', 15 * 60 * 1000), true, '15-min cooldown must be active right after close');
assert.equal(fixedTpEngine.isCooldownActive('ETH/USDT', 15 * 60 * 1000), false, 'untraded pair must not be in cooldown');

// Reset administrativo deve iniciar uma sessão realmente limpa.
fixedTpEngine.setDailyLockoutActive(true);
fixedTpEngine.resetData(10_000);
assert.equal(fixedTpEngine.isDailyLockoutActive(), false, 'resetData must clear the in-memory daily lockout');
assert.equal(fixedTpEngine.isCooldownActive('BTC/USDT', 15 * 60 * 1000), false, 'resetData must clear per-symbol cooldowns');
assert.equal(fixedTpEngine.getAccountState().history.length, 0, 'resetData must clear session history');
assert.equal(fixedTpEngine.getAccountState().balance, 10_000, 'resetData must restore requested balance');

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

// Teste de Realização Parcial em +0.6R com Breakeven Protegido (+0.15% cobrindo taxas)
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
assert.equal(waveTrade.stopLoss, 100_150, 'Stop Loss deve ter sido movido para Breakeven Protegido de taxas (100.150)');
assert.ok(waveTrade.partialPnlUsd && waveTrade.partialPnlUsd > 0, 'Lucro parcial deve ser positivo e registrado');

// Teste de Time-Stop para posições estagnadas em regime lateral (> 12h sem evoluir)
const timeStopEngine = new PaperTradingEngine();
timeStopEngine.handleSignal(signal, 100_000, decision, {
  approved: true, reasons: [], stopLoss: 98_000, takeProfit: 105_000,
  stopDistancePct: 0.02, notionalUsd: 1_000, riskUsd: 20, grossR: 2.5, netR: 2.31
});
const stagnantTrade = timeStopEngine.getAccountState().openPositions[0];
assert.ok(stagnantTrade);
stagnantTrade.entryTime = Math.floor((Date.now() - 13 * 3600 * 1000) / 1000);
stagnantTrade.marketRegime = 'NEUTRAL_RANGING';
timeStopEngine.updatePrice('BTC/USDT', 100_100); // Retorno insignificante (+0.05R) após 13h
assert.equal(timeStopEngine.getAccountState().openPositions.length, 0, 'Time-Stop deve encerrar posição estagnada após 12h');
assert.equal(timeStopEngine.getAccountState().history[0].closeReason, 'ACTIVE_FLOW_INVALIDATION');

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
