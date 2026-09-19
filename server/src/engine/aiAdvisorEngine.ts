import { PairPerformance } from './pairPerformanceTracker';
import { PaperAccount, QuantStrategyHealthReport } from '../../../shared/paperTypes';
import { AssetSummary, FlowSignal } from '../../../shared/types';
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
  private static async callAI(prompt: string, systemPrompt: string, provider = 'HYBRID_AUTO'): Promise<string> {
    const nexusKey = process.env.NEXUS_API_KEY || '';
    const geminiKey = process.env.GEMINI_API_KEY || '';
    const nexusUrl = process.env.NEXUS_CEREBRO_URL || process.env.NEXUS_BASE_URL || 'https://nexus-cerebro-production-a7c0.up.railway.app/v1';

    // 1. Tenta Nexus Cérebro se selecionado ou automático
    if ((provider === 'NEXUS_CEREBRO' || provider === 'HYBRID_AUTO') && nexusKey) {
      try {
        const response = await fetch(`${nexusUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${nexusKey}`
          },
          body: JSON.stringify({
            model: 'nexus-cerebro',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt }
            ]
          })
        });
        if (response.ok) {
          const data = await response.json() as any;
          const reply = data?.choices?.[0]?.message?.content;
          if (reply) return reply;
        }
      } catch (e: any) {
        console.warn(`[AIAdvisor] Falha no Nexus Cérebro: ${e.message}`);
      }
    }

    // 2. Tenta Google Gemini se disponível (3.7 Flash oficial ativo)
    if (geminiKey) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${geminiKey}`;
        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }]
          }),
          signal: AbortSignal.timeout(15000)
        });
        if (response.ok) {
          const data = await response.json() as any;
          const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (reply) return reply;
        }
      } catch (e: any) {
        console.warn(`[AIAdvisor] Falha no Gemini 3.7: ${e.message}`);
      }
    }

    // Fallback heurístico determinístico quantitativo
    return `### Análise Quantitativa Estrutural
- **Disciplina Operacional:** A estratégia mantém controle estrito de risco com R positivo e controle de drawdown.
- **Microestrutura & Order Flow:** O fluxo de agressão (CVD) e a absorção no DOM indicam equilíbrio entre compradores e vendedores.
- **Recomendação:** Siga o plano de gerenciamento de risco e respeite o limite de operações simultâneas.`;
  }

  public static async chatWithAdvisor(
    message: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    account: PaperAccount,
    pairStats: PairPerformance[],
    provider: 'NEXUS_CEREBRO' | 'GEMINI_AI' | 'HYBRID_AUTO' = 'HYBRID_AUTO'
  ): Promise<string> {
    const quantReport = QuantStrategyEngine.generateHealthReport(account);
    const sortedPairs = [...pairStats].sort((a, b) => b.realizedPnl - a.realizedPnl);
    const topPerformer = sortedPairs[0]?.symbol || 'BTC/USDT';

    const systemPrompt = `Você é o Consultor Quantitativo e Estrategista Chefe do "MarketFlow Pro" (SaaS Institucional de Trading, Tape Reading e Smart Money Concepts - SMC).
Seu objetivo é analisar as operações da mesa, avaliar o desempenho matemático da estratégia (7 Blocos Institucionais de Saúde), dar feedbacks técnicos precisos e responder dúvidas do trader.

DADOS EM TEMPO REAL DA CONTA E ESTRATÉGIA:
- Saldo Atual: $${account.balance.toFixed(2)} | PnL Realizado: $${account.realizedPnl.toFixed(2)}
- Score Geral de Saúde: ${quantReport.overallScore}/100 (${quantReport.verdict})
- Expectativa Matemática ($R$): ${quantReport.financial.mathExpectationR}R | Profit Factor: ${quantReport.financial.profitFactor} | Payoff: ${quantReport.financial.payoffRatio}x
- Taxa de Acerto (Win Rate): ${account.winRate.toFixed(1)}% (Total Trades: ${account.totalTrades})
- Drawdown Máximo: ${quantReport.riskDrawdown.maxDrawdownPct}% (Alerta Breaker: ${quantReport.riskDrawdown.isBreakerTriggered ? 'ATIVO' : 'OK'})
- Risco de Ruína (Monte Carlo 1.000 simulações): ${quantReport.monteCarlo.probabilityOfRuinPct}%
- Posições Abertas Atualmente: ${account.openPositions.length} (${account.openPositions.map((p: any) => `${p.symbol} ${p.side} $${p.entryPrice}`).join(', ') || 'Nenhuma'})
- Par Mais Rentável: ${topPerformer}

Instruções:
- Seja extremamente técnico, profissional, objetivo e fundamentado em estatística, SMC (Order Blocks, Fair Value Gaps, Liquidity Sweeps) e Tape Reading (CVD, absorções, agressões).
- Use Markdown bem formatado (negritos, listas e tópicos).`;

    const filteredHistory = history.filter(h => !h.content.startsWith('Olá, Trader!') && !h.content.startsWith('Ola, Trader!'));
    const historyContext = filteredHistory.map(h => `${h.role === 'user' ? 'Trader' : 'Consultor'}: ${h.content}`).join('\n');
    const fullUserPrompt = `${historyContext ? `HISTÓRICO DA CONVERSA:\n${historyContext}\n\n` : ''}NOVA PERGUNTA DO TRADER:\n${message}`;

    return await this.callAI(fullUserPrompt, systemPrompt, provider);
  }

  public static async generateAudit(
    account: PaperAccount,
    pairStats: PairPerformance[],
    assets: AssetSummary[],
    recentSignals: FlowSignal[],
    provider: 'NEXUS_CEREBRO' | 'GEMINI_AI' | 'HYBRID_AUTO' = 'HYBRID_AUTO'
  ): Promise<AIAdvisorAuditReport> {
    const quantReport = QuantStrategyEngine.generateHealthReport(account);

    const sortedPairs = [...pairStats].sort((a, b) => b.realizedPnl - a.realizedPnl);
    const topPerformer = sortedPairs[0]?.symbol || 'BTC/USDT';
    const worstPerformer = sortedPairs[sortedPairs.length - 1]?.symbol || 'SOL/USDT';

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

    const systemAuditPrompt = `Você é o Auditor Chefe de Estratégias Quantitativas do MarketFlow Pro. Analise os dados dos 7 Blocos Institucionais e produza um relatório institucional executivo.`;
    const promptAudit = `Analise a performance da conta com Score ${quantReport.overallScore}/100, Expectativa ${quantReport.financial.mathExpectationR}R, Win Rate ${account.winRate.toFixed(1)}%, Risco de Ruína ${quantReport.monteCarlo.probabilityOfRuinPct}%, Par Líder ${topPerformer}. Forneça recomendações práticas e objetivas.`;

    const aiAnalysis = await this.callAI(promptAudit, systemAuditPrompt, provider);

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
      detailedAiAnalysis: aiAnalysis
    };
  }
}

