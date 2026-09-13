import { ClientProtectionAccount } from '../../shared/types';

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
        name: 'Fundo Quant Forex Prime',
        phone: '5541999997777',
        initialBalance: 10000,
        currentBalance: 10320.00,
        equity: 10320.00,
        targetGainUsd: 500,
        trailingLossUsd: 300,
        timeWindow: '1h',
        status: 'ACTIVE',
        activePairs: ['EUR/USD', 'GBP/USD', 'USD/JPY'],
        createdAt: Date.now() - 86400000 * 2,
        lastUpdated: Date.now()
      }
    ]
  ]);

  public static async sendWhatsAppAlert(phone: string, message: string): Promise<boolean> {
    if (!phone) return false;
    const cleanPhone = phone.replace(/\D/g, '');
    const to = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

    try {
      const url = `${this.comunicacaoHubUrl}/v1/${this.whatsappInstance}/send-text`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.comunicacaoApiKey}`,
          'x-api-key': this.comunicacaoApiKey
        },
        body: JSON.stringify({ to, message })
      });
      return res.ok;
    } catch (e: any) {
      console.warn(`[ClientProtection] Falha no disparo WhatsApp para ${to}: ${e.message}`);
      return false;
    }
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

    // Enviar mensagem de boas-vindas / ativação de proteção
    if (newClient.phone) {
      const msg = `🛡️ *MarketFlow Pro — Proteção de Conta Ativada*\n\n` +
        `👤 *Cliente:* ${newClient.name}\n` +
        `💰 *Banca Inicial:* $${newClient.initialBalance.toLocaleString()}\n` +
        `🎯 *Target Gain (TG):* +$${newClient.targetGainUsd.toLocaleString()}\n` +
        `🛑 *Trailing Loss (TL):* -$${newClient.trailingLossUsd.toLocaleString()}\n` +
        `⏱️ *Janela:* ${newClient.timeWindow}\n` +
        `📊 *Pares:* ${newClient.activePairs.join(', ')}\n\n` +
        `_Robô Autônomo monitorando 24/7 com travas ativas._`;
      this.sendWhatsAppAlert(newClient.phone, msg);
    }

    return newClient;
  }

  public static deleteClient(id: string): boolean {
    return this.clients.delete(id);
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
      client.lockedReason = `Trava de Perda (TL) acionada na janela ${client.timeWindow} (-$${Math.abs(netPnl).toFixed(2)})`;

      if (client.phone) {
        const msg = `⚠️ *ALERTA DE PROTEÇÃO: TRAILING LOSS ACIONADO*\n\n` +
          `👤 *Cliente:* ${client.name}\n` +
          `🛑 *Perda na Janela:* -$${Math.abs(netPnl).toFixed(2)}\n` +
          `💰 *Saldo Atual:* $${client.currentBalance.toFixed(2)}\n` +
          `🔒 *Status:* Entradas temporariamente pausadas para blindagem do capital.\n\n` +
          `_MarketFlow Pro 24/7 Shield_`;
        this.sendWhatsAppAlert(client.phone, msg);
      }
    }
    // Checar Target Gain
    else if (netPnl >= client.targetGainUsd && client.status !== 'LOCKED_GAIN') {
      client.status = 'LOCKED_GAIN';
      client.lockedReason = `Meta de Ganho (TG) alcançada na janela ${client.timeWindow} (+$${netPnl.toFixed(2)})`;

      if (client.phone) {
        const msg = `🎯 *PARABÉNS: TARGET GAIN ALCANÇADO!*\n\n` +
          `👤 *Cliente:* ${client.name}\n` +
          `💰 *Lucro Realizado:* +$${netPnl.toFixed(2)}\n` +
          `📈 *Saldo Atual:* $${client.currentBalance.toFixed(2)}\n` +
          `🔒 *Status:* Meta diária/período batida! Posições encerradas em lucro máximo.\n\n` +
          `_MarketFlow Pro 24/7 Smart Engine_`;
        this.sendWhatsAppAlert(client.phone, msg);
      }
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

