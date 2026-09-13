import { ClientProtectionAccount } from '../../shared/types';

export class ClientProtectionEngine {
  private static clients: Map<string, ClientProtectionAccount> = new Map([
    [
      'cli-1',
      {
        id: 'cli-1',
        name: 'Mesa Institucional Alpha',
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

  public static updateClientPnl(id: string, pnlChange: number): ClientProtectionAccount | undefined {
    const client = this.clients.get(id);
    if (!client) return undefined;

    client.currentBalance += pnlChange;
    client.equity += pnlChange;
    client.lastUpdated = Date.now();

    const netPnl = client.currentBalance - client.initialBalance;

    // Checar Trailing Loss
    if (netPnl <= -client.trailingLossUsd) {
      client.status = 'LOCKED_LOSS';
      client.lockedReason = `Trava de Perda (TL) acionada na janela ${client.timeWindow} (-$${Math.abs(netPnl).toFixed(2)})`;
    }
    // Checar Target Gain
    else if (netPnl >= client.targetGainUsd) {
      client.status = 'LOCKED_GAIN';
      client.lockedReason = `Meta de Ganho (TG) alcançada na janela ${client.timeWindow} (+$${netPnl.toFixed(2)})`;
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
