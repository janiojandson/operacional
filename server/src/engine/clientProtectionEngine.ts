import { ClientProtectionAccount } from '../../../shared/types';
import { BybitExecutionEngine } from './bybitExecutionEngine.js';
import { ClientConfigDB } from '../database/db.js';

export class ClientProtectionEngine {
  private static comunicacaoHubUrl = process.env.COMUNICACAO_API_URL || 'https://comunicacao-hub-production.up.railway.app/api';
  private static comunicacaoApiKey = process.env.COMUNICACAO_API_KEY || 'nexus_secret_hub_2026_x89a';
  private static whatsappInstance = 'licitacoes';

  private static clients: Map<string, ClientProtectionAccount> = new Map([
    [
      'cli-1',
      {
        id: 'cli-1',
        name: 'Mesa Institucional Alpha',
        phone: '5541999998888',
        initialBalance: 25000,
        currentBalance: 26450.50,
        equity: 26890.00,
        targetGainUsd: 2000,
        trailingLossUsd: 750,
        timeWindow: '1d',
        status: 'ACTIVE',
        activePairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
        createdAt: Date.now() - 86400000 * 5,
        lastUpdated: Date.now()
      }
    ],
    [
      'cli-2',
      {
        id: 'cli-2',
        name: 'Fundo Quant Bybit Momentum',
        phone: '5541999997777',
        initialBalance: 10000,
        currentBalance: 10320.00,
        equity: 10320.00,
        targetGainUsd: 500,
        trailingLossUsd: 300,
        timeWindow: '1h',
        status: 'ACTIVE',
        activePairs: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT'],
        createdAt: Date.now() - 86400000 * 2,
        lastUpdated: Date.now()
      }
    ]
  ]);

  /**
   * Alerta WhatsApp seguro (sem quebrar a thread principal se estiver desconectado)
   */
  public static async sendWhatsAppAlert(
    phoneOrParams: string | { phone?: string; clientName?: string; messageType?: string; currentBalance?: number; initialBalance?: number; dailyPnl?: number; reason?: string },
    messageText?: string
  ): Promise<boolean> {
    return false; // Desativado silenciosamente conforme solicitado anteriormente
  }

  public static getAllClients(): ClientProtectionAccount[] {
    return Array.from(this.clients.values());
  }

  public static addClient(clientData: Omit<ClientProtectionAccount, 'id' | 'createdAt' | 'lastUpdated' | 'status'>): ClientProtectionAccount {
    const id = `cli-${Date.now()}`;
    const newClient: ClientProtectionAccount = {
      ...clientData,
      id,
      currentBalance: clientData.initialBalance,
      equity: clientData.initialBalance,
      status: 'ACTIVE',
      createdAt: Date.now(),
      lastUpdated: Date.now()
    };
    this.clients.set(id, newClient);
    return newClient;
  }

  public static deleteClient(id: string): boolean {
    return this.clients.delete(id);
  }

  /**
   * 🛑 STOP GERAL PROPORCIONAL & CIRCUIT BREAKER
   * Monitora a banca ao vivo do cliente em proporção à banca do master.
   * Se a perda máxima diária for atingida ou o saldo cair no piso, liquida a mercado e desconecta!
   */
  public static async checkEmergencyBreaker(
    clientId: string,
    liveEquity: number,
    openPnl: number,
    masterBaseBalance = 10000
  ): Promise<{ triggered: boolean; reason?: string }> {
    const client = this.clients.get(clientId);
    const config = await ClientConfigDB.findByClientId(clientId).catch(() => null);

    // Se a banca do cliente for diferente do master, calcula a proporção exata
    const clientBaseBalance = client?.initialBalance || Number(config?.balance) || 10000;
    const proportionRatio = clientBaseBalance / masterBaseBalance; // ex: 2.500 / 10.000 = 0.25 (25%)

    // Limites proporcionais (se o master tolera -$150, um cliente com 25% de banca tolera -$37.50)
    const baseDailyLossLimit = Number(config?.max_daily_loss_usd || client?.trailingLossUsd || 150.0);
    const effectiveDailyLoss = baseDailyLossLimit * (proportionRatio > 0 ? proportionRatio : 1.0);

    // Piso mínimo da banca (ex: tolerar no máximo 5% de drawdown global ou piso configurado)
    const minFloorUsd = clientBaseBalance * 0.95; // Piso em 95% da banca

    const estourouPerda = openPnl <= -effectiveDailyLoss;
    const atingiuPiso = liveEquity <= minFloorUsd;

    if (estourouPerda || atingiuPiso) {
      const reason = atingiuPiso
        ? `Banca viva ($${liveEquity.toFixed(2)}) atingiu o piso limite de segurança ($${minFloorUsd.toFixed(2)})`
        : `Prejuízo flutuante aberto ($${openPnl.toFixed(2)}) ultrapassou o limite proporcional diário (-$${effectiveDailyLoss.toFixed(2)})`;

      console.error(`\x1b[41m\x1b[37m[CIRCUIT BREAKER PROPORCIONAL]\x1b[0m 🚨 STOP GERAL ATIVADO para ${clientId}! Motivo: ${reason}`);

      // 1. Trava o cliente no banco
      if (config) {
        await ClientConfigDB.setSyncEnabled(clientId, false);
        await ClientConfigDB.setActive(clientId, false);
      }
      if (client) {
        client.status = 'LOCKED_LOSS';
        client.lockedReason = reason;
      }

      // 2. Dispara o pânico: fecha tudo a mercado na Bybit
      await BybitExecutionEngine.panicCloseAll(clientId).catch((err) => {
        console.error(`[CIRCUIT BREAKER] Erro ao fechar posições na Bybit:`, err.message);
      });

      return { triggered: true, reason };
    }

    return { triggered: false };
  }

  public static updateClientPnl(id: string, pnlChange: number): ClientProtectionAccount | undefined {
    const client = this.clients.get(id);
    if (!client) return undefined;

    client.currentBalance += pnlChange;
    client.equity += pnlChange;
    client.lastUpdated = Date.now();

    const netPnl = client.currentBalance - client.initialBalance;

    // Checar Trailing Loss
    if (netPnl <= -client.trailingLossUsd && client.status !== 'LOCKED_LOSS') {
      client.status = 'LOCKED_LOSS';
      client.lockedReason = `Trava de Perda (TL) acionada (-$${Math.abs(netPnl).toFixed(2)})`;
    }
    // Checar Target Gain
    else if (netPnl >= client.targetGainUsd && client.status !== 'LOCKED_GAIN') {
      client.status = 'LOCKED_GAIN';
      client.lockedReason = `Meta de Ganho (TG) alcançada (+$${netPnl.toFixed(2)})`;
    }

    return client;
  }

  public static unlockClient(id: string): ClientProtectionAccount | undefined {
    const client = this.clients.get(id);
    if (client) {
      client.status = 'ACTIVE';
      client.lockedReason = undefined;
      client.lastUpdated = Date.now();
    }
    return client;
  }
}