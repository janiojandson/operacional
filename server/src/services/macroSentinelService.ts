export interface MacroSentinelPrediction {
  regime: 'BULLISH' | 'BEARISH_DUMP' | 'NEUTRAL_RANGING';
  predictiveScore: number;
  isCircuitBreakerActive: boolean;
  confidencePct: number;
  confluences: string[];
  recommendedAction: string;
  derivatives: {
    btcPriceUsd: number;
    btc24hChangePct: number;
    solPriceUsd: number;
    fundingRate: number;
    openInterestUsd: number;
  };
  latencyMs: number;
}

export class MacroSentinelClient {
  private sentinelUrl: string;
  private timeoutMs: number;
  private cachedPrediction: MacroSentinelPrediction | null = null;
  private lastFetchTime = 0;
  private cacheTtlMs = 15000; // 15 segundos

  constructor(sentinelUrl?: string, timeoutMs: number = 3000) {
    this.sentinelUrl = sentinelUrl || process.env.MACRO_SENTINEL_URL || 'http://nexus-macro-sentinel.railway.internal:4005';
    this.timeoutMs = timeoutMs;
  }

  public async getMacroPrediction(): Promise<MacroSentinelPrediction | null> {
    const now = Date.now();
    if (this.cachedPrediction && (now - this.lastFetchTime < this.cacheTtlMs)) {
      return this.cachedPrediction;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(`${this.sentinelUrl}/v1/sentinel/prediction`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return this.cachedPrediction;
      }

      const data: any = await res.json();
      this.cachedPrediction = {
        regime: data.regime,
        predictiveScore: data.predictive_score,
        isCircuitBreakerActive: data.is_circuit_breaker_active,
        confidencePct: data.confidence_pct,
        confluences: data.confluences || [],
        recommendedAction: data.recommended_action,
        derivatives: {
          btcPriceUsd: data.derivatives?.btc_price_usd || 0,
          btc24hChangePct: data.derivatives?.btc_24h_change_pct || 0,
          solPriceUsd: data.derivatives?.sol_price_usd || 0,
          fundingRate: data.derivatives?.funding_rate || 0,
          openInterestUsd: data.derivatives?.open_interest_usd || 0
        },
        latencyMs: data.latency_ms || 0
      };
      this.lastFetchTime = now;
      return this.cachedPrediction;
    } catch {
      // Fallback gracioso para manter o Mercado Financeiro 100% resiliente
      return this.cachedPrediction;
    }
  }
}

export const macroSentinelClient = new MacroSentinelClient();

