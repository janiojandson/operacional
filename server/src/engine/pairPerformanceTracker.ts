import { PaperAccount, SimulatedTrade } from '../../shared/paperTypes';
import { AssetSummary, FlowSignal } from '../../shared/types';

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

export class PairPerformanceTracker {
  public static calculate(history: SimulatedTrade[], assets: AssetSummary[]): PairPerformance[] {
    const symbolMap = new Map<string, SimulatedTrade[]>();

    // Agrupar histórico por ativo
    for (const trade of history) {
      if (!symbolMap.has(trade.symbol)) {
        symbolMap.set(trade.symbol, []);
      }
      symbolMap.get(trade.symbol)!.push(trade);
    }

    // Gerar métricas para cada ativo cadastrado
    return assets.map(asset => {
      const trades = symbolMap.get(asset.symbol) || [];
      const totalTrades = trades.length;
      const winningTrades = trades.filter(t => t.status === 'CLOSED_TP').length;
      const losingTrades = trades.filter(t => t.status === 'CLOSED_SL').length;
      const winRate = totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(1)) : 0;
      
      const realizedPnl = Number(trades.reduce((sum, t) => sum + t.pnlUsd, 0).toFixed(2));
      const grossProfit = trades.filter(t => t.pnlUsd > 0).reduce((sum, t) => sum + t.pnlUsd, 0);
      const grossLoss = Math.abs(trades.filter(t => t.pnlUsd < 0).reduce((sum, t) => sum + t.pnlUsd, 0));
      
      const profitFactor = grossLoss > 0 
        ? Number((grossProfit / grossLoss).toFixed(2)) 
        : (grossProfit > 0 ? 99.9 : 0);

      const avgPnlPerTrade = totalTrades > 0 ? Number((realizedPnl / totalTrades).toFixed(2)) : 0;

      let statusRecommendation: 'EXCELENTE' | 'ESTAVEL' | 'REVISAR' | 'DESATIVAR' = 'ESTAVEL';
      if (totalTrades >= 3) {
        if (winRate >= 65 && realizedPnl > 0) statusRecommendation = 'EXCELENTE';
        else if (winRate >= 50 && realizedPnl >= 0) statusRecommendation = 'ESTAVEL';
        else if (winRate >= 40 || realizedPnl < 0) statusRecommendation = 'REVISAR';
        else statusRecommendation = 'DESATIVAR';
      }

      return {
        symbol: asset.symbol,
        totalTrades,
        winningTrades,
        losingTrades,
        winRate,
        realizedPnl,
        profitFactor,
        avgPnlPerTrade,
        statusRecommendation
      };
    });
  }
}
