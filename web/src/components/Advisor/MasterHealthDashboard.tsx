// ==============================================================================
// 📁 web/src/components/Advisor/MasterHealthDashboard.tsx
// Dashboard dos 10 Blocos de Saúde Quantitativa & Governança local v3.0
// ==============================================================================

import React, { useState, useEffect } from 'react';
import {
  Activity,
  Brain,
  Cpu,
  ShieldCheck,
  RefreshCw,
  X,
  Lock,
  Unlock,
  ChevronRight,
  TrendingUp,
  AlertCircle
} from 'lucide-react';

interface BlockMetric {
  id: number;
  name: string;
  value: string;
  subtext: string;
  status: 'green' | 'yellow' | 'red';
  sparkline: number[];
}

interface MarketDecisionItem {
  decisionId: string;
  timestamp: number;
  action: string;
  symbol: string;
  executed: boolean;
  rejectionReason?: string;
  rationaleCode: string;
}

interface OverviewData {
  governanceMode: 'OFF' | 'SHADOW' | 'ACTIVE';
  latency: {
    p50: number;
    p95: number;
  };
  overrides: {
    used: number;
    ceiling: number;
  };
  attribution: {
    deltaR: number;
    attributedR: number;
    counterfactualR: number;
  };
  lastDecision: {
    decisionId: string;
    decisionType: string;
    symbol: string;
    rationaleCode: string;
  } | null;
  recentDecisions?: MarketDecisionItem[];
  breaker: boolean;
}

interface MasterHealthDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MasterHealthDashboard: React.FC<MasterHealthDashboardProps> = ({ isOpen, onClose }) => {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [blocks, setBlocks] = useState<BlockMetric[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [resOverview, resBlocks] = await Promise.all([
        fetch('/api/dashboard/overview'),
        fetch('/api/dashboard/blocks')
      ]);

      if (resOverview.ok) {
        const dataOverview = await resOverview.json();
        setOverview(dataOverview);
      }
      if (resBlocks.ok) {
        const dataBlocks = await resBlocks.json();
        setBlocks(dataBlocks.blocks || []);
      }
    } catch (err) {
      console.warn('Erro ao carregar Dashboard dos 10 Blocos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDashboardData();
      const interval = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        fetchDashboardData();
      }, 6000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 select-none">
      <div className="bg-[#0b1120] border border-slate-800/90 w-full max-w-6xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] font-mono text-slate-100 animate-fadeIn">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-800 bg-[#070b14]">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-cyan-900/30">
              <Activity className="w-5 h-5 text-cyan-200" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white tracking-wide">Dashboard dos 10 Blocos (Motor determinístico local)</h2>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                  POSTGRES EVENT STORE
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                Saúde quantitativa, latência medida e histórico de decisões locais.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={fetchDashboardData}
              disabled={loading}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
              <span>Atualizar</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Core Metrics Row (4 Cards) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-[#0a0f1d] border-b border-slate-800/80">
          <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl">
            <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold">
              <span>⏱ Latência Sistema 1</span>
              <span className={!overview || (overview.recentDecisions?.length || 0) === 0 ? 'text-slate-400' : (overview.latency.p50 > 1000 ? 'text-amber-400' : 'text-emerald-400')}>
                {!overview || (overview.recentDecisions?.length || 0) === 0 ? 'STANDBY' : (overview.latency.p50 > 1000 ? `${(overview.latency.p50 / 1000).toFixed(1)}s (Rede)` : 'sub-25ms')}
              </span>
            </div>
            <div className={`text-lg font-black mt-1 ${!overview || (overview.recentDecisions?.length || 0) === 0 ? 'text-cyan-400' : (overview.latency.p50 > 1000 ? 'text-amber-300' : 'text-white')}`}>
              {!overview || (overview.recentDecisions?.length || 0) === 0 ? 'STANDBY' : `${overview.latency.p50.toFixed(1)}ms`}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {!overview || (overview.recentDecisions?.length || 0) === 0 
                ? 'Aguardando 1º fluxo' 
                : `P95: ${overview.latency.p95.toFixed(1)}ms (${overview.latency.p50 > 1000 ? 'Aguardando malha' : 'Ping local'})`}
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl">
            <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold">
              <span>🔄 Perdões de Cooldown</span>
              <span className="text-cyan-400">Teto 3/dia</span>
            </div>
            <div className="text-lg font-black text-cyan-300 mt-1">
              {overview ? `${overview.overrides.used} / ${overview.overrides.ceiling}` : '0 / 3'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Usados na sessão atual
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl">
            <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold">
              <span>💰 Atribuição contrafactual histórica (24h)</span>
              <span className="text-emerald-400">ΔR Líquido</span>
            </div>
            <div className={`text-lg font-black mt-1 ${Number(overview?.attribution.deltaR ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {overview ? `${overview.attribution.deltaR >= 0 ? '+' : ''}${overview.attribution.deltaR.toFixed(2)}R` : '+0.00R'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Attr: +{overview?.attribution.attributedR.toFixed(1) || '0.0'}R | Counter: +{overview?.attribution.counterfactualR.toFixed(1) || '0.0'}R
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl">
            <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold">
              <span>🧠 Última decisão</span>
              <span className="text-purple-400">Regras locais</span>
            </div>
            <div className="text-sm font-bold text-white mt-1 truncate">
              {overview?.lastDecision ? `${overview.lastDecision.decisionType} (${overview.lastDecision.symbol})` : 'Aguardando fluxo'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 truncate">
              {overview?.lastDecision?.rationaleCode || 'Nenhum gatilho no momento'}
            </div>
          </div>
        </div>

        {/* 10 Blocks Grid */}
        <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>Os 10 Blocos de Saúde Quantitativa & Governança Constitucional</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {blocks.map((b) => (
              <div
                key={b.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 p-3 rounded-xl transition-all relative overflow-hidden group shadow-sm"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-slate-400 font-mono">
                    {b.id}. {b.name}
                  </span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      b.status === 'green'
                        ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                        : b.status === 'yellow'
                        ? 'bg-amber-400 shadow-sm shadow-amber-400/50'
                        : 'bg-rose-400 shadow-sm shadow-rose-400/50'
                    }`}
                  />
                </div>
                <div className="text-base font-black text-white group-hover:text-cyan-300 transition-colors">
                  {b.value}
                </div>
                <div className="text-[10px] text-slate-400 mt-1 truncate">
                  {b.subtext}
                </div>
              </div>
            ))}
          </div>

          {/* Histórico em Tempo Real de decisões locais */}
          <div className="mt-5 bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-400" />
                <span>Histórico de decisões do motor local</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {overview?.recentDecisions?.length || 0} eventos registrados
              </span>
            </div>

            <div className="overflow-x-auto max-h-48 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px] uppercase">
                    <th className="py-1.5 px-2">Horário</th>
                    <th className="py-1.5 px-2">Par</th>
                    <th className="py-1.5 px-2">Ação Decidida</th>
                    <th className="py-1.5 px-2">Status</th>
                    <th className="py-1.5 px-2">Racional Institucional</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {overview?.recentDecisions && overview.recentDecisions.length > 0 ? (
                    overview.recentDecisions.slice(0, 10).map((dec, idx) => {
                      const isAuth = dec.action === 'AUTHORIZE';
                      const isVeto = dec.action === 'VETO';
                      return (
                        <tr key={dec.decisionId || idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-1.5 px-2 text-slate-400 whitespace-nowrap">
                            {new Date(dec.timestamp).toLocaleTimeString('pt-BR')}
                          </td>
                          <td className="py-1.5 px-2 font-bold text-white whitespace-nowrap">
                            {dec.symbol}
                          </td>
                          <td className="py-1.5 px-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isAuth
                                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30'
                                  : isVeto
                                  ? 'bg-rose-950/60 text-rose-400 border border-rose-500/30'
                                  : 'bg-amber-950/60 text-amber-400 border border-amber-500/30'
                              }`}
                            >
                              {dec.action}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 whitespace-nowrap">
                            {dec.executed ? (
                              <span className="text-emerald-400 font-bold">EXECUTADO ✅</span>
                            ) : (
                              <span className="text-slate-400">CALIBRAÇÃO 🛡️</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-slate-300 truncate max-w-xs" title={dec.rejectionReason || dec.rationaleCode}>
                            {dec.rejectionReason ? (
                              <span className="text-rose-400">{dec.rejectionReason}</span>
                            ) : (
                              <span>{dec.rationaleCode}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-500 italic">
                        Nenhuma proposta registrada ainda nesta sessão. Aguardando gatilho de microestrutura...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Attribution & Cascata de Poderes */}
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900/70 border border-slate-800 p-3.5 rounded-xl">
              <span className="text-xs font-bold text-slate-300 block mb-2.5 flex items-center justify-between">
                <span>Cascata de Liberação de Poderes (Gate N_eff ≥ 50)</span>
                <span className="text-[10px] text-amber-400">Calibração Ativa</span>
              </span>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-white font-semibold">1º VETO GATEKEEPER</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/30">ATIVO</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-white font-semibold">2º PERDÃO DE COOLDOWN</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/30">ATIVO</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-white font-semibold">3º MICRO-STOP ATRÁS DO BOOK</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/30">ATIVO</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-white font-semibold">4º RUNNER 100% COM TRAILING</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/30">ATIVO</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800/80 opacity-60">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-slate-400 font-semibold">5º PIRAMIDAGEM A FAVOR</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-500 border border-slate-800">TRAVADO</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800/80 opacity-60">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-slate-400 font-semibold">6º POTÊNCIA DINÂMICA (ÚLTIMO)</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-500 border border-slate-800">TRAVADO</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 p-3.5 rounded-xl flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-300 block mb-2">Linhas Vermelhas da Constituição (Imutáveis)</span>
                <ul className="text-[11px] space-y-1.5 text-slate-300">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span><b>1. Martingale Zero:</b> Proibido preço médio para trás.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span><b>2. Teto de Risco:</b> Perda potencial máxima nunca &gt; 1.5% da banca.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span><b>3. Stop a Favor:</b> Proibido empurrar stop contra a posição.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span><b>4. Circuit Breaker:</b> Trava diária em -3.0R de rebaixamento.</span>
                  </li>
                </ul>
              </div>

              <div className="mt-4 p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-500/30 text-[11px] text-cyan-200">
                💡 <b>Dono Único do Stop:</b> O motor local avalia fluxo e risco, mantém as proteções e e grava de forma imutável no PostgreSQL.
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
