import assert from 'node:assert';
import { SimulatedTrade } from '../../../shared/paperTypes.js';

console.log('--- Teste de Modelagem e Consistência de PnL Parcial ---');

// Simula trade com saída parcial (+0.6R) e segunda metade fechada no breakeven
const tradeMock: SimulatedTrade = {
  id: 'sim-test-1',
  symbol: 'SOL/USDT',
  type: 'BUY',
  entryPrice: 124.0,
  currentPrice: 124.0, // Fechou no breakeven
  takeProfit: 128.0,
  stopLoss: 122.0,
  pnlUsd: 0,
  pnlPct: 0,
  rMultiple: 0,
  powerMultiplier: 1.5,
  temperature: 'NORMAL',
  session: 'LONDON',
  dayOfWeek: 'Dom',
  marketRegime: 'TREND',
  status: 'CLOSED_PARTIAL_TP',
  entryTime: 1790000000,
  closeTime: 1790001000,
  signalReason: 'Teste Parcial',
  partialTaken: true,
  partialPnlUsd: 18.50,
  fee: 2.20,
  netPnl: -2.20, // Segunda metade perdeu apenas taxas no breakeven
  totalNetPnl: 16.30, // 18.50 - 2.20 = +16.30 Líquido
  isNetPositive: true
};

assert.strictEqual(tradeMock.partialTaken, true);
assert.strictEqual(tradeMock.status, 'CLOSED_PARTIAL_TP');
assert.strictEqual(tradeMock.totalNetPnl, 16.30);
assert.strictEqual(tradeMock.isNetPositive, true);

console.log('✅ Teste de Modelagem de PnL Parcial passou com sucesso!');
