import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  TrendingUp, 
  AlertOctagon, 
  Activity, 
  BarChart3, 
  Compass, 
  Dna, 
  Zap, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle,
  X,
  Layers,
  Globe,
  Calendar,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { QuantStrategyHealthReport } from '../../../shared/paperTypes';

interface QuantStrategyHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QuantStrategyHealthModal: React.FC<QuantStrategyHealthModalProps> = ({ isOpen, onClose }) => {
  const [report, setReport] = useState<QuantStrategyHealthReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'FINANCIAL' | 'RISK' | 'SEQUENCES' | 'DISTRIBUTION' | 'SEGMENTATION' | 'MONTE_CARLO' | 'EVOLUTION'>('FINANCIAL');

  const fetchHealthReport = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/strategy/health-report');
      const data = await res.json();
      setReport(data);
    } catch (e) {
      console.error('Failed to fetch quant report:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHealthReport();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none">
      <div className="bg-surface border border-border/90 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] font-mono text-slate-100 animate-fadeIn">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/80 bg-surface/95">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-accent via-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-accent-glow">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white tracking-wide">Saúde da Estratégia 24/7 (Motor Quantitativo)</h2>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                  7 BLOCOS INSTITUCIONAIS
                </span>
              </div>
              <p className="text-xs text-slate-400 font-sans mt-0.5">
                Auditoria matemática, risco de ruína, evolução temporal diária/semanal/mensal e simulação Monte Carlo.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={fetchHealthReport}
              disabled={loading}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-surface-hover hover:bg-surface border border-border text-xs text-slate-300 hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-accent' : ''}`} />
              <span>Atualizar</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Summary Score Banner */}
        {report && (
          <div className="bg-background/80 px-6 py-3 border-b border-border/70 flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Score de Saúde Quant</span>
                <div className="flex items-baseline space-x-1 mt-0.5">
                  <span className="text-2xl font-black text-accent">{report.overallScore}</span>
                  <span className="text-slate-500 text-xs">/ 100</span>
                </div>
              </div>

              <div className="h-8 w-px bg-border/80"></div>

              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Veredito do Modelo</span>
                <div className="flex items-center space-x-1.5 mt-0.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-xs text-white">{report.verdict}</span>
                </div>
              </div>

              <div className="h-8 w-px bg-border/80"></div>

              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Expectativa Matemática ($R$)</span>
                <span className={`font-bold text-sm ${report.financial.mathExpectationR >= 0 ? 'text-buy' : 'text-sell'}`}>
                  {report.financial.mathExpectationR >= 0 ? `+${report.financial.mathExpectationR}R` : `${report.financial.mathExpectationR}R`} / trade
                </span>
              </div>
            </div>

            {/* Anti-Banca Negativa Shield Badge */}
            <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-xs ${
              report.riskDrawdown.isBreakerTriggered 
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 animate-pulse' 
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}>
              <ShieldCheck className="w-4 h-4" />
              <span>{report.riskDrawdown.isBreakerTriggered ? 'TRAVA ANTI-RUÍNA ACIONADA' : 'TRAVA DE BANCA SEGURA ATIVA'}</span>
            </div>
          </div>
        )}

        {/* Navigation Tabs (7 Blocos) */}
        <div className="flex space-x-1 px-6 pt-3 bg-surface/50 border-b border-border/60 text-xs overflow-x-auto">
          {[
            { key: 'FINANCIAL', label: '1. Resultado & Expectativa (R)', icon: TrendingUp },
            { key: 'RISK', label: '2. Risco & Drawdown', icon: AlertOctagon },
            { key: 'SEQUENCES', label: '3. Sequências & Regimes', icon: Zap },
            { key: 'DISTRIBUTION', label: '4. Distribuição de Trades', icon: BarChart3 },
            { key: 'SEGMENTATION', label: '5. Segmentação (Pares/Sessões)', icon: Globe },
            { key: 'MONTE_CARLO', label: '6. Robustez & Monte Carlo', icon: Dna },
            { key: 'EVOLUTION', label: '7. Evolução & Curva de Capital', icon: Calendar },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-t-lg border-b-2 font-bold transition-all whitespace-nowrap ${
                  isActive
                    ? 'border-accent text-accent bg-background/80 shadow-sm'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-surface-hover/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {!report ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-3 text-slate-500">
              <Activity className="w-8 h-8 animate-spin text-accent" />
              <span>Calculando matrizes quantitativas em tempo real...</span>
            </div>
          ) : (
            <>
              {/* BLOCO 1: FINANCEIRO E EXPECTATIVA */}
              {activeTab === 'FINANCIAL' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="grid grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-xl bg-surface/80 border border-border/80">
                      <span className="text-[10px] text-slate-400 block">LUCRO LÍQUIDO</span>
                      <span className={`text-xl font-bold ${report.financial.netProfit >= 0 ? 'text-buy' : 'text-sell'}`}>
                        {report.financial.netProfit >= 0 ? `+$${report.financial.netProfit}` : `-$${Math.abs(report.financial.netProfit)}`}
                      </span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">Retorno: {report.financial.returnPct}%</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-surface/80 border border-border/80">
                      <span className="text-[10px] text-slate-400 block">PROFIT FACTOR</span>
                      <span className="text-xl font-bold text-amber-400">{report.financial.profitFactor}</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">Lucro B. / Perda B.</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-surface/80 border border-border/80">
                      <span className="text-[10px] text-slate-400 block">PAYOFF RATIO (ASSIMETRIA)</span>
                      <span className="text-xl font-bold text-indigo-400">{report.financial.payoffRatio}x</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">Ganho Médio / Perda Média</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-surface/80 border border-border/80">
                      <span className="text-[10px] text-slate-400 block">EXPECTATIVA MATEMÁTICA</span>
                      <span className={`text-xl font-bold ${report.financial.mathExpectationR >= 0 ? 'text-buy' : 'text-sell'}`}>
                        {report.financial.mathExpectationR >= 0 ? `+${report.financial.mathExpectationR}R` : `${report.financial.mathExpectationR}R`}
                      </span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">(${report.financial.mathExpectationUsd} / trade)</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-background/60 border border-border/80 space-y-3">
                    <span className="text-xs font-bold text-slate-300 block">DETALHAMENTO DOS GANHOS E PERDAS</span>
                    <div className="grid grid-cols-2 gap-4 text-xs font-sans">
                      <div className="space-y-2">
                        <div className="flex justify-between py-1 border-b border-border/40">
                          <span className="text-slate-400 font-mono">Lucro Bruto:</span>
                          <span className="text-buy font-bold font-mono">+${report.financial.grossProfit}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-border/40">
                          <span className="text-slate-400 font-mono">Maior Ganho Único:</span>
                          <span className="text-buy font-bold font-mono">+${report.financial.largestWinUsd}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-border/40">
                          <span className="text-slate-400 font-mono">Média dos Ganhos:</span>
                          <span className="text-buy font-bold font-mono">+${report.financial.avgWinUsd}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between py-1 border-b border-border/40">
                          <span className="text-slate-400 font-mono">Perda Bruta:</span>
                          <span className="text-sell font-bold font-mono">-${report.financial.grossLoss}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-border/40">
                          <span className="text-slate-400 font-mono">Maior Perda Única:</span>
                          <span className="text-sell font-bold font-mono">-${report.financial.largestLossUsd}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-border/40">
                          <span className="text-slate-400 font-mono">Média das Perdas:</span>
                          <span className="text-sell font-bold font-mono">-${report.financial.avgLossUsd}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* BLOCO 2: RISCO E DRAWDOWN */}
              {activeTab === 'RISK' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="grid grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-xl bg-surface/80 border border-border/80">
                      <span className="text-[10px] text-slate-400 block">MAX DRAWDOWN ($)</span>
                      <span className="text-xl font-bold text-rose-400">-${report.riskDrawdown.maxDrawdownUsd}</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">{report.riskDrawdown.maxDrawdownPct}% da banca</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-surface/80 border border-border/80">
                      <span className="text-[10px] text-slate-400 block">MAX DRAWDOWN EM R</span>
                      <span className="text-xl font-bold text-rose-400">-{report.riskDrawdown.maxDrawdownR}R</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">Em unidades de risco</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-surface/80 border border-border/80">
                      <span className="text-[10px] text-slate-400 block">CALMAR RATIO</span>
                      <span className="text-xl font-bold text-indigo-400">{report.riskDrawdown.calmarRatio}</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">Retorno % / Max DD %</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-surface/80 border border-border/80">
                      <span className="text-[10px] text-slate-400 block">ULCER INDEX</span>
                      <span className="text-xl font-bold text-amber-400">{report.riskDrawdown.ulcerIndex}</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">Profundidade do estresse</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-background/60 border border-border/80 space-y-2">
                    <span className="text-xs font-bold text-slate-300 block flex items-center space-x-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>SISTEMA DE PRESERVAÇÃO DE BANCA & CIRCUIT BREAKER</span>
                    </span>
                    <p className="text-slate-300 text-xs font-sans leading-relaxed">
                      O motor monitora a equidade após cada tick. Caso ocorra uma anomalia severa de mercado ou o saldo ameace quebrar (&lt; 50% ou saldo negativo), todas as novas ordens são bloqueadas automaticamente para blindagem patrimonial.
                    </p>
                    {report.riskDrawdown.isBreakerTriggered && (
                      <div className="p-3 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold mt-2">
                        {report.riskDrawdown.breakerReason}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* BLOCO 3: SEQUÊNCIAS E REGIMES */}
              {activeTab === 'SEQUENCES' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl bg-surface/80 border border-emerald-500/30">
                      <span className="text-[10px] text-slate-400 block">MAX CONSECUTIVE WINS</span>
                      <span className="text-2xl font-bold text-emerald-400">+{report.sequences.maxConsecutiveWins} trades</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">Maior série vencedora</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-surface/80 border border-rose-500/30">
                      <span className="text-[10px] text-slate-400 block">MAX CONSECUTIVE LOSSES</span>
                      <span className="text-2xl font-bold text-rose-400">-{report.sequences.maxConsecutiveLosses} trades</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">Maior série perdedora</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-surface/80 border border-border/80">
                      <span className="text-[10px] text-slate-400 block">SEQUÊNCIA ATUAL</span>
                      <span className={`text-2xl font-bold ${report.sequences.currentStreak.type === 'WIN' ? 'text-buy' : (report.sequences.currentStreak.type === 'LOSS' ? 'text-sell' : 'text-slate-300')}`}>
                        {report.sequences.currentStreak.count}x ({report.sequences.currentStreak.type})
                      </span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">Status imediato</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-background/60 border border-border/80 space-y-3">
                    <span className="text-xs font-bold text-slate-300 block">DESEMPENHO POR REGIME DE MERCADO</span>
                    <div className="space-y-2">
                      {report.sequences.regimeBreakdown.map((reg, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-surface/60 border border-border/60 flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-white text-xs">{reg.regime.replace('_', ' ')}</span>
                            <span className="text-[10px] text-slate-400">({reg.tradesCount} trades)</span>
                          </div>
                          <div className="flex items-center space-x-6 text-xs font-mono">
                            <div>
                              <span className="text-slate-400 text-[10px] block">WIN RATE</span>
                              <span className="font-bold text-amber-400">{reg.winRate}%</span>
                            </div>
                            <div>
                              <span className="text-slate-400 text-[10px] block">PROFIT FACTOR</span>
                              <span className="font-bold text-slate-200">{reg.profitFactor}</span>
                            </div>
                            <div className="w-20 text-right">
                              <span className="text-slate-400 text-[10px] block">PNL</span>
                              <span className={`font-bold ${reg.pnlUsd >= 0 ? 'text-buy' : 'text-sell'}`}>
                                {reg.pnlUsd >= 0 ? `+$${reg.pnlUsd}` : `-$${Math.abs(reg.pnlUsd)}`}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* BLOCO 4: DISTRIBUIÇÃO */}
              {activeTab === 'DISTRIBUTION' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="grid grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-xl bg-surface/80 border border-border/80">
                      <span className="text-[10px] text-slate-400 block">MEDIANA DO PNL</span>
                      <span className="text-xl font-bold text-white">${report.distribution.medianPnlUsd}</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">P50 (Trade Típico)</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-surface/80 border border-border/80">
                      <span className="text-[10px] text-slate-400 block">DESVIO PADRÃO (σ)</span>
                      <span className="text-xl font-bold text-indigo-400">±${report.distribution.standardDeviationPnl}</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">Dispersão dos resultados</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-surface/80 border border-border/80">
                      <span className="text-[10px] text-slate-400 block">PERCENTIL 10 (PIOR CENÁRIO)</span>
                      <span className="text-xl font-bold text-rose-400">${report.distribution.percentile10}</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">P10 dos trades</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-surface/80 border border-border/80">
                      <span className="text-[10px] text-slate-400 block">PERCENTIL 90 (MELHOR CENÁRIO)</span>
                      <span className="text-xl font-bold text-buy">+${report.distribution.percentile90}</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">P90 dos trades</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-background/60 border border-border/80 space-y-3">
                    <span className="text-xs font-bold text-slate-300 block">HISTOGRAMA DE DISTRIBUIÇÃO EM $R$</span>
                    <div className="space-y-2">
                      {report.distribution.rDistribution.map((item, idx) => (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-slate-300">{item.range}</span>
                            <span className="text-slate-400">{item.count} trades ({item.pct}%)</span>
                          </div>
                          <div className="w-full bg-surface h-2 rounded-full overflow-hidden border border-border/40">
                            <div 
                              className={`h-full ${item.range.includes('Stop') ? 'bg-rose-500' : 'bg-emerald-500'}`} 
                              style={{ width: `${item.pct}%` }}
                            ></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* BLOCO 5: SEGMENTAÇÃO POR CONTEXTO */}
              {activeTab === 'SEGMENTATION' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Par */}
                    <div className="p-4 rounded-xl bg-surface/80 border border-border/80 space-y-2">
                      <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                        <Layers className="w-4 h-4 text-accent" />
                        <span>POR PAR DE CRIPTOATIVO</span>
                      </span>
                      <div className="space-y-1.5">
                        {report.segmentation.bySymbol.map((item, idx) => (
                          <div key={idx} className="p-2 rounded bg-background/60 border border-border/40 flex justify-between items-center text-xs">
                            <span className="font-bold text-white">{item.key}</span>
                            <span className="text-amber-400">{item.winRate}% WR</span>
                            <span className={`font-bold ${item.pnlUsd >= 0 ? 'text-buy' : 'text-sell'}`}>
                              {item.pnlUsd >= 0 ? `+$${item.pnlUsd}` : `-$${Math.abs(item.pnlUsd)}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Sessão */}
                    <div className="p-4 rounded-xl bg-surface/80 border border-border/80 space-y-2">
                      <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                        <Globe className="w-4 h-4 text-accent" />
                        <span>POR SESSÃO GLOBAL</span>
                      </span>
                      <div className="space-y-1.5">
                        {report.segmentation.bySession.map((item, idx) => (
                          <div key={idx} className="p-2 rounded bg-background/60 border border-border/40 flex justify-between items-center text-xs">
                            <span className="font-bold text-white">{item.key}</span>
                            <span className="text-amber-400">{item.winRate}% WR</span>
                            <span className={`font-bold ${item.pnlUsd >= 0 ? 'text-buy' : 'text-sell'}`}>
                              {item.pnlUsd >= 0 ? `+$${item.pnlUsd}` : `-$${Math.abs(item.pnlUsd)}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Dia da Semana */}
                    <div className="p-4 rounded-xl bg-surface/80 border border-border/80 space-y-2">
                      <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                        <Calendar className="w-4 h-4 text-accent" />
                        <span>POR DIA DA SEMANA</span>
                      </span>
                      <div className="space-y-1.5">
                        {report.segmentation.byDayOfWeek.map((item, idx) => (
                          <div key={idx} className="p-2 rounded bg-background/60 border border-border/40 flex justify-between items-center text-xs">
                            <span className="font-bold text-white">{item.key}</span>
                            <span className="text-slate-400">{item.totalTrades} ops</span>
                            <span className={`font-bold ${item.pnlUsd >= 0 ? 'text-buy' : 'text-sell'}`}>
                              {item.pnlUsd >= 0 ? `+$${item.pnlUsd}` : `-$${Math.abs(item.pnlUsd)}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Direção */}
                    <div className="p-4 rounded-xl bg-surface/80 border border-border/80 space-y-2">
                      <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                        <TrendingUp className="w-4 h-4 text-accent" />
                        <span>POR DIREÇÃO (LONG vs SHORT)</span>
                      </span>
                      <div className="space-y-1.5">
                        {report.segmentation.byDirection.map((item, idx) => (
                          <div key={idx} className="p-2 rounded bg-background/60 border border-border/40 flex justify-between items-center text-xs">
                            <span className={`font-bold ${item.key === 'BUY' ? 'text-buy' : 'text-sell'}`}>{item.key === 'BUY' ? 'LONG (COMPRA)' : 'SHORT (VENDA)'}</span>
                            <span className="text-amber-400">{item.winRate}% WR</span>
                            <span className={`font-bold ${item.pnlUsd >= 0 ? 'text-buy' : 'text-sell'}`}>
                              {item.pnlUsd >= 0 ? `+$${item.pnlUsd}` : `-$${Math.abs(item.pnlUsd)}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Auditoria Específica de Temperatura e Impacto da Potência */}
                  <div className="p-4 rounded-xl bg-surface/90 border border-border/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-300 flex items-center space-x-1.5">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <span>AUDITORIA DE TEMPERATURA DA MÃO (1.5x A 5.0x DEUS) - IMPACTO NO RESULTADO</span>
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-accent/20 text-accent font-bold border border-accent/30">
                        {report.segmentation.optimalTemperatureLimit}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-300 font-sans">
                      {report.segmentation.exposureImpactVerdict}
                    </p>

                    <div className="space-y-2">
                      {report.segmentation.byTemperature?.map((temp, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-background/70 border border-border/60 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-white block">{temp.label}</span>
                            <span className="text-[10px] text-slate-400 font-sans">{temp.totalTrades} operações executadas</span>
                          </div>

                          <div className="flex items-center space-x-5 font-mono">
                            <div>
                              <span className="text-slate-400 text-[9px] block">WIN RATE</span>
                              <span className="font-bold text-amber-400">{temp.winRate}%</span>
                            </div>
                            <div>
                              <span className="text-slate-400 text-[9px] block">PROFIT FACTOR</span>
                              <span className="font-bold text-slate-200">{temp.profitFactor}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 text-[9px] block">LUCRO TOTAL</span>
                              <span className={`font-bold ${temp.netPnlUsd >= 0 ? 'text-buy' : 'text-sell'}`}>
                                {temp.netPnlUsd >= 0 ? `+$${temp.netPnlUsd}` : `-$${Math.abs(temp.netPnlUsd)}`}
                              </span>
                            </div>
                            <div className="w-36 text-right">
                              <span className="text-slate-400 text-[9px] block">STATUS DE EFICIÊNCIA</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                temp.healthVerdict === 'ALAVANCOU COM SUCESSO' 
                                  ? 'bg-emerald-500/20 text-emerald-300' 
                                  : (temp.healthVerdict === 'DESTRUIU VALOR / ALTO RISCO' ? 'bg-rose-500/20 text-rose-300' : 'text-slate-400')
                              }`}>
                                {temp.healthVerdict}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* BLOCO 6: MONTE CARLO */}
              {activeTab === 'MONTE_CARLO' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="grid grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-xl bg-surface/80 border border-border/80">
                      <span className="text-[10px] text-slate-400 block">ITERAÇÕES SIMULADAS</span>
                      <span className="text-xl font-bold text-indigo-400">{report.monteCarlo.iterations.toLocaleString()}</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">Reordenação Bootstrap</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-surface/80 border border-border/80">
                      <span className="text-[10px] text-slate-400 block">RISCO DE RUÍNA (QUEBRA)</span>
                      <span className={`text-xl font-bold ${report.monteCarlo.probabilityOfRuinPct === 0 ? 'text-buy' : 'text-sell'}`}>
                        {report.monteCarlo.probabilityOfRuinPct}%
                      </span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">Probabilidade de falência</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-surface/80 border border-border/80">
                      <span className="text-[10px] text-slate-400 block">MAX DRAWDOWN (95% IC)</span>
                      <span className="text-xl font-bold text-amber-400">{report.monteCarlo.drawdown95Pct}%</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">Intervalo de Confiança</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-surface/80 border border-border/80">
                      <span className="text-[10px] text-slate-400 block">MAX DRAWDOWN (99% IC)</span>
                      <span className="text-xl font-bold text-rose-400">{report.monteCarlo.drawdown99Pct}%</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">Pior 1% dos cenários</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-background/60 border border-border/80 space-y-2">
                    <span className="text-xs font-bold text-slate-300 block flex items-center space-x-1.5">
                      <Dna className="w-4 h-4 text-purple-400" />
                      <span>DIAGNÓSTICO DE ROBUSTEZ DA ESTRATÉGIA</span>
                    </span>
                    <p className="text-slate-300 text-xs font-sans leading-relaxed">
                      A simulação aleatória de Monte Carlo submete a ordem cronológica dos trades a 1.000 embaralhamentos diferentes para checar se o lucro atual foi fruto de sorte ou edge estatístico sustentável.
                    </p>
                    <div className="p-3 rounded-lg bg-surface/70 border border-emerald-500/30 flex items-center justify-between text-xs mt-2">
                      <span className="text-slate-300">Veredito do Teste de Robustez:</span>
                      <span className="font-bold text-emerald-400">{report.monteCarlo.robustnessVerdict}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* BLOCO 7: EVOLUÇÃO TEMPORAL & CURVA DE CAPITAL */}
              {activeTab === 'EVOLUTION' && report.evolution && (
                <div className="space-y-4 animate-fadeIn">
                  {/* Resumo Geral de Consistência */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-xl bg-surface/80 border border-border/80">
                      <span className="text-[10px] text-slate-400 block">SHARPE RATIO ANUALIZADO</span>
                      <span className="text-xl font-bold text-accent">{report.evolution.sharpeRatio}</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">Eficiência por unidade de risco</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-surface/80 border border-border/80">
                      <span className="text-[10px] text-slate-400 block">CALMAR RATIO (RETORNO/DD)</span>
                      <span className="text-xl font-bold text-indigo-400">{report.evolution.calmarRatio}</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">Recuperação sobre Drawdown</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-surface/80 border border-border/80">
                      <span className="text-[10px] text-slate-400 block">SCORE DE CONSISTÊNCIA</span>
                      <span className="text-xl font-bold text-emerald-400">{report.evolution.consistencyScore}%</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">% de períodos lucrativos</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-surface/80 border border-border/80">
                      <span className="text-[10px] text-slate-400 block">RETORNO MÉDIO DIÁRIO</span>
                      <span className={`text-xl font-bold ${report.evolution.avgDailyPnlUsd >= 0 ? 'text-buy' : 'text-sell'}`}>
                        {report.evolution.avgDailyPnlUsd >= 0 ? `+$${report.evolution.avgDailyPnlUsd}` : `-$${Math.abs(report.evolution.avgDailyPnlUsd)}`}
                      </span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">Expectativa financeira diária</span>
                    </div>
                  </div>

                  {/* Detalhamento por Período: Diário, Semanal, Mensal */}
                  <div className="grid grid-cols-3 gap-4">
                    {/* Evolução Diária */}
                    <div className="p-4 rounded-xl bg-surface/80 border border-border/80 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                          <Calendar className="w-4 h-4 text-accent" />
                          <span>EVOLUÇÃO DIÁRIA</span>
                        </span>
                        <span className="text-[10px] text-slate-400">{report.evolution.daily.length} dias</span>
                      </div>
                      <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                        {report.evolution.daily.length === 0 ? (
                          <span className="text-slate-500 text-[11px] block py-4 text-center">Nenhum registro diário fechado</span>
                        ) : (
                          report.evolution.daily.map((d, idx) => (
                            <div key={idx} className="p-2 rounded bg-background/60 border border-border/40 flex justify-between items-center text-xs">
                              <div>
                                <span className="font-bold text-white block">{d.period}</span>
                                <span className="text-[9px] text-slate-400">{d.tradesCount} ops ({d.winRate}% WR)</span>
                              </div>
                              <div className="text-right">
                                <span className={`font-bold block ${d.netPnlUsd >= 0 ? 'text-buy' : 'text-sell'}`}>
                                  {d.netPnlUsd >= 0 ? `+$${d.netPnlUsd}` : `-$${Math.abs(d.netPnlUsd)}`}
                                </span>
                                <span className="text-[9px] text-slate-400">{d.returnPct >= 0 ? `+${d.returnPct}%` : `${d.returnPct}%`}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Evolução Semanal */}
                    <div className="p-4 rounded-xl bg-surface/80 border border-border/80 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                          <Layers className="w-4 h-4 text-indigo-400" />
                          <span>EVOLUÇÃO SEMANAL</span>
                        </span>
                        <span className="text-[10px] text-slate-400">{report.evolution.weekly.length} semanas</span>
                      </div>
                      <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                        {report.evolution.weekly.length === 0 ? (
                          <span className="text-slate-500 text-[11px] block py-4 text-center">Nenhum registro semanal fechado</span>
                        ) : (
                          report.evolution.weekly.map((w, idx) => (
                            <div key={idx} className="p-2 rounded bg-background/60 border border-border/40 flex justify-between items-center text-xs">
                              <div>
                                <span className="font-bold text-white block">{w.period}</span>
                                <span className="text-[9px] text-slate-400">{w.tradesCount} ops ({w.winRate}% WR)</span>
                              </div>
                              <div className="text-right">
                                <span className={`font-bold block ${w.netPnlUsd >= 0 ? 'text-buy' : 'text-sell'}`}>
                                  {w.netPnlUsd >= 0 ? `+$${w.netPnlUsd}` : `-$${Math.abs(w.netPnlUsd)}`}
                                </span>
                                <span className="text-[9px] text-slate-400">{w.returnPct >= 0 ? `+${w.returnPct}%` : `${w.returnPct}%`}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Evolução Mensal */}
                    <div className="p-4 rounded-xl bg-surface/80 border border-border/80 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                          <TrendingUp className="w-4 h-4 text-emerald-400" />
                          <span>EVOLUÇÃO MENSAL</span>
                        </span>
                        <span className="text-[10px] text-slate-400">{report.evolution.monthly.length} meses</span>
                      </div>
                      <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                        {report.evolution.monthly.length === 0 ? (
                          <span className="text-slate-500 text-[11px] block py-4 text-center">Nenhum registro mensal fechado</span>
                        ) : (
                          report.evolution.monthly.map((m, idx) => (
                            <div key={idx} className="p-2 rounded bg-background/60 border border-border/40 flex justify-between items-center text-xs">
                              <div>
                                <span className="font-bold text-white block">{m.period}</span>
                                <span className="text-[9px] text-slate-400">{m.tradesCount} ops ({m.winRate}% WR)</span>
                              </div>
                              <div className="text-right">
                                <span className={`font-bold block ${m.netPnlUsd >= 0 ? 'text-buy' : 'text-sell'}`}>
                                  {m.netPnlUsd >= 0 ? `+$${m.netPnlUsd}` : `-$${Math.abs(m.netPnlUsd)}`}
                                </span>
                                <span className="text-[9px] text-slate-400">{m.returnPct >= 0 ? `+${m.returnPct}%` : `${m.returnPct}%`}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Actionable Insights Bar */}
              <div className="p-3.5 rounded-xl bg-surface/60 border border-accent/40 space-y-1.5">
                <span className="text-[10px] font-bold text-accent uppercase tracking-wider block">
                  INSIGHTS QUANTITATIVOS DO ANALISTA 24/7:
                </span>
                <ul className="space-y-1 text-xs text-slate-300 font-sans list-disc list-inside">
                  {report.actionableInsights.map((insight, idx) => (
                    <li key={idx}>{insight}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
};
