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
  'BTC/USDT': { symbol: 'BTC/USDT', stopLossPct: 0.0028, takeProfitPct: 0.0070, maxSpreadPct: 0.0003, maxBookAgeMs: 30_000, minBookImbalance: 2.8, maxBookImbalance: 0.35, minScore: 3, atrMultiplier: 1.2, maxRiskPct: 0.0025, maxAggregateRiskPct: 0.01, slippageBufferPct: 0.0002 },
  'ETH/USDT': { symbol: 'ETH/USDT', stopLossPct: 0.0032, takeProfitPct: 0.0080, maxSpreadPct: 0.0005, maxBookAgeMs: 30_000, minBookImbalance: 2.6, maxBookImbalance: 0.38, minScore: 3, atrMultiplier: 1.3, maxRiskPct: 0.0025, maxAggregateRiskPct: 0.01, slippageBufferPct: 0.0003 },
  'SOL/USDT': { symbol: 'SOL/USDT', stopLossPct: 0.0044, takeProfitPct: 0.0110, maxSpreadPct: 0.0008, maxBookAgeMs: 20_000, minBookImbalance: 3.0, maxBookImbalance: 0.33, minScore: 3, atrMultiplier: 1.6, maxRiskPct: 0.002, maxAggregateRiskPct: 0.01, slippageBufferPct: 0.0004 },
  'BNB/USDT': { symbol: 'BNB/USDT', stopLossPct: 0.0032, takeProfitPct: 0.0080, maxSpreadPct: 0.0006, maxBookAgeMs: 30_000, minBookImbalance: 2.7, maxBookImbalance: 0.37, minScore: 3, atrMultiplier: 1.3, maxRiskPct: 0.0025, maxAggregateRiskPct: 0.01, slippageBufferPct: 0.0003 },
  'XRP/USDT': { symbol: 'XRP/USDT', stopLossPct: 0.0040, takeProfitPct: 0.0100, maxSpreadPct: 0.001, maxBookAgeMs: 20_000, minBookImbalance: 3.2, maxBookImbalance: 0.31, minScore: 3, atrMultiplier: 1.5, maxRiskPct: 0.002, maxAggregateRiskPct: 0.01, slippageBufferPct: 0.0005 }
};

export function getCryptoStrategyProfile(symbol: string): CryptoStrategyProfile | undefined {
  return CRYPTO_STRATEGY_PROFILES[symbol];
}
