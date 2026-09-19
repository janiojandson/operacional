import { GoogleSheetsService } from './server/src/services/googleSheetsService.js';

async function test() {
  console.log("1. Enviando log de trade do Master Quant (GREEN +2.5R)...");
  await GoogleSheetsService.logTradeExecution({
    clientName: '👑 Master Quant (Estratégia)',
    symbol: 'SOL/USDT',
    side: 'BUY',
    entryPrice: 194.50,
    qty: 15.42,
    stopLoss: 192.55,
    takeProfit: 199.36,
    status: 'MASTER_WIN (+2.5R)',
    outcome: 'GREEN 🟢',
    pnlUsd: 75.00,
    pnlPct: 2.50,
    rMultiple: 2.5,
    timestamp: new Date().toISOString(),
    errorMsg: 'Take Profit atingido! P&L: +$75.00 (+2.50%) | Retorno: +2.5R'
  });

  console.log("2. Enviando log de Shadow Audit (FILTRO SALVOU A BANCA)...");
  await GoogleSheetsService.logShadowAudit({
    symbol: 'ETH/USDT',
    side: 'SELL',
    oldMode: 'EXECUTADO 🟢',
    newMode: 'BLOQUEADO 🛑',
    reasons: 'Exposição direcional em USDT excede teto de 2.0R (Projetada: 3.0R)',
    spreadPips: 1.2,
    usdExposureR: 2.0,
    outcome: 'RED 🔴',
    pnlUsd: -30.00,
    pnlPct: -1.00,
    rMultiple: -1.0,
    safetyVerdict: '🛡️ FILTRO SALVOU A BANCA (Bloqueou loss de -$30.00 | -1.00%)',
    timestamp: new Date().toISOString()
  });

  console.log("Sucesso! Ambos enviados para a planilha.");
}

test();
