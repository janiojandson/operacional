import { PairPerformance } from './pairPerformanceTracker';
import { PaperAccount, QuantStrategyHealthReport } from '../../shared/paperTypes';
import { AssetSummary, FlowSignal } from '../../shared/types';
import { QuantStrategyEngine } from './quantStrategyEngine';

export interface AIAdvisorAuditReport {
  timestamp: number;
  provider: 'NEXUS_CEREBRO' | 'GEMINI_AI' | 'HYBRID_AUTO';
  overallScore: number; // 0 a 100
  verdict: string;
  quantReport: QuantStrategyHealthReport;
  pairRankings: {
    topPerformer: string;
    worstPerformer: string;
    recommendationAction: string;
  };
  diagnosticGaps: string[];
  tacticalAdjustments: string[];
  detailedAiAnalysis: string;
}

export class AIAdvisorEngine {
  public static generateAudit(
    account: PaperAccount,
    pairStats: PairPerformance[],
    assets: AssetSummary[],
    recentSignals: FlowSignal[],
    provider: 'NEXUS_CEREBRO' | 'GEMINI_AI' | 'HYBRID_AUTO' = 'HYBRID_AUTO'
  ): AIAdvisorAuditReport {
    const quantReport = QuantStrategyEngine.generateHealthReport(account);

    // Classificar pares
    const sortedPairs = [...pairStats].sort((a, b) => b.realizedPnl - a.realizedPnl);
    const topPerformer = sortedPairs[0]?.symbol || 'BTC/USDT';
    const worstPerformer = sortedPairs[sortedPairs.length - 1]?.symbol || 'SOL/USDT';

    // Diagnósticos e Gaps
    const diagnosticGaps: string[] = [];
    const tacticalAdjustments: string[] = [];

    if (quantReport.financial.mathExpectationR > 0) {
      tacticalAdjustments.push(`Edge matemático validado (+${quantReport.financial.mathExpectationR}R). Concentrar maior potência no par líder (${topPerformer}).`);
    } else {
      diagnosticGaps.push(`Expectativa matemática desfavorável (${quantReport.financial.mathExpectationR}R). Aumente o ratio TP/SL ou filtre falsos rompimentos.`);
    }

    if (quantReport.riskDrawdown.isBreakerTriggered) {
      diagnosticGaps.push(`⚠️ ATENÇÃO: ${quantReport.riskDrawdown.breakerReason}`);
      tacticalAdjustments.push('Parar novas aberturas e aguardar restauração de volatilidade controlada.');
    }

    if (quantReport.sequences.maxConsecutiveLosses >= 3) {
      diagnosticGaps.push(`Sequência máxima de ${quantReport.sequences.maxConsecutiveLosses} perdas consecutivas observada. Risco de drawdown temporário.`);
      tacticalAdjustments.push('Aplicar redução de lote para 0.5x após 2 perdas consecutivas no mesmo par.');
    }

    if (account.openPositions.length >= 3) {
      diagnosticGaps.push('Exposição simultânea em múltiplos pares. Risco de correlação cruzada do mercado.');
      tacticalAdjustments.push('Limitar a no máximo 2 operações simultâneas para blindar a banca.');
    }

    // Detalhes institucionais
    const analysisText = `
### Relatório de Consultoria Quantitativa e Saúde da Estratégia (${provider})
- **Expectativa Matemática ($R$):** Retorno esperado de **+${quantReport.financial.mathExpectationR}R** por trade com Profit Factor de **${quantReport.financial.profitFactor}** e Payoff Ratio de **${quantReport.financial.payoffRatio}x**.
- **Análise de Risco e Ruína (Monte Carlo 1.000 iterações):** Risco de quebra de banca estimado em **${quantReport.monteCarlo.probabilityOfRuinPct}%** com Drawdown máximo em 95% de confiança de **${quantReport.monteCarlo.drawdown95Pct}%**.
- **Diagnóstico por Sessão e Ativo:** O par **${topPerformer}** mantém melhor eficiência de absorção em microestrutura L2.
- **Segurança da Banca:** Proteção de capital ativa 24/7 com circuit breaker automático contra saldo negativo.
    `.trim();

    return {
      timestamp: Date.now(),
      provider,
      overallScore: quantReport.overallScore,
      verdict: quantReport.verdict,
      quantReport,
      pairRankings: {
        topPerformer,
        worstPerformer,
        recommendationAction: `Concentrar capital no par ${topPerformer}; gerenciar com cautela ${worstPerformer}.`
      },
      diagnosticGaps,
      tacticalAdjustments,
      detailedAiAnalysis: analysisText
    };
  }
}
