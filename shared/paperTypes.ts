export interface SimulatedTrade {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  entryPrice: number;
  currentPrice: number;
  takeProfit: number;
  stopLoss: number;
  pnlUsd: number;
  pnlPct: number;
  status: 'OPEN' | 'CLOSED_TP' | 'CLOSED_SL';
  entryTime: number;
  closeTime?: number;
  signalReason: string;
}

export interface PaperAccount {
  balance: number;
  equity: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  realizedPnl: number;
  openPositions: SimulatedTrade[];
  history: SimulatedTrade[];
}
