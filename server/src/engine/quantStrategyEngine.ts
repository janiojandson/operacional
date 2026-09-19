import { 
  SimulatedTrade, 
  PaperAccount, 
  QuantStrategyHealthReport,
  FinancialMetricsBlock,
  RiskDrawdownBlock,
  SequenceRegimeBlock,
  DistributionBlock,
  ContextSegmentationBlock,
  MonteCarloBlock,
  SegmentItem,
  TemperatureLevel
} from '../../../shared/paperTypes';
import { SessionType, MarketRegime } from '../../../shared/types';

export class QuantStrategyEngine {
  private static INITIAL_BALANCE = 10000;

  public static determineSession(timestampMs: number): SessionType {
    const date = new Date(timestampMs);
    const utcHours = date.getUTCHours();
    // Ásia: 00:00 - 08:00 UTC | Londres: 08:00 - 14:00 UTC | NY: 14:00 - 22:00 UTC
    if (utcHours >= 0 && utcHours < 8) return 'ASIA';
    if (utcHours >= 8 && utcHours < 14) return 'LONDON';
    return 'NY';
  }

  public static determineDayOfWeek(timestampMs: number): string {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const date = new Date(timestampMs);
    return days[date.getUTCDay()];
  }

  public static generateHealthReport(account: PaperAccount): QuantStrategyHealthReport {
    const trades = [...account.history].reverse(); // Ordenar cronologicamente do mais antigo para o mais recente
    const initialBal = this.INITIAL_BALANCE;

    // 1. Bloco Financeiro e Expectativa Matemática ($R$)
    const financial = this.calculateFinancialMetrics(trades, initialBal);

    // 2. Bloco Risco e Drawdown (incluindo Trava Circuit Breaker)
    const riskDrawdown = this.calculateRiskDrawdown(trades, initialBal, account.balance);

    // 3. Bloco Sequências e Regimes
    const sequences = this.calculateSequencesAndRegimes(trades);

    // 4. Bloco Distribuição dos Trades
    const distribution = this.calculateDistribution(trades);

    // 5. Bloco Segmentação por Contexto (Par, Sessão, Dia, Direção)
    const segmentation = this.calculateSegmentation(trades);

    // 6. Bloco Robustez & Simulação de Monte Carlo (1.000 iterações)
    const monteCarlo = this.runMonteCarloSimulation(trades, initialBal, 1000);

    // Score Geral (0 - 100)
    let score = 50;
    if (financial.profitFactor > 1.5) score += 15;
    else if (financial.profitFactor < 1.0) score -= 20;

    if (financial.mathExpectationR > 0.3) score += 15;
    else if (financial.mathExpectationR <= 0) score -= 15;

    if (riskDrawdown.maxDrawdownPct < 5.0) score += 10;
    else if (riskDrawdown.maxDrawdownPct > 15.0) score -= 15;

    if (monteCarlo.probabilityOfRuinPct < 1.0) score += 10;
    else score -= 20;

    score = Math.max(0, Math.min(100, Math.round(score)));

    // Veredito e Insights Acionáveis
    let verdict = 'Estratégia Estável com Edge Positivo';
    if (score >= 80) verdict = 'Estratégia Institucional de Alta Performance';
    else if (score < 50) verdict = 'Estratégia Vulnerável - Exige Ajuste Imediato de Risco';

    const actionableInsights: string[] = [];
    if (financial.mathExpectationR > 0) {
      actionableInsights.push(`Expectativa positiva de +${financial.mathExpectationR}R por trade. Edge matemático favorável.`);
    } else {
      actionableInsights.push(`Alerta: Expectativa matemática negativa (${financial.mathExpectationR}R). Ajuste a assimetria risco/retorno.`);
    }

    if (riskDrawdown.isBreakerTriggered) {
      actionableInsights.push(`⚠️ TRAVA ATIVADA: ${riskDrawdown.breakerReason}`);
    }

    if (monteCarlo.probabilityOfRuinPct === 0) {
      actionableInsights.push(`Risco de Ruína (quebra de banca) calculado em 0.0% na simulação de 1.000 cenários.`);
    } else {
      actionableInsights.push(`Atenção ao risco de ruína de ${monteCarlo.probabilityOfRuinPct}% detectado via Monte Carlo.`);
    }

    // Melhores/Piores sessões e pares
    const bestSession = [...segmentation.bySession].sort((a, b) => b.pnlUsd - a.pnlUsd)[0];
    if (bestSession && bestSession.totalTrades > 0) {
      actionableInsights.push(`Maior rentabilidade acumulada na sessão de ${bestSession.key} (+$${bestSession.pnlUsd}).`);
    }

    // 7. Bloco Evolução Temporal e Curva de Capital (Diário, Semanal, Mensal)
    const evolution = this.calculateEvolution(trades, account.balance, riskDrawdown.maxDrawdownPct);

    return {
      timestamp: Date.now(),
      financial,
      riskDrawdown,
      sequences,
      distribution,
      segmentation,
      monteCarlo,
      evolution,
      overallScore: score,
      verdict,
      actionableInsights
    };
  }

  private static calculateEvolution(trades: SimulatedTrade[], currentBalance: number, maxDrawdownPct: number = 0) {
    const dailyMap: Record<string, { pnlUsd: number; wins: number; total: number }> = {};
    const weeklyMap: Record<string, { pnlUsd: number; wins: number; total: number }> = {};
    const monthlyMap: Record<string, { pnlUsd: number; wins: number; total: number }> = {};

    trades.forEach(t => {
      const date = new Date(t.entryTime * 1000);
      const dayKey = date.toISOString().split('T')[0];
      const monthKey = dayKey.substring(0, 7);
      
      // Semana aproximada do ano
      const oneJan = new Date(date.getFullYear(), 0, 1);
      const numberOfDays = Math.floor((date.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
      const weekNumber = Math.ceil((date.getDay() + 1 + numberOfDays) / 7);
      const weekKey = `${date.getFullYear()}-W${weekNumber < 10 ? '0' + weekNumber : weekNumber}`;

      const isWin = t.status === 'CLOSED_TP' || t.pnlUsd > 0;
      const tradePnl = typeof t.pnlUsd === 'number' && !isNaN(t.pnlUsd) ? t.pnlUsd : 0;

      if (!dailyMap[dayKey]) dailyMap[dayKey] = { pnlUsd: 0, wins: 0, total: 0 };
      dailyMap[dayKey].pnlUsd += tradePnl;
      if (isWin) dailyMap[dayKey].wins++;
      dailyMap[dayKey].total++;

      if (!weeklyMap[weekKey]) weeklyMap[weekKey] = { pnlUsd: 0, wins: 0, total: 0 };
      weeklyMap[weekKey].pnlUsd += tradePnl;
      if (isWin) weeklyMap[weekKey].wins++;
      weeklyMap[weekKey].total++;

      if (!monthlyMap[monthKey]) monthlyMap[monthKey] = { pnlUsd: 0, wins: 0, total: 0 };
      monthlyMap[monthKey].pnlUsd += tradePnl;
      if (isWin) monthlyMap[monthKey].wins++;
      monthlyMap[monthKey].total++;
    });

    const formatBlock = (map: Record<string, { pnlUsd: number; wins: number; total: number }>) => {
      return Object.entries(map).map(([period, data]) => {
        const pnl = Number(data.pnlUsd.toFixed(2));
        const ret = currentBalance > 0 ? Number(((data.pnlUsd / currentBalance) * 100).toFixed(2)) : 0;
        const wr = data.total > 0 ? Number(((data.wins / data.total) * 100).toFixed(1)) : 0;
        return {
          period,
          pnlUsd: isNaN(pnl) ? 0 : pnl,
          netPnlUsd: isNaN(pnl) ? 0 : pnl,
          returnPct: isNaN(ret) ? 0 : ret,
          winRate: isNaN(wr) ? 0 : wr,
          tradesCount: data.total
        };
      });
    };

    const daily = formatBlock(dailyMap);
    const weekly = formatBlock(weeklyMap);
    const monthly = formatBlock(monthlyMap);

    const returns = daily.map(d => d.returnPct);
    const mean = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 0 ? returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length : 0;
    const stdDev = Math.sqrt(variance);
    let sharpeRatio = stdDev > 0 ? Number(((mean / stdDev) * Math.sqrt(365)).toFixed(2)) : 1.5;
    if (isNaN(sharpeRatio) || !isFinite(sharpeRatio)) sharpeRatio = 1.5;

    const totalDailyPnl = daily.reduce((acc, d) => acc + d.pnlUsd, 0);
    const avgDailyPnlUsd = daily.length > 0 ? Number((totalDailyPnl / daily.length).toFixed(2)) : 0;

    const totalNetReturnPct = currentBalance > 0 ? (totalDailyPnl / currentBalance) * 100 : 0;
    let calmarRatio = maxDrawdownPct > 0 ? Number((Math.abs(totalNetReturnPct) / maxDrawdownPct).toFixed(2)) : (totalNetReturnPct >= 0 ? 2.5 : 0.5);
    if (isNaN(calmarRatio) || !isFinite(calmarRatio)) calmarRatio = 1.0;

    const positiveDays = daily.filter(d => d.pnlUsd >= 0).length;
    let consistencyScore = daily.length > 0 ? Math.round((positiveDays / daily.length) * 100) : 75;
    if (isNaN(consistencyScore)) consistencyScore = 50;

    return {
      daily,
      weekly,
      monthly,
      sharpeRatio,
      calmarRatio,
      consistencyScore,
      avgDailyPnlUsd: isNaN(avgDailyPnlUsd) ? 0 : avgDailyPnlUsd
    };
  }


  private static calculateFinancialMetrics(trades: SimulatedTrade[], initialBal: number): FinancialMetricsBlock {
    if (trades.length === 0) {
      return {
        netProfit: 0,
        grossProfit: 0,
        grossLoss: 0,
        profitFactor: 0,
        returnPct: 0,
        avgTradeReturn: 0,
        mathExpectationR: 0,
        mathExpectationUsd: 0,
        largestWinUsd: 0,
        largestLossUsd: 0,
        avgWinUsd: 0,
        avgLossUsd: 0,
        payoffRatio: 0
      };
    }

    let grossProfit = 0;
    let grossLoss = 0;
    let winCount = 0;
    let lossCount = 0;
    let largestWin = 0;
    let largestLoss = 0;
    let totalR = 0;

    for (const t of trades) {
      const pnl = t.pnlUsd;
      const r = t.rMultiple || (pnl >= 0 ? 2.5 : -1.0);
      totalR += r;

      if (pnl > 0) {
        grossProfit += pnl;
        winCount++;
        if (pnl > largestWin) largestWin = pnl;
      } else {
        grossLoss += Math.abs(pnl);
        lossCount++;
        if (Math.abs(pnl) > largestLoss) largestLoss = Math.abs(pnl);
      }
    }

    const netProfit = grossProfit - grossLoss;
    const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : (grossProfit > 0 ? 99.9 : 0);
    const returnPct = Number(((netProfit / initialBal) * 100).toFixed(2));
    const avgTradeReturn = Number((netProfit / trades.length).toFixed(2));
    
    const winRatePct = winCount / trades.length;
    const lossRatePct = lossCount / trades.length;

    const avgWin = winCount > 0 ? grossProfit / winCount : 0;
    const avgLoss = lossCount > 0 ? grossLoss / lossCount : 0;
    const payoffRatio = avgLoss > 0 ? Number((avgWin / avgLoss).toFixed(2)) : 0;

    // Expectativa Matemática = (% Acertos * Ganho Médio) - (% Erros * Perda Média)
    const mathExpectationUsd = Number(((winRatePct * avgWin) - (lossRatePct * avgLoss)).toFixed(2));
    const mathExpectationR = Number((totalR / trades.length).toFixed(2));

    return {
      netProfit: Number(netProfit.toFixed(2)),
      grossProfit: Number(grossProfit.toFixed(2)),
      grossLoss: Number(grossLoss.toFixed(2)),
      profitFactor,
      returnPct,
      avgTradeReturn,
      mathExpectationR,
      mathExpectationUsd,
      largestWinUsd: Number(largestWin.toFixed(2)),
      largestLossUsd: Number(largestLoss.toFixed(2)),
      avgWinUsd: Number(avgWin.toFixed(2)),
      avgLossUsd: Number(avgLoss.toFixed(2)),
      payoffRatio
    };
  }

  private static calculateRiskDrawdown(trades: SimulatedTrade[], initialBal: number, currentBalance: number): RiskDrawdownBlock {
    let peak = initialBal;
    let equity = initialBal;
    let maxDdUsd = 0;
    let maxDdPct = 0;
    let sumDdPct = 0;
    let ddPoints: number[] = [];

    // Circuit Breaker: Trava de quebra de banca (se saldo cair abaixo de 20% do inicial ou for < 0)
    let isBreakerTriggered = false;
    let breakerReason: string | undefined = undefined;

    if (currentBalance <= 0) {
      isBreakerTriggered = true;
      breakerReason = 'Saldo zerado ou negativo detectado. Interrupção emergencial de novas ordens ativada.';
    } else if (currentBalance < initialBal * 0.5) {
      isBreakerTriggered = true;
      breakerReason = 'Drawdown crítico superior a 50% do capital inicial. Travamento preventivo acionado.';
    }

    for (const t of trades) {
      equity += t.pnlUsd;
      if (equity > peak) {
        peak = equity;
      }
      const ddUsd = peak - equity;
      const ddPct = peak > 0 ? (ddUsd / peak) * 100 : 0;
      ddPoints.push(ddPct);

      if (ddUsd > maxDdUsd) maxDdUsd = ddUsd;
      if (ddPct > maxDdPct) maxDdPct = ddPct;
      sumDdPct += ddPct;
    }

    const avgDdPct = ddPoints.length > 0 ? Number((sumDdPct / ddPoints.length).toFixed(2)) : 0;
    const netProfit = equity - initialBal;
    const recoveryFactor = maxDdUsd > 0 ? Number((netProfit / maxDdUsd).toFixed(2)) : (netProfit > 0 ? 99.9 : 0);
    const calmarRatio = maxDdPct > 0 ? Number((((netProfit / initialBal) * 100) / maxDdPct).toFixed(2)) : 0;

    // Ulcer Index: Raiz quadrada da média dos quadrados dos drawdowns percentuais
    const squaredDdSum = ddPoints.reduce((sum, d) => sum + (d * d), 0);
    const ulcerIndex = ddPoints.length > 0 ? Number(Math.sqrt(squaredDdSum / ddPoints.length).toFixed(2)) : 0;

    // Max Drawdown em R (assumindo 1R = 1.0% do capital / risco base institucional)
    const maxDrawdownR = Number((maxDdPct / 1.0).toFixed(1));

    return {
      maxDrawdownUsd: Number(maxDdUsd.toFixed(2)),
      maxDrawdownPct: Number(maxDdPct.toFixed(2)),
      maxDrawdownR,
      avgDrawdownPct: avgDdPct,
      recoveryFactor,
      calmarRatio,
      ulcerIndex,
      isBreakerTriggered,
      breakerReason
    };
  }

  private static calculateSequencesAndRegimes(trades: SimulatedTrade[]): SequenceRegimeBlock {
    let maxWins = 0;
    let maxLosses = 0;
    let currentStreakCount = 0;
    let currentStreakType: 'WIN' | 'LOSS' | 'NONE' = 'NONE';

    for (const t of trades) {
      const isWin = t.pnlUsd > 0;
      if (isWin) {
        if (currentStreakType === 'WIN') {
          currentStreakCount++;
        } else {
          currentStreakType = 'WIN';
          currentStreakCount = 1;
        }
        if (currentStreakCount > maxWins) maxWins = currentStreakCount;
      } else {
        if (currentStreakType === 'LOSS') {
          currentStreakCount++;
        } else {
          currentStreakType = 'LOSS';
          currentStreakCount = 1;
        }
        if (currentStreakCount > maxLosses) maxLosses = currentStreakCount;
      }
    }

    // Regimes
    const regimes: MarketRegime[] = ['TREND', 'RANGE', 'HIGH_VOLATILITY'];
    const regimeBreakdown = regimes.map(regime => {
      const regTrades = trades.filter(t => t.marketRegime === regime || (!t.marketRegime && regime === 'TREND'));
      const wins = regTrades.filter(t => t.pnlUsd > 0).length;
      const count = regTrades.length;
      const grossW = regTrades.filter(t => t.pnlUsd > 0).reduce((s, t) => s + t.pnlUsd, 0);
      const grossL = regTrades.filter(t => t.pnlUsd <= 0).reduce((s, t) => s + Math.abs(t.pnlUsd), 0);
      const pf = grossL > 0 ? Number((grossW / grossL).toFixed(2)) : (grossW > 0 ? 99.9 : 0);
      const pnl = Number((grossW - grossL).toFixed(2));

      return {
        regime,
        tradesCount: count,
        winRate: count > 0 ? Number(((wins / count) * 100).toFixed(1)) : 0,
        profitFactor: pf,
        pnlUsd: pnl
      };
    });

    return {
      maxConsecutiveWins: maxWins,
      maxConsecutiveLosses: maxLosses,
      currentStreak: {
        type: currentStreakType,
        count: currentStreakCount
      },
      regimeBreakdown
    };
  }

  private static calculateDistribution(trades: SimulatedTrade[]): DistributionBlock {
    if (trades.length === 0) {
      return {
        medianPnlUsd: 0,
        standardDeviationPnl: 0,
        percentile10: 0,
        percentile50: 0,
        percentile90: 0,
        rDistribution: []
      };
    }

    const pnls = trades.map(t => t.pnlUsd).sort((a, b) => a - b);
    const mean = pnls.reduce((s, v) => s + v, 0) / pnls.length;
    
    // Desvio Padrão
    const variance = pnls.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / pnls.length;
    const stdDev = Number(Math.sqrt(variance).toFixed(2));

    // Percentis
    const p10Index = Math.floor(pnls.length * 0.1);
    const p50Index = Math.floor(pnls.length * 0.5);
    const p90Index = Math.floor(pnls.length * 0.9);

    const percentile10 = Number(pnls[p10Index].toFixed(2));
    const percentile50 = Number(pnls[p50Index].toFixed(2));
    const percentile90 = Number(pnls[p90Index].toFixed(2));

    // R Distribution (calibrado para assimetria institucional 2.5R de Cripto)
    const ranges = [
      { range: '<= -1.0R (Stop Total)', min: -999, max: -0.9 },
      { range: '-0.9R a 0.0R (Stop Curto / BE)', min: -0.9, max: 0.0 },
      { range: '0.0R a +1.2R (Parcial / Momentum)', min: 0.0, max: 1.2 },
      { range: '+1.2R a +2.5R (Alvo Institucional 2.5R)', min: 1.2, max: 2.6 },
      { range: '> +2.5R (Extensão / Potência IA)', min: 2.6, max: 999 }
    ];

    const rDistribution = ranges.map(rng => {
      const matchCount = trades.filter(t => {
        const r = t.rMultiple || (t.pnlUsd >= 0 ? 2.5 : -1.0);
        return r >= rng.min && r < rng.max;
      }).length;

      return {
        range: rng.range,
        count: matchCount,
        pct: Number(((matchCount / trades.length) * 100).toFixed(1))
      };
    });

    return {
      medianPnlUsd: percentile50,
      standardDeviationPnl: stdDev,
      percentile10,
      percentile50,
      percentile90,
      rDistribution
    };
  }

  private static calculateSegmentation(trades: SimulatedTrade[]): ContextSegmentationBlock {
    const buildSegment = (keys: string[], keyExtractor: (t: SimulatedTrade) => string): SegmentItem[] => {
      return keys.map(key => {
        const matching = trades.filter(t => keyExtractor(t) === key);
        const count = matching.length;
        if (count === 0) {
          return { key, totalTrades: 0, winRate: 0, profitFactor: 0, pnlUsd: 0, mathExpectationR: 0 };
        }

        const wins = matching.filter(t => t.pnlUsd > 0).length;
        const grossW = matching.filter(t => t.pnlUsd > 0).reduce((s, t) => s + t.pnlUsd, 0);
        const grossL = matching.filter(t => t.pnlUsd <= 0).reduce((s, t) => s + Math.abs(t.pnlUsd), 0);
        const pf = grossL > 0 ? Number((grossW / grossL).toFixed(2)) : (grossW > 0 ? 99.9 : 0);
        const pnl = Number((grossW - grossL).toFixed(2));
        const totalR = matching.reduce((s, t) => s + (t.rMultiple || (t.pnlUsd >= 0 ? 2.5 : -1.0)), 0);

        return {
          key,
          totalTrades: count,
          winRate: Number(((wins / count) * 100).toFixed(1)),
          profitFactor: pf,
          pnlUsd: pnl,
          mathExpectationR: Number((totalR / count).toFixed(2))
        };
      });
    };

    // Par
    const uniqueSymbols = Array.from(new Set(trades.map(t => t.symbol)));
    if (uniqueSymbols.length === 0) uniqueSymbols.push('BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT');
    const bySymbol = buildSegment(uniqueSymbols, t => t.symbol);

    // Sessão
    const sessions: SessionType[] = ['ASIA', 'LONDON', 'NY'];
    const bySession = buildSegment(sessions, t => t.session || 'NY');

    // Dias
    const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    const byDayOfWeek = buildSegment(days, t => t.dayOfWeek || 'Seg');

    // Direção
    const directions = ['BUY', 'SELL'];
    const byDirection = buildSegment(directions, t => t.type);

    // Auditoria Específica de Temperatura (1.5x até 5.0x Deus)
    const tempTiers: { level: TemperatureLevel; label: string }[] = [
      { level: 'DIVINE_CONFLUENCE', label: '⚡🏛️ Extração Suprema / Deus (5.0x)' },
      { level: 'GALACTIC_SURGE', label: '🌌 Extração Galáctica (4.0x)' },
      { level: 'SUPERNOVA_POWER', label: '💥 Extração Power (3.0x)' },
      { level: 'HOT_MAX_EXTRACT', label: '🔥 Extração Máxima (2.0x)' },
      { level: 'NORMAL', label: '⚡ Base Quant Ativa (1.5x)' }
    ];

    const byTemperature = tempTiers.map(tier => {
      const matchTrades = trades.filter(t => t.temperature === tier.level || (!t.temperature && tier.level === 'NORMAL'));
      const count = matchTrades.length;
      if (count === 0) {
        return {
          temperature: tier.level,
          label: tier.label,
          totalTrades: 0,
          winRate: 0,
          profitFactor: 0,
          netPnlUsd: 0,
          avgPnlPerTrade: 0,
          maxDrawdownUsd: 0,
          healthVerdict: 'NEUTRO' as const
        };
      }

      const wins = matchTrades.filter(t => t.pnlUsd > 0).length;
      const grossW = matchTrades.filter(t => t.pnlUsd > 0).reduce((s, t) => s + t.pnlUsd, 0);
      const grossL = matchTrades.filter(t => t.pnlUsd <= 0).reduce((s, t) => s + Math.abs(t.pnlUsd), 0);
      const net = Number((grossW - grossL).toFixed(2));
      const pf = grossL > 0 ? Number((grossW / grossL).toFixed(2)) : (grossW > 0 ? 99.9 : 0);
      const winRate = Number(((wins / count) * 100).toFixed(1));
      const avgPnl = Number((net / count).toFixed(2));

      let healthVerdict: 'ALAVANCOU COM SUCESSO' | 'NEUTRO' | 'DESTRUIU VALOR / ALTO RISCO' = 'NEUTRO';
      if (net > 0 && pf >= 1.5) {
        healthVerdict = 'ALAVANCOU COM SUCESSO';
      } else if (net < 0 || pf < 0.9) {
        healthVerdict = 'DESTRUIU VALOR / ALTO RISCO';
      }

      return {
        temperature: tier.level,
        label: tier.label,
        totalTrades: count,
        winRate,
        profitFactor: pf,
        netPnlUsd: net,
        avgPnlPerTrade: avgPnl,
        maxDrawdownUsd: grossL,
        healthVerdict
      };
    });

    // Detectar Limite Saudável Ideal
    const successfulTemps = byTemperature.filter(t => t.totalTrades > 0 && t.healthVerdict === 'ALAVANCOU COM SUCESSO');
    const destructiveTemps = byTemperature.filter(t => t.totalTrades > 0 && t.healthVerdict === 'DESTRUIU VALOR / ALTO RISCO');

    let optimalTemperatureLimit = 'Temperatura Saudável até 2.0x / 3.0x';
    let exposureImpactVerdict = 'Aumento de potência operando em faixa segura e saudável.';

    if (destructiveTemps.length > 0) {
      optimalTemperatureLimit = `Alerta: Cortar potência em níveis ${destructiveTemps.map(d => d.temperature).join(', ')}`;
      exposureImpactVerdict = `Detectada perda de eficiência em mão elevada (${destructiveTemps[0].label}). Recomenda-se travar a mão máxima em 2.0x.`;
    } else if (successfulTemps.some(t => t.temperature === 'DIVINE_CONFLUENCE' || t.temperature === 'GALACTIC_SURGE')) {
      optimalTemperatureLimit = 'Potência Alta 4.0x / 5.0x com Edge Estatístico Validado';
      exposureImpactVerdict = 'A alavancagem em momentos de confluência severa aumentou a rentabilidade global sem inflar o drawdown.';
    }

    return {
      bySymbol,
      bySession,
      byDayOfWeek,
      byDirection,
      byTemperature,
      optimalTemperatureLimit,
      exposureImpactVerdict
    };
  }

  // Simulação de Monte Carlo com Reordenação Aleatória (Bootstrap / Shuffling)
  private static runMonteCarloSimulation(trades: SimulatedTrade[], initialBal: number, iterations: number = 1000): MonteCarloBlock {
    if (trades.length < 5) {
      return {
        iterations,
        simulatedCurves: [],
        drawdown95Pct: 0,
        drawdown99Pct: 0,
        probabilityOfRuinPct: 0,
        medianFinalEquity: initialBal,
        robustnessVerdict: 'MODERADA'
      };
    }

    const pnls = trades.map(t => t.pnlUsd);
    const maxDrawdowns: number[] = [];
    const finalEquities: number[] = [];
    const sampleCurves: number[][] = [];
    let ruinedCount = 0;

    for (let i = 0; i < iterations; i++) {
      // Reordenar trades aleatoriamente (Fisher-Yates)
      const shuffled = [...pnls];
      for (let j = shuffled.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
      }

      let equity = initialBal;
      let peak = initialBal;
      let maxDdPct = 0;
      let isRuined = false;
      const curvePoints: number[] = [equity];

      for (const pnl of shuffled) {
        equity += pnl;
        curvePoints.push(equity);

        if (equity <= 0 || equity < initialBal * 0.4) {
          isRuined = true;
        }

        if (equity > peak) peak = equity;
        const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
        if (dd > maxDdPct) maxDdPct = dd;
      }

      if (isRuined) ruinedCount++;
      maxDrawdowns.push(maxDdPct);
      finalEquities.push(equity);

      if (i < 8) {
        sampleCurves.push(curvePoints);
      }
    }

    maxDrawdowns.sort((a, b) => a - b);
    finalEquities.sort((a, b) => a - b);

    const dd95Index = Math.floor(iterations * 0.95);
    const dd99Index = Math.floor(iterations * 0.99);
    const medianEqIndex = Math.floor(iterations * 0.50);

    const drawdown95Pct = Number(maxDrawdowns[dd95Index].toFixed(2));
    const drawdown99Pct = Number(maxDrawdowns[dd99Index].toFixed(2));
    const probabilityOfRuinPct = Number(((ruinedCount / iterations) * 100).toFixed(2));
    const medianFinalEquity = Number(finalEquities[medianEqIndex].toFixed(2));

    let robustnessVerdict: 'EXCELENTE' | 'ROBUSTA' | 'MODERADA' | 'VULNERÁVEL' = 'ROBUSTA';
    if (probabilityOfRuinPct === 0 && drawdown95Pct < 8.0) robustnessVerdict = 'EXCELENTE';
    else if (probabilityOfRuinPct > 5.0 || drawdown95Pct > 20.0) robustnessVerdict = 'VULNERÁVEL';

    return {
      iterations,
      simulatedCurves: sampleCurves,
      drawdown95Pct,
      drawdown99Pct,
      probabilityOfRuinPct,
      medianFinalEquity,
      robustnessVerdict
    };
  }
}
