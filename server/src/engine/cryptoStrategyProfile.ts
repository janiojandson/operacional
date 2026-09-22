export type CryptoStrategyProfile = {
  symbol: string;
  stopLossPct: number;
  takeProfitPct: number;
  maxSpreadPct: number;
  maxBookAgeMs: number;
  minBookImbalance: number;
  maxBookImbalance: number;
  minScore: number;
};

export const CRYPTO_STRATEGY_VERSION = 'flow-crypto-v1';

export const CRYPTO_STRATEGY_PROFILES: Record<string, CryptoStrategyProfile> = {
  'BTC/USDT': { symbol: 'BTC/USDT', stopLossPct: 0.008, takeProfitPct: 0.02, maxSpreadPct: 0.0003, maxBookAgeMs: 30_000, minBookImbalance: 2.8, maxBookImbalance: 0.35, minScore: 3 },
  'ETH/USDT': { symbol: 'ETH/USDT', stopLossPct: 0.01, takeProfitPct: 0.025, maxSpreadPct: 0.0005, maxBookAgeMs: 30_000, minBookImbalance: 2.6, maxBookImbalance: 0.38, minScore: 3 },
  'SOL/USDT': { symbol: 'SOL/USDT', stopLossPct: 0.014, takeProfitPct: 0.035, maxSpreadPct: 0.0008, maxBookAgeMs: 20_000, minBookImbalance: 3.0, maxBookImbalance: 0.33, minScore: 3 },
  'BNB/USDT': { symbol: 'BNB/USDT', stopLossPct: 0.009, takeProfitPct: 0.0225, maxSpreadPct: 0.0006, maxBookAgeMs: 30_000, minBookImbalance: 2.7, maxBookImbalance: 0.37, minScore: 3 },
  'XRP/USDT': { symbol: 'XRP/USDT', stopLossPct: 0.012, takeProfitPct: 0.03, maxSpreadPct: 0.001, maxBookAgeMs: 20_000, minBookImbalance: 3.2, maxBookImbalance: 0.31, minScore: 3 }
};

export function getCryptoStrategyProfile(symbol: string): CryptoStrategyProfile | undefined {
  return CRYPTO_STRATEGY_PROFILES[symbol];
}
