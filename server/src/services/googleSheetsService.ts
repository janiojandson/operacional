// ======================================================
// 📁 server/src/services/googleSheetsService.ts
// Integração com Google Sheets (Apps Script Web App)
// ======================================================



import { randomUUID } from 'node:crypto';

const WEB_APP_URL = process.env.GOOGLE_SHEETS_WEB_APP_URL || 'https://script.google.com/macros/s/AKfycbzMTad90G0F_-VqJMRbPeoHqazT_-R5MqR4ZmYswyCII-K0vslKiWV_BuB2nIpu9tFkkQ/exec';

export function createSheetWebhookPayload<T extends Record<string, unknown>>(data: T, requestId: string = randomUUID()): T & { requestId: string } {
  return { ...data, requestId };
}

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
  /** Apps Script v3.1 (USD ONLY) */
  orderType?: string;
  trailingStopAtivo?: string;
  feePaid?: number;
  pnlTeoricoSemTrailing?: string;
  tradeId?: string;
  eventKind?: 'OPEN' | 'CLOSE';
  masterBalanceAtEntry?: number;
  masterNotionalUsd?: number;
  masterExposureRatio?: number;
  masterMarginUsd?: number;
  powerMultiplier?: number;
  leverage?: number;
  exchangeMinQty?: number;
  qtyStep?: number;
  shadowFilterActive?: boolean;
  grossR?: number;
  netR?: number;
  riskUsd?: number;
  riskReasons?: string[];
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

export interface ShadowOpportunityPayload {
  type: 'SHADOW_OPPORTUNITY';
  id: string;
  symbol: string;
  side: string;
  mode: 'AUDIT' | 'FILTER';
  approved: boolean;
  reasons: string[];
  source: string;
  timestamp: string;
}

export class GoogleSheetsService {
  /**
   * Envia os dados silenciosamente (non-blocking)
   */
  private static async sendData(data: any): Promise<void> {
    if (!WEB_APP_URL) return;

    try {
      const payload = createSheetWebhookPayload(data);
      const response = await fetch(WEB_APP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      try {
        const payload = JSON.parse(body);
        if (payload?.status === 'error') throw new Error(payload.message || 'Apps Script recusou o evento');
      } catch (err) {
        if (err instanceof SyntaxError) return;
        throw err;
      }
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

  static async logShadowOpportunity(log: Omit<ShadowOpportunityPayload, 'type'>): Promise<void> {
    this.sendData({ ...log, type: 'SHADOW_OPPORTUNITY' }).catch(() => {});
  }

  static async syncOpenPositions(openPositions: any[], masterBalance: number = 10000): Promise<void> {
    if (!openPositions || openPositions.length === 0) return;
    for (const pos of openPositions) {
      const qty = Number(pos.qty ?? 0);
      const entryPrice = Number(pos.entryPrice ?? 0);
      const notional = Number(pos.notionalUsd ?? (entryPrice * qty));
      const pnlUsd = Number(pos.pnlUsd ?? 0);
      const pnlPct = Number(pos.pnlPct ?? 0);
      const rMultiple = Number(pos.rMultiple ?? 0);

      this.logTradeExecution({
        clientName: '👑 Master Quant (Estratégia)',
        symbol: pos.symbol,
        side: pos.type,
        entryPrice,
        qty,
        stopLoss: pos.stopLoss,
        takeProfit: pos.takeProfit,
        status: 'MASTER_ABERTO',
        outcome: 'EM ANDAMENTO ⏳',
        pnlUsd,
        pnlPct,
        rMultiple,
        orderType: pos.orderType === 'LIMIT' ? 'LIMIT' : 'MARKET',
        trailingStopAtivo: pos.trailingActive ? 'SIM' : 'NÃO',
        feePaid: Number(pos.fee ?? 0),
        tradeId: pos.id,
        eventKind: 'OPEN',
        masterBalanceAtEntry: Number(pos.masterBalanceAtEntry ?? masterBalance),
        masterNotionalUsd: notional,
        masterExposureRatio: Number(pos.masterExposureRatio ?? (masterBalance > 0 ? notional / masterBalance : 0)),
        masterMarginUsd: Number(pos.marginUsd ?? (notional / 10)),
        powerMultiplier: Number(pos.powerMultiplier ?? 1.5),
        leverage: 10,
        exchangeMinQty: 0.0001,
        qtyStep: 0.0001,
        shadowFilterActive: false,
        grossR: Number(pos.grossR ?? 0),
        netR: Number(pos.netR ?? 0),
        riskUsd: Number(pos.riskUsd ?? 0),
        riskReasons: pos.decisionFactors ?? [],
        timestamp: new Date().toISOString(),
        errorMsg: pos.signalReason || 'Sincronização Ativa de Posição em Aberto'
      });
    }
  }

  static async resetSpreadsheet(): Promise<void> {
    await this.sendData({ type: 'RESET_SESSION', timestamp: new Date().toISOString() });
  }
}
