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
