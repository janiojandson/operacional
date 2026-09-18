import { GoogleSheetsService } from './server/src/services/googleSheetsService.js';

async function test() {
  console.log("Enviando log de teste do Shadow Mode...");
  try {
    await GoogleSheetsService.logShadowAudit({
      symbol: 'BTCUSDT',
      side: 'BUY',
      oldMode: 'EXECUTADO',
      newMode: 'BLOQUEADO (TESTE)',
      reasons: 'Teste manual do painel',
      spreadPips: 1.2,
      usdExposureR: 0.5,
      timestamp: new Date().toISOString()
    });
    console.log("Log enviado com sucesso para a planilha. Verifique sua aba do Google Sheets!");
  } catch (err) {
    console.error("Erro ao enviar:", err);
  }
}

test();
