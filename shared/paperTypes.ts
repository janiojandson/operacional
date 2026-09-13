export type SessionType = 'ASIA' | 'LONDON' | 'NY';
export type MarketRegime = 'TREND' | 'RANGE' | 'HIGH_VOLATILITY';

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
  rMultiple: number; // R-Multiple (ex: +2.0R, -1.0R)
  session: SessionType;
  dayOfWeek: string; // 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'
  marketRegime: MarketRegime;
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

// 6 Blocos Quantitativos Institucionais
export interface FinancialMetricsBlock {
  netProfit: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  returnPct: number;
  avgTradeReturn: number;
  mathExpectationR: number; // Expectativa matemática em R: (WR% * AvgWinR) - (LR% * AvgLossR)
  mathExpectationUsd: number;
  largestWinUsd: number;
  largestLossUsd: number;
  avgWinUsd: number;
  avgLossUsd: number;
  payoffRatio: number; // avgWin / avgLoss
}

export interface RiskDrawdownBlock {
  maxDrawdownUsd: number;
  maxDrawdownPct: number;
  maxDrawdownR: number;
  avgDrawdownPct: number;
  recoveryFactor: number; // Lucro Líquido / Max DD
  calmarRatio: number;
  ulcerIndex: number;
  isBreakerTriggered: boolean; // Trava de segurança anti-banca negativa
  breakerReason?: string;
}

export interface SequenceRegimeBlock {
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  currentStreak: {
    type: 'WIN' | 'LOSS' | 'NONE';
    count: number;
  };
  regimeBreakdown: {
    regime: MarketRegime;
    tradesCount: number;
    winRate: number;
    profitFactor: number;
    pnlUsd: number;
  }[];
}

export interface DistributionBlock {
  medianPnlUsd: number;
  standardDeviationPnl: number;
  percentile10: number;
  percentile50: number;
  percentile90: number;
  rDistribution: {
    range: string;
    count: number;
    pct: number;
  }[];
}

export interface SegmentItem {
  key: string;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  pnlUsd: number;
  mathExpectationR: number;
}

export interface ContextSegmentationBlock {
  bySymbol: SegmentItem[];
  bySession: SegmentItem[];
  byDayOfWeek: SegmentItem[];
  byDirection: SegmentItem[];
}

export interface MonteCarloBlock {
  iterations: number;
  simulatedCurves: number[][]; // 10 curvas de amostra
  drawdown95Pct: number;
  drawdown99Pct: number;
  probabilityOfRuinPct: number; // Risco de quebra de banca
  medianFinalEquity: number;
  robustnessVerdict: 'EXCELENTE' | 'ROBUSTA' | 'MODERADA' | 'VULNERÁVEL';
}

export interface QuantStrategyHealthReport {
  timestamp: number;
  financial: FinancialMetricsBlock;
  riskDrawdown: RiskDrawdownBlock;
  sequences: SequenceRegimeBlock;
  distribution: DistributionBlock;
  segmentation: ContextSegmentationBlock;
  monteCarlo: MonteCarloBlock;
  overallScore: number; // 0 a 100
  verdict: string;
  actionableInsights: string[];
}
