import { ClientAccountConfig, ClientTradeLog } from '../../shared/clientTypes';
import { SimulatedTrade } from '../../shared/paperTypes';

export class ClientCopyTraderEngine {
  private clients: Map<string, ClientAccountConfig> = new Map();
  private logs: ClientTradeLog[] = [];
  private onLogCallback?: (log: ClientTradeLog) => void;

  constructor(onLog?: (log: ClientTradeLog) => void) {
    this.onLogCallback = onLog;

    // Cliente Demonstração padrão
    this.addOrUpdateClient({
      id: 'client-demo-1',
      clientName: 'Conta VIP Trader Alpha',
      exchange: 'BYBIT',
      apiKey: 'bybit_key_demo_***',
      apiSecret: 'bybit_secret_demo_***',
      isActive: true,
      maxDailyLossUsd: 300, // Trava de proteção em -$300
      maxDailyProfitTargetUsd: 600, // Meta batida de +$600
      currentDailyPnl: 145.50,
      maxOpenPositions: 2,
      fixedLotUsd: 1000,
      copyAiAutonomy: true,
      notificationPhone: '5511999999999'
    });
  }

  public addOrUpdateClient(config: ClientAccountConfig) {
    this.clients.set(config.id, config);
  }

  public getClients(): ClientAccountConfig[] {
    return Array.from(this.clients.values());
  }

  public getLogs(): ClientTradeLog[] {
    return this.logs;
  }

  // Replica a ordem disparada pela estratégia protegendo os limites de risco
  public replicateTrade(trade: SimulatedTrade, powerMultiplier = 1.0) {
    for (const client of this.clients.values()) {
      if (!client.isActive) continue;

      // 🛡️ PROTEÇÃO 1: Trava de Perda Diária Máxima (Daily Stop)
      if (client.currentDailyPnl <= -client.maxDailyLossUsd) {
        this.emitLog({
          id: `log-${Date.now()}-${client.id}`,
          clientId: client.id,
          symbol: trade.symbol,
          side: trade.type,
          price: trade.entryPrice,
          amount: 0,
          costUsd: 0,
          status: 'BLOCKED_RISK_LIMIT',
          executedAt: Date.now(),
          reason: `⛔ Trava Diária de Perda Atingida (-$${Math.abs(client.currentDailyPnl)} >= -$${client.maxDailyLossUsd}). Operações bloqueadas por proteção.`
        });
        continue;
      }

      // 🛡️ PROTEÇÃO 2: Meta Diária de Lucro Batida (Stop Gain / Preservação)
      if (client.currentDailyPnl >= client.maxDailyProfitTargetUsd) {
        this.emitLog({
          id: `log-${Date.now()}-${client.id}`,
          clientId: client.id,
          symbol: trade.symbol,
          side: trade.type,
          price: trade.entryPrice,
          amount: 0,
          costUsd: 0,
          status: 'BLOCKED_RISK_LIMIT',
          executedAt: Date.now(),
          reason: `🏆 Meta Diária de Lucro Batida (+$${client.currentDailyPnl} >= +$${client.maxDailyProfitTargetUsd}). Lucros preservados até o próximo dia.`
        });
        continue;
      }

      // Cálculo de tamanho ajustado por potência da IA
      const finalMultiplier = client.copyAiAutonomy ? powerMultiplier : 1.0;
      const orderCost = client.fixedLotUsd * finalMultiplier;
      const amount = Number((orderCost / trade.entryPrice).toFixed(4));

      this.emitLog({
        id: `exec-${Date.now()}-${client.id}`,
        clientId: client.id,
        symbol: trade.symbol,
        side: trade.type,
        price: trade.entryPrice,
        amount,
        costUsd: orderCost,
        status: 'EXECUTED',
        executedAt: Date.now(),
        reason: `🚀 Ordem Replicada via API ${client.exchange} (${finalMultiplier}x Potência | $${orderCost} alocado)`
      });

      // Notificar via Comunicacao Hub se configurado
      this.sendWhatsAppNotification(client, trade, orderCost);
    }
  }

  private async sendWhatsAppNotification(client: ClientAccountConfig, trade: SimulatedTrade, orderCost: number) {
    const comunicacaoUrl = process.env.COMUNICACAO_API_URL || 'https://comunicacao-hub-production.up.railway.app/api';
    const secretKey = process.env.API_SECRET_KEY || 'nexus_secret_hub_2026_x89a';

    if (!client.notificationPhone) return;

    try {
      const message = `🚨 *MarketFlow Pro — Alerta de Execução*\n\nPar: *${trade.symbol}*\nTipo: *${trade.type}*\nPreço: *$${trade.entryPrice.toLocaleString()}*\nAlocação: *$${orderCost.toLocaleString()}*\nMotivo: ${trade.signalReason}`;
      
      await fetch(`${comunicacaoUrl}/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': secretKey
        },
        body: JSON.stringify({
          instance: 'financas',
          to: client.notificationPhone,
          message
        })
      }).catch(() => {});
    } catch (e) {
      // Background notify resilience
    }
  }

  private emitLog(log: ClientTradeLog) {
    this.logs.unshift(log);
    if (this.logs.length > 50) this.logs.pop();
    if (this.onLogCallback) {
      this.onLogCallback(log);
    }
  }
}
