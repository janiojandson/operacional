export type CryptoStrategyProfile = {
  symbol: string;
  stopLossPct: number;
  takeProfitPct: number;
  maxSpreadPct: number;
  maxBookAgeMs: number;
  minBookImbalance: number;
  maxBookImbalance: number;
  minScore: number;
  atrMultiplier: number;
  maxRiskPct: number;
  maxAggregateRiskPct: number;
  slippageBufferPct: number;
};

export const CRYPTO_STRATEGY_VERSION = 'flow-crypto-v1';

export const CRYPTO_STRATEGY_PROFILES: Record<string, CryptoStrategyProfile> = {
  'BTC/USDT': { symbol: 'BTC/USDT', stopLossPct: 0.0080, takeProfitPct: 0.0200, maxSpreadPct: 0.0008, maxBookAgeMs: 30_000, minBookImbalance: 2.8, maxBookImbalance: 0.35, minScore: 2, atrMultiplier: 1.5, maxRiskPct: 0.010, maxAggregateRiskPct: 0.05, slippageBufferPct: 0.0003 },
  'ETH/USDT': { symbol: 'ETH/USDT', stopLossPct: 0.0100, takeProfitPct: 0.0250, maxSpreadPct: 0.0010, maxBookAgeMs: 30_000, minBookImbalance: 2.6, maxBookImbalance: 0.38, minScore: 2, atrMultiplier: 1.5, maxRiskPct: 0.010, maxAggregateRiskPct: 0.05, slippageBufferPct: 0.0004 },
  'SOL/USDT': { symbol: 'SOL/USDT', stopLossPct: 0.0140, takeProfitPct: 0.0350, maxSpreadPct: 0.0015, maxBookAgeMs: 25_000, minBookImbalance: 3.0, maxBookImbalance: 0.33, minScore: 2, atrMultiplier: 1.8, maxRiskPct: 0.010, maxAggregateRiskPct: 0.05, slippageBufferPct: 0.0005 },
  'BNB/USDT': { symbol: 'BNB/USDT', stopLossPct: 0.0090, takeProfitPct: 0.0225, maxSpreadPct: 0.0012, maxBookAgeMs: 30_000, minBookImbalance: 2.7, maxBookImbalance: 0.37, minScore: 2, atrMultiplier: 1.5, maxRiskPct: 0.010, maxAggregateRiskPct: 0.05, slippageBufferPct: 0.0004 },
  'XRP/USDT': { symbol: 'XRP/USDT', stopLossPct: 0.0120, takeProfitPct: 0.0300, maxSpreadPct: 0.0018, maxBookAgeMs: 25_000, minBookImbalance: 3.2, maxBookImbalance: 0.31, minScore: 2, atrMultiplier: 1.6, maxRiskPct: 0.010, maxAggregateRiskPct: 0.05, slippageBufferPct: 0.0006 }
};

export function getCryptoStrategyProfile(symbol: string): CryptoStrategyProfile | undefined {
  return CRYPTO_STRATEGY_PROFILES[symbol];
}
