import { ClientAccountConfig, ClientTradeLog } from '../../shared/clientTypes.js';
import { SimulatedTrade } from '../../shared/paperTypes.js';
import { ClientConfigDB } from '../database/db.js';
import { BybitExecutionEngine } from './bybitExecutionEngine.js';
import { ComunicacaoService } from '../services/comunicacaoService.js';

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
  public async replicateTrade(trade: SimulatedTrade, powerMultiplier = 1.0) {
    // 1. Execução para clientes em memória / demonstração
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
        reason: `🚀 Ordem Replicada (Simulação / Demo | ${finalMultiplier}x Potência | $${orderCost} alocado)`
      });

      // Notificar via Comunicacao Service se configurado
      if (client.notificationPhone) {
        const msg = `🚨 *MarketFlow Pro — Alerta de Execução*\n\nPar: *${trade.symbol}*\nTipo: *${trade.type}*\nPreço: *$${trade.entryPrice.toLocaleString()}*\nAlocação: *$${orderCost.toLocaleString()}*\nMotivo: ${trade.signalReason}`;
        ComunicacaoService.sendWhatsApp({ to: client.notificationPhone, message: msg }).catch(() => {});
      }
    }

    // 2. Execução REAL para clientes cadastrados no Banco de Dados com sincronização ativada
    try {
      const realConfigs = await ClientConfigDB.listAll();
      const now = Date.now();
      const eligibleClients = realConfigs.filter(c => {
        const isExp = c.plan_expires_at ? Number(c.plan_expires_at) < now : false;
        const isVitrine = c.plan_type === 'VITRINE';
        return (
          Number(c.is_active) === 1 &&
          Number(c.sync_enabled) === 1 &&
          Number(c.api_connected) === 1 &&
          Number(c.plan_active) === 1 &&
          !isExp &&
          !isVitrine &&
          Boolean(c.bybit_api_key_enc)
        );
      });

      if (eligibleClients.length > 0) {
        console.log(`[CopyTrader] 📡 Disparando ordem real para ${eligibleClients.length} cliente(s) ativo(s)...`);

        await Promise.allSettled(
          eligibleClients.map(async (cfg) => {
            try {
              const execRes = await BybitExecutionEngine.executeCopyTrade(cfg.client_id, {
                symbol: trade.symbol,
                side: trade.type === 'BUY' ? 'BUY' : 'SELL',
                entryPrice: trade.entryPrice,
                stopLoss: trade.stopLoss,
                takeProfit: trade.takeProfit,
                signalReason: trade.signalReason
              });

              if (execRes.success) {
                this.emitLog({
                  id: `exec-real-${Date.now()}-${cfg.client_id}`,
                  clientId: cfg.client_id,
                  symbol: trade.symbol,
                  side: trade.type,
                  price: trade.entryPrice,
                  amount: execRes.sizing?.qty || 0,
                  costUsd: execRes.sizing?.notionalUsd || 0,
                  status: 'EXECUTED',
                  executedAt: Date.now(),
                  reason: `✅ Ordem Real Executada Bybit (Order: ${execRes.orderId || 'OK'} | Qty: ${execRes.sizing?.qty})`
                });

                if (cfg.notification_phone) {
                  const msg = `⚡ *MarketFlow Pro — Ordem Real Executada*\n\nPar: *${trade.symbol}*\nTipo: *${trade.type}*\nPreço: *$${trade.entryPrice.toLocaleString()}*\nVolume: *$${execRes.sizing?.notionalUsd}*\nAlavancagem: *${execRes.sizing?.leverage}x*\nOrdem Bybit: \`${execRes.orderId}\``;
                  ComunicacaoService.sendWhatsApp({ to: cfg.notification_phone, message: msg }).catch(() => {});
                }
              } else {
                this.emitLog({
                  id: `err-real-${Date.now()}-${cfg.client_id}`,
                  clientId: cfg.client_id,
                  symbol: trade.symbol,
                  side: trade.type,
                  price: trade.entryPrice,
                  amount: 0,
                  costUsd: 0,
                  status: 'BLOCKED_RISK_LIMIT',
                  executedAt: Date.now(),
                  reason: `⚠️ Falha ao executar na Bybit: ${execRes.error}`
                });
              }
            } catch (err: any) {
              console.error(`[CopyTrader] Erro ao executar para cliente real ${cfg.client_id}:`, err.message);
            }
          })
        );
      }
    } catch (dbErr: any) {
      console.error('[CopyTrader] Erro ao buscar clientes reais do banco:', dbErr.message);
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

