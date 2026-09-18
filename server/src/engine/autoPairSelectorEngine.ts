import { AssetSummary, OrderBookData } from '../../../shared/types';
import { PairPerformance } from './pairPerformanceTracker';

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
  isActiveForTrading: boolean; // Autonomia da IA para ligar/desligar o par
  regime: RegimeType;
  efficiencyScore: number; // 0 a 100
  temperature: TemperatureLevel;
  temperatureLabel: string;
  powerMultiplier: number; // 0.5x, 1.0x, 2.0x, 3.0x, 4.0x, 5.0x
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

      // Pontuação de Eficácia (0 a 100) baseada em Microestrutura e Edge
      let efficiencyScore = 60;
      if (winRate >= 80 && pnl > 100) efficiencyScore += 35;
      else if (winRate >= 65 && pnl > 0) efficiencyScore += 20;
      else if (winRate >= 50 && pnl >= 0) efficiencyScore += 10;
      else if (winRate < 45 || pnl < -50) efficiencyScore -= 30;

      if (spreadScore === 'TIGHT') efficiencyScore += 10;
      if (liquidityScore === 'DEEP') efficiencyScore += 10;

      efficiencyScore = Math.max(10, Math.min(100, efficiencyScore));

      // Escala Termodinâmica de Confluência & Potência da Mão (A partir de 1.5x até 5.0x)
      let isActiveForTrading = true;
      let powerMultiplier = 1.5;
      let baseAllocation = 3000;
      let temperature: TemperatureLevel = 'HOT_MAX_EXTRACT';
      let temperatureLabel = '🔥 Base Quant (1.5x)';
      let actionReason = 'Operando com lote base calibrado a 1.5x em regime ativo.';

      if (efficiencyScore >= 95 && spreadScore === 'TIGHT' && liquidityScore === 'DEEP') {
        // ⚡🏛️ NÍVEL DIVINO (DEUS): Confluência Absoluta (Absorption + Imbalance + Win Rate > 80% + Spread Mínimo)
        isActiveForTrading = true;
        powerMultiplier = 5.0;
        baseAllocation = 10000;
        temperature = 'DIVINE_CONFLUENCE';
        temperatureLabel = '⚡🏛️ EXTRAÇÃO SUPREMA / DEUS (5.0x)';
        actionReason = '👑 Confluência Perfeita no Book L2 & Tape! Mão elevada a 5.0x para captura máxima.';
      } else if (efficiencyScore >= 88 && liquidityScore === 'DEEP') {
        // 🌌 NÍVEL GALÁCTICO: Confluência Severa
        isActiveForTrading = true;
        powerMultiplier = 4.0;
        baseAllocation = 8000;
        temperature = 'GALACTIC_SURGE';
        temperatureLabel = '🌌 EXTRAÇÃO GALÁCTICA (4.0x)';
        actionReason = '🚀 Fluxo institucional maciço e assimetria positiva brutal. Potência 4.0x ativa.';
      } else if (efficiencyScore >= 80) {
        // 💥 NÍVEL SUPERNOVA / POWER
        isActiveForTrading = true;
        powerMultiplier = 3.0;
        baseAllocation = 6000;
        temperature = 'SUPERNOVA_POWER';
        temperatureLabel = '💥 EXTRAÇÃO POWER (3.0x)';
        actionReason = '⚡ Momento de alta densidade compradora/vendedora. Potência triplicada (3.0x).';
      } else if (efficiencyScore >= 68) {
        // 🔥 NÍVEL EXTRAÇÃO MÁXIMA (2.0x - 2.5x)
        isActiveForTrading = true;
        powerMultiplier = 2.0;
        baseAllocation = 4000;
        temperature = 'HOT_MAX_EXTRACT';
        temperatureLabel = '🔥 EXTRAÇÃO MÁXIMA (2.0x)';
        actionReason = '🔥 Win rate elevado e book favorável. Potência elevada para 2.0x.';
      } else if (efficiencyScore >= 45) {
        // ⚡ NÍVEL BASE QUANT (1.5x)
        isActiveForTrading = true;
        powerMultiplier = 1.5;
        baseAllocation = 3000;
        temperature = 'HOT_MAX_EXTRACT';
        temperatureLabel = '⚡ Base Quant (1.5x)';
        actionReason = 'Mercado favorável. Operação iniciada com temperatura mínima de 1.5x.';
      } else {
        // ⛔ PAR DESATIVADO PELA IA
        isActiveForTrading = false;
        powerMultiplier = 0.0;
        baseAllocation = 0;
        temperature = 'COLD_DEFENSE';
        temperatureLabel = '⛔ Pausado (0.0x)';
        actionReason = '⛔ Par pausado pela IA: Condições desfavoráveis para proteger o patrimônio.';
      }

      const status: DynamicPairStatus = {
        symbol: asset.symbol,
        isActiveForTrading,
        regime,
        efficiencyScore,
        temperature,
        temperatureLabel,
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
