import { AssetSummary, OrderBookData } from '../../shared/types';
import { PairPerformance } from './pairPerformanceTracker';

export type RegimeType = 'HIGH_TREND' | 'CHOPPY_RANGING' | 'LOW_LIQUIDITY' | 'EXPANSION_FLOW';

export interface DynamicPairStatus {
  symbol: string;
  isActiveForTrading: boolean; // Autonomia da IA para ligar/desligar o par
  regime: RegimeType;
  efficiencyScore: number; // 0 a 100
  powerMultiplier: number; // 0.5x, 1.0x, 1.5x, 2.0x (Aumento de potência dinâmico)
  recommendedAllocationUsd: number; // Tamanho de mão dinâmico ($)
  actionReason: string;
  spreadScore: 'TIGHT' | 'ACCEPTABLE' | 'WIDE';
  liquidityScore: 'DEEP' | 'MEDIUM' | 'SHALLOW';
}

export class AutoPairSelectorEngine {
  private static pairConfigs: Map<string, DynamicPairStatus> = new Map();

  public static evaluateAllPairs(
    assets: AssetSummary[],
    pairStats: PairPerformance[],
    books: Map<string, OrderBookData>
  ): DynamicPairStatus[] {
    const results: DynamicPairStatus[] = [];

    for (const asset of assets) {
      const stats = pairStats.find(p => p.symbol === asset.symbol);
      const book = books.get(asset.symbol);

      const totalTrades = stats?.totalTrades || 0;
      const winRate = stats?.winRate || 50;
      const pnl = stats?.realizedPnl || 0;

      // Medir Liquidez e Spread do Book
      const spread = book?.spread || 0.01;
      const depth = book?.bidDepthTotal || 100;
      const spreadScore: 'TIGHT' | 'ACCEPTABLE' | 'WIDE' = spread < (asset.lastPrice * 0.0003) ? 'TIGHT' : (spread < asset.lastPrice * 0.0008 ? 'ACCEPTABLE' : 'WIDE');
      const liquidityScore: 'DEEP' | 'MEDIUM' | 'SHALLOW' = depth > 50 ? 'DEEP' : (depth > 15 ? 'MEDIUM' : 'SHALLOW');

      // Calcular Regime de Mercado
      let regime: RegimeType = 'EXPANSION_FLOW';
      if (spreadScore === 'WIDE' || liquidityScore === 'SHALLOW') {
        regime = 'LOW_LIQUIDITY';
      } else if (Math.abs(asset.change24h) > 3.0) {
        regime = 'HIGH_TREND';
      } else {
        regime = 'CHOPPY_RANGING';
      }

      // Pontuação de Eficácia (0 a 100)
      let efficiencyScore = 60;
      if (winRate >= 70 && pnl > 0) efficiencyScore += 25;
      else if (winRate >= 55 && pnl >= 0) efficiencyScore += 10;
      else if (winRate < 45 || pnl < -50) efficiencyScore -= 30;

      if (spreadScore === 'TIGHT') efficiencyScore += 10;
      if (liquidityScore === 'DEEP') efficiencyScore += 5;

      efficiencyScore = Math.max(10, Math.min(100, efficiencyScore));

      // Decisão de Autonomia: Ligar/Desligar e Alavancar Potência
      let isActiveForTrading = true;
      let powerMultiplier = 1.0;
      let baseAllocation = 2000;
      let actionReason = 'Operando normalmente em regime estável.';

      if (efficiencyScore >= 80) {
        // 🔥 MOMENTO DE EXTRAÇÃO MÁXIMA (Aumenta a potência)
        isActiveForTrading = true;
        powerMultiplier = 2.0;
        baseAllocation = 4000;
        actionReason = '🔥 Extração Máxima: Win rate alto e liquidez profunda. Potência dobrada (2.0x).';
      } else if (efficiencyScore >= 65) {
        isActiveForTrading = true;
        powerMultiplier = 1.25;
        baseAllocation = 2500;
        actionReason = 'Alta eficiência no fluxo institucional. Potência moderada (1.25x).';
      } else if (efficiencyScore >= 45) {
        isActiveForTrading = true;
        powerMultiplier = 0.75;
        baseAllocation = 1500;
        actionReason = 'Mercado lateral/choppy. Redução de exposição para proteção de capital.';
      } else {
        // ⛔ PAR DESATIVADO PELA IA
        isActiveForTrading = false;
        powerMultiplier = 0.0;
        baseAllocation = 0;
        actionReason = '⛔ Par pausado pela IA: Baixa assertividade ou spread alto para evitar entrega de lucro.';
      }

      const status: DynamicPairStatus = {
        symbol: asset.symbol,
        isActiveForTrading,
        regime,
        efficiencyScore,
        powerMultiplier,
        recommendedAllocationUsd: baseAllocation,
        actionReason,
        spreadScore,
        liquidityScore
      };

      this.pairConfigs.set(asset.symbol, status);
      results.push(status);
    }

    return results;
  }

  public static getPairConfig(symbol: string): DynamicPairStatus | undefined {
    return this.pairConfigs.get(symbol);
  }

  public static toggleManualOverride(symbol: string, active: boolean) {
    const current = this.pairConfigs.get(symbol);
    if (current) {
      current.isActiveForTrading = active;
      current.actionReason = active ? 'Reativado manualmente pelo operador.' : 'Pausado manualmente pelo operador.';
    }
  }
}
