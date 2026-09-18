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

