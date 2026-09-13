import React, { useState } from 'react';
import { Bot, Sparkles, Brain, Cpu, AlertTriangle, CheckCircle2, TrendingUp, RefreshCw, X } from 'lucide-react';
import { AIAdvisorAuditReport } from '../../../../server/src/engine/aiAdvisorEngine';
import { PairPerformance } from '../../../../server/src/engine/pairPerformanceTracker';

interface AIAdvisorModalProps {
  isOpen: boolean;
  onClose: () => void;
  pairStats: PairPerformance[];
}

export const AIAdvisorModal: React.FC<AIAdvisorModalProps> = ({ isOpen, onClose, pairStats }) => {
  const [provider, setProvider] = useState<'NEXUS_CEREBRO' | 'GEMINI_AI' | 'HYBRID_AUTO'>('HYBRID_AUTO');
  const [loading, setLoading] = useState(false);
  const [auditReport, setAuditReport] = useState<AIAdvisorAuditReport | null>(null);

  if (!isOpen) return null;

  const handleRunAudit = async (selectedProvider = provider) => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai-advisor/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedProvider })
      });
      const data = await res.json();
      setAuditReport(data);
    } catch (e) {
      console.error('Audit failed:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="bg-surface border border-border/80 w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/80 bg-surface/90">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-accent to-purple-600 flex items-center justify-center text-white shadow-md shadow-accent-glow">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Consultor Estratégico IA</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-accent/20 text-accent border border-accent/30 font-semibold">
                  AUDITORIA INSTITUCIONAL
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Audita histórico, eficácia de pares, overtrading e edge matemático de fluxo.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 font-mono text-xs">
          
          {/* AI Model Selector & Action Bar */}
          <div className="flex items-center justify-between bg-background/60 p-3 rounded-lg border border-border/70">
            <div className="flex items-center space-x-3">
              <span className="text-slate-400 font-sans text-xs">Provedor IA:</span>
              <div className="flex space-x-1.5">
                <button
                  onClick={() => { setProvider('NEXUS_CEREBRO'); handleRunAudit('NEXUS_CEREBRO'); }}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs transition-all ${
                    provider === 'NEXUS_CEREBRO'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold'
                      : 'bg-surface text-slate-400 border border-border hover:text-white'
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Nexus Cérebro (Local/LM)</span>
                </button>

                <button
                  onClick={() => { setProvider('GEMINI_AI'); handleRunAudit('GEMINI_AI'); }}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs transition-all ${
                    provider === 'GEMINI_AI'
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40 font-bold'
                      : 'bg-surface text-slate-400 border border-border hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Google Gemini Flash</span>
                </button>

                <button
                  onClick={() => { setProvider('HYBRID_AUTO'); handleRunAudit('HYBRID_AUTO'); }}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs transition-all ${
                    provider === 'HYBRID_AUTO'
                      ? 'bg-accent/20 text-accent border border-accent/40 font-bold'
                      : 'bg-surface text-slate-400 border border-border hover:text-white'
                  }`}
                >
                  <Brain className="w-3.5 h-3.5" />
                  <span>Híbrido Automático</span>
                </button>
              </div>
            </div>

            <button
              onClick={() => handleRunAudit()}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-1.5 rounded bg-accent hover:bg-accent/90 text-white font-bold transition-all shadow-md shadow-accent-glow disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Analisando...' : 'Rodar Nova Auditoria'}</span>
            </button>
          </div>

          {/* Audit Results Section */}
          {auditReport ? (
            <div className="space-y-4">
              
              {/* Score & Verdict Banner */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface/80 p-4 rounded-lg border border-border/70 flex flex-col justify-between">
                  <span className="text-slate-400 text-[10px]">SCORE DE SAÚDE DA ESTRATÉGIA</span>
                  <div className="flex items-baseline space-x-2 mt-1">
                    <span className="text-3xl font-extrabold text-accent">{auditReport.overallScore}</span>
                    <span className="text-slate-500 text-sm">/ 10</span>
                  </div>
                </div>

                <div className="col-span-2 bg-surface/80 p-4 rounded-lg border border-border/70 flex flex-col justify-between">
                  <span className="text-slate-400 text-[10px]">VEREDITO DO CONSULTOR IA</span>
                  <div className="flex items-center space-x-2 mt-1">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span className="text-base font-bold text-white tracking-wide">
                      {auditReport.verdict}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pair Ranking & Recommendation */}
              <div className="bg-background/40 p-3 rounded-lg border border-border/60">
                <div className="text-[11px] font-bold text-slate-300 mb-2 flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span>DESEMPENHO POR PAR E RECOMENDAÇÃO:</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div className="p-2 rounded bg-surface/60 border border-emerald-500/30">
                    <span className="text-emerald-400 font-bold block">🔥 Melhor Eficácia: {auditReport.pairRankings.topPerformer}</span>
                    <span className="text-slate-400 text-[10px]">Maior consistência em absorções e baixo slippage.</span>
                  </div>
                  <div className="p-2 rounded bg-surface/60 border border-amber-500/30">
                    <span className="text-amber-400 font-bold block">⚠️ Atenção: {auditReport.pairRankings.worstPerformer}</span>
                    <span className="text-slate-400 text-[10px]">Menor win rate ou desvio no book.</span>
                  </div>
                </div>
              </div>

              {/* Actionable Adjustments */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface/60 p-3.5 rounded-lg border border-border/60">
                  <span className="text-amber-400 font-bold flex items-center space-x-1.5 mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Gaps & Riscos Detectados</span>
                  </span>
                  <ul className="space-y-1.5 text-[11px] text-slate-300 font-sans list-disc list-inside">
                    {auditReport.diagnosticGaps.length === 0 ? (
                      <li className="text-emerald-400">Nenhum risco de overtrading ou desbalanceamento grave no momento.</li>
                    ) : (
                      auditReport.diagnosticGaps.map((gap, i) => <li key={i}>{gap}</li>)
                    )}
                  </ul>
                </div>

                <div className="bg-surface/60 p-3.5 rounded-lg border border-border/60">
                  <span className="text-emerald-400 font-bold flex items-center space-x-1.5 mb-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Ajustes Táticos Recomendados</span>
                  </span>
                  <ul className="space-y-1.5 text-[11px] text-slate-300 font-sans list-disc list-inside">
                    {auditReport.tacticalAdjustments.map((adj, i) => (
                      <li key={i}>{adj}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Full Text Analysis */}
              <div className="bg-surface/80 p-4 rounded-lg border border-border/70 text-slate-300 text-[11px] font-sans leading-relaxed whitespace-pre-line">
                {auditReport.detailedAiAnalysis}
              </div>

            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-400">
              <Brain className="w-10 h-10 text-slate-600 animate-pulse" />
              <p className="font-sans text-sm">Clique em "Rodar Nova Auditoria" para que a IA analise todos os pares e histórico.</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
