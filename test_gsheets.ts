import { GoogleSheetsService } from './server/src/services/googleSheetsService.js';

async function test() {
  console.log("1. Enviando log de trade do Master Quant...");
  await GoogleSheetsService.logTradeExecution({
    clientName: '👑 Master Quant (Estratégia)',
    symbol: 'SOL/USDT',
    side: 'BUY',
    entryPrice: 194.50,
    qty: 15.42,
    stopLoss: 192.55,
    takeProfit: 199.36,
    status: 'MASTER_ABERTO',
    timestamp: new Date().toISOString(),
    errorMsg: 'Absorção institucional de venda detectada no livro de ofertas [Potência 2.5x]'
  });

  console.log("2. Enviando log de Shadow Audit...");
  await GoogleSheetsService.logShadowAudit({
    symbol: 'ETH/USDT',
    side: 'SELL',
    oldMode: 'PADRÃO',
    newMode: 'PERMITIDO',
    reasons: 'Absorção de venda confirmada no topo',
    spreadPips: 0.8,
    usdExposureR: 0.3,
    timestamp: new Date().toISOString()
  });

  console.log("Sucesso! Ambos enviados para a planilha.");
}

test();
