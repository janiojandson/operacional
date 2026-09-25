import { SessionType, MarketRegime } from './types';

export type TemperatureLevel = 
  | 'COLD_DEFENSE'       // 0.0x / 0.5x (Defesa)
  | 'NORMAL'             // 1.0x (Padrão)
  | 'HOT_MAX_EXTRACT'    // 2.0x (Extração Máxima)
  | 'SUPERNOVA_POWER'    // 3.0x (Extração Power)
  | 'GALACTIC_SURGE'     // 4.0x (Extração Galáctica)
  | 'DIVINE_CONFLUENCE'; // 5.0x (Extração Suprema / Deus)

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
  powerMultiplier: number; // 0.5, 1.0, 2.0, 3.0, 4.0, 5.0
  temperature: TemperatureLevel;
  session: SessionType;
  dayOfWeek: string; // 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'
  marketRegime: MarketRegime;
  status: 'OPEN' | 'CLOSED_TP' | 'CLOSED_SL';
  entryTime: number;
  closeTime?: number;
  signalReason: string;
  qty?: number;
  notionalUsd?: number;
  riskUsd?: number;
  grossR?: number;
  netR?: number;
  marginUsd?: number;
  masterExposureRatio?: number;
  masterBalanceAtEntry?: number;
  fee?: number;
  netPnl?: number;
  strategyVersion?: string;
  closeReason?: 'FIXED_TP' | 'TRAILING' | 'STOP_LOSS' | 'RUNNER_TRAILING_EXIT' | 'ACTIVE_FLOW_INVALIDATION';
  realizedR?: number;
  decisionFactors?: string[];
}

export interface PaperAccount {
  initialBalance?: number;
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

export interface TemperatureImpactAnalysis {
  temperature: TemperatureLevel;
  label: string;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  netPnlUsd: number;
  avgPnlPerTrade: number;
  maxDrawdownUsd: number;
  healthVerdict: 'ALAVANCOU COM SUCESSO' | 'NEUTRO' | 'DESTRUIU VALOR / ALTO RISCO';
}

export interface ContextSegmentationBlock {
  bySymbol: SegmentItem[];
  bySession: SegmentItem[];
  byDayOfWeek: SegmentItem[];
  byDirection: SegmentItem[];
  byTemperature: TemperatureImpactAnalysis[];
  optimalTemperatureLimit: string;
  exposureImpactVerdict: string;
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

export interface EquityPeriodStat {
  period: string;
  pnlUsd: number;
  netPnlUsd: number;
  returnPct: number;
  winRate: number;
  tradesCount: number;
}

export interface EquityEvolutionBlock {
  daily: EquityPeriodStat[];
  weekly: EquityPeriodStat[];
  monthly: EquityPeriodStat[];
  sharpeRatio: number;
  calmarRatio: number;
  consistencyScore: number; // 0 a 100
  avgDailyPnlUsd: number;
}

export interface QuantStrategyHealthReport {
  timestamp: number;
  financial: FinancialMetricsBlock;
  riskDrawdown: RiskDrawdownBlock;
  sequences: SequenceRegimeBlock;
  distribution: DistributionBlock;
  segmentation: ContextSegmentationBlock;
  monteCarlo: MonteCarloBlock;
  evolution: EquityEvolutionBlock; // 7º Bloco: Evolução Temporal
  overallScore: number; // 0 a 100
  verdict: string;
  actionableInsights: string[];
}

