export interface Trade {
  id: string;
  symbol: string;
  price: number;
  amount: number;
  side: 'buy' | 'sell';
  timestamp: number;
  cost: number;
  isWhale?: boolean;
}

export interface OrderBookLevel {
  price: number;
  amount: number;
  total: number;
}

export interface OrderBookData {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
  spread: number;
  bidDepthTotal: number;
  askDepthTotal: number;
  imbalanceRatio: number; // > 1 indicates bullish book, < 1 bearish
  source?: 'BYBIT' | 'BINANCE' | 'BINGX' | 'LOCAL_FALLBACK';
}

export interface CandleData {
  time: number; // Unix timestamp in seconds for lightweight-charts
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;
  cvd: number;
}

export interface FlowSignal {
  id: string;
  type: 'ABSORPTION_BUY' | 'ABSORPTION_SELL' | 'BOOK_IMBALANCE' | 'WHALE_AGGRESSION';
  symbol: string;
  price: number;
  volume: number;
  message: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high';
}

export interface FlowPressure {
  symbol: string;
  buyPressurePct: number; // 0 to 100
  sellPressurePct: number; // 0 to 100
  netPressurePct: number; // -100 to +100
  dominantSide: 'BUY' | 'SELL' | 'NEUTRAL';
  imbalanceScore: number;
  whaleActivityLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
}

export type ChartTimeframe = '1m' | '3m' | '5m' | '15m' | '1h' | '4h' | '1D';

export interface ClientProtectionAccount {
  id: string;
  name: string;
  phone?: string;
  initialBalance: number;
  currentBalance: number;
  equity: number;
  targetGainUsd: number;
  trailingLossUsd: number;
  timeWindow: '30m' | '1h' | '1d' | '1w' | '1m';
  status: 'ACTIVE' | 'LOCKED_GAIN' | 'LOCKED_LOSS';
  lockedReason?: string;
  activePairs: string[];
  createdAt: number;
  lastUpdated: number;
}

export interface PairAutonomousStatus {
  symbol: string;
  name: string;
  category: 'crypto' | 'forex';
  isActive: boolean;
  activatedByAI: boolean;
  reason: string;
  volatilityScore: number;
  orderFlowScore: number;
  liquidityScore: number;
}

export interface AssetSummary {
  symbol: string;
  name: string;
  category: 'crypto' | 'forex';
  lastPrice: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  cvd: number;
}

export interface PairPerformance {
  symbol: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  realizedPnl: number;
  profitFactor: number;
  avgPnlPerTrade: number;
  statusRecommendation: 'EXCELENTE' | 'ESTAVEL' | 'REVISAR' | 'DESATIVAR';
}

export type RegimeType = 'HIGH_TREND' | 'CHOPPY_RANGING' | 'LOW_LIQUIDITY' | 'EXPANSION_FLOW';

export type TemperatureLevel = 
  | 'COLD_DEFENSE'       // 0.0x / 0.5x (Defesa)
  | 'NORMAL'             // 1.0x (Padrão)
  | 'HOT_MAX_EXTRACT'    // 2.0x (Extração Máxima)
  | 'SUPERNOVA_POWER'    // 3.0x (Extração Power)
  | 'GALACTIC_SURGE'     // 4.0x (Extração Galáctica)
  | 'DIVINE_CONFLUENCE'; // 5.0x (Extração Suprema / Deus)

export interface DynamicPairStatus {
  symbol: string;
  isActiveForTrading: boolean;
  regime: RegimeType;
  efficiencyScore: number;
  temperature: TemperatureLevel;
  temperatureLabel: string;
  powerMultiplier: number;
  recommendedAllocationUsd: number;
  actionReason: string;
  spreadScore: 'TIGHT' | 'ACCEPTABLE' | 'WIDE';
  liquidityScore: 'DEEP' | 'MEDIUM' | 'SHALLOW';
}

export interface ClientAccountConfig {
  id: string;
  name: string;
  email: string;
  phone?: string;
  planType: string;
  planActive: boolean;
  balance: number;
  riskPct: number;
  leverage: number;
}

export interface ClientTradeLog {
  id: string;
  clientId: string;
  symbol: string;
  side: string;
  entryPrice: number;
  qty: number;
  status: string;
  pnlUsd?: number;
  pnlPct?: number;
  rMultiple?: number;
  timestamp: string;
  errorMsg?: string;
}

export type SessionType = 'ASIA' | 'LONDON' | 'NY' | 'OFF_HOURS';
export type MarketRegime = 
  | 'TRENDING_BULL' 
  | 'TRENDING_BEAR' 
  | 'RANGING' 
  | 'VOLATILE_EXPANSION' 
  | 'COMPRESSION'
  | 'TREND'
  | 'RANGE'
  | 'HIGH_VOLATILITY'
  | 'HIGH_TREND'
  | 'CHOPPY_RANGING'
  | 'LOW_LIQUIDITY'
  | 'EXPANSION_FLOW';
