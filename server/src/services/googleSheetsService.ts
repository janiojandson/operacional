// ======================================================
// 📁 server/src/services/googleSheetsService.ts
// Integração com Google Sheets (Apps Script Web App)
// ======================================================



const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzMTad90G0F_-VqJMRbPeoHqazT_-R5MqR4ZmYswyCII-K0vslKiWV_BuB2nIpu9tFkkQ/exec';

export interface TradeLogPayload {
  type: 'TRADE';
  symbol: string;
  side: string;
  entryPrice: number;
  qty: number;
  stopLoss: number;
  takeProfit?: number;
  status: string;
  timestamp: string;
  clientName?: string;
  outcome?: string;
  pnlUsd?: number;
  pnlPct?: number;
  rMultiple?: number;
  shadowTheoreticalPnl?: number;
  shadowDecision?: string;
  errorMsg?: string;
}

export interface ShadowAuditPayload {
  type: 'SHADOW_AUDIT';
  symbol: string;
  side: string;
  oldMode: string;
  newMode: string;
  reasons: string;
  spreadPips: number;
  usdExposureR: number;
  timestamp: string;
  outcome?: string;
  pnlUsd?: number;
  pnlPct?: number;
  rMultiple?: number;
  safetyVerdict?: string;
}

export class GoogleSheetsService {
  /**
   * Envia os dados silenciosamente (non-blocking)
   */
  private static async sendData(data: any): Promise<void> {
    if (!WEB_APP_URL) return;

    try {
      await fetch(WEB_APP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
    } catch (err: any) {
      console.error(`\x1b[33m[GoogleSheets] Falha ao enviar log para a planilha: ${err.message}\x1b[0m`);
    }
  }

  static async logTradeExecution(log: Omit<TradeLogPayload, 'type'>): Promise<void> {
    this.sendData({ ...log, type: 'TRADE' }).catch(() => {});
  }

  static async logShadowAudit(log: Omit<ShadowAuditPayload, 'type'>): Promise<void> {
    this.sendData({ ...log, type: 'SHADOW_AUDIT' }).catch(() => {});
  }

  static async resetSpreadsheet(): Promise<void> {
    await this.sendData({ type: 'RESET_SESSION', timestamp: new Date().toISOString() });
  }
}
