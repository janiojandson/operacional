export interface ClientAccountConfig {
  id: string;
  clientName: string;
  exchange: 'BYBIT' | 'BINANCE';
  apiKey: string;
  apiSecret: string;
  isActive: boolean;
  maxDailyLossUsd: number; // Proteção: Stop Loss financeiro diário ($)
  maxDailyProfitTargetUsd: number; // Proteção: Meta diária de lucro ($)
  currentDailyPnl: number;
  maxOpenPositions: number; // Proteção: Limite de posições simultâneas
  fixedLotUsd: number; // Tamanho base por operação ($)
  copyAiAutonomy: boolean; // Seguir seleção e multiplicador de potência da IA
  notificationPhone?: string; // WhatsApp para alertas via Comunicacao Hub
}

export interface ClientTradeLog {
  id: string;
  clientId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  amount: number;
  costUsd: number;
  pnlUsd?: number;
  status: 'EXECUTED' | 'BLOCKED_RISK_LIMIT' | 'CLOSED';
  executedAt: number;
  reason: string;
}
