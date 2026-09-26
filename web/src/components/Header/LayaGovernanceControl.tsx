import React, { useState, useEffect } from 'react';
import { Brain, ShieldAlert, Cpu } from 'lucide-react';

export type LayaMode = 'OFF' | 'SHADOW' | 'ACTIVE';

export interface LayaStatusResponse {
  mode: LayaMode;
  metrics: {
    latencyP50: number;
    latencyP95: number;
    sessionPardonsUsed: number;
    maxSessionPardons: number;
    totalDecisions: number;
    counterfactualPnL: number;
  };
  recentDecisions: Array<{
    decisionId: string;
    timestamp: number;
    action: string;
    symbol: string;
    executed: boolean;
    rejectionReason?: string;
    rationaleCode: string;
  }>;
}

export interface LayaGovernanceControlProps {
  onModeChange?: (mode: LayaMode) => void;
}

export const LayaGovernanceControl: React.FC<LayaGovernanceControlProps> = ({ onModeChange }) => {
  const [status, setStatus] = useState<LayaStatusResponse | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchStatus = async () => {
    try {
      const token = localStorage.getItem('mfp_token') || '';
      const res = await fetch('/api/admin/laya/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: LayaStatusResponse = await res.json();
      setStatus(data);
      setIsOffline(false);
    } catch {
      setIsOffline(true);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleModeChange = async (newMode: LayaMode) => {
    setIsUpdating(true);
    try {
      const token = localStorage.getItem('mfp_token') || '';
      const res = await fetch('/api/admin/laya/mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ mode: newMode })
      });
      if (res.ok) {
        await fetchStatus();
        onModeChange?.(newMode);
      }
    } catch (err) {
      console.error('Falha ao alternar modo Laya:', err);
    } finally {
      setIsUpdating(false);
      setIsDropdownOpen(false);
    }
  };

  const currentMode = status?.mode || 'OFF';

  // Badge Visual
  let badgeClasses = 'bg-slate-900/90 border-slate-700/80 text-slate-400 hover:bg-slate-800';
  let badgeLabel = 'Laya: DESATIVADA (OFF)';
  let dotClass = 'bg-slate-500';

  if (isOffline) {
    badgeClasses = 'bg-rose-950/40 border-rose-500/50 text-rose-300 hover:bg-rose-900/60 shadow-sm shadow-rose-950/20';
    badgeLabel = 'Laya: LOCAL (OFFLINE)';
    dotClass = 'bg-rose-500 animate-pulse';
  } else if (currentMode === 'ACTIVE') {
    badgeClasses = 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/50 shadow-sm shadow-emerald-950/20';
    badgeLabel = 'Laya: ATIVA (PRODUÇÃO 🧠)';
    dotClass = 'bg-emerald-400 animate-pulse';
  } else if (currentMode === 'SHADOW') {
    badgeClasses = 'bg-purple-950/50 border-purple-500/60 text-purple-300 hover:bg-purple-900/60 shadow-sm shadow-purple-950/20';
    badgeLabel = 'Laya: SHADOW (CALIBRAÇÃO 🟡)';
    dotClass = 'bg-amber-400 animate-pulse';
  }

  const toggleNextMode = () => {
    // Ciclo de clique direto: OFF -> SHADOW -> ACTIVE -> OFF
    if (currentMode === 'OFF') handleModeChange('SHADOW');
    else if (currentMode === 'SHADOW') handleModeChange('ACTIVE');
    else handleModeChange('OFF');
  };

  return (
    <div className="relative inline-flex items-center">
      {/* Botão de Alternância Direta (Segue padrão de Trailing Stop e Shadow Mode) */}
      <button
        onClick={toggleNextMode}
        disabled={isUpdating}
        title="Clique para alternar: OFF -> SHADOW -> ACTIVE"
        className={`flex items-center gap-2 px-3 py-1 rounded-lg border font-mono text-xs font-semibold transition-all ${badgeClasses}`}
      >
        <Brain className={`w-3.5 h-3.5 ${currentMode === 'ACTIVE' ? 'text-emerald-400' : currentMode === 'SHADOW' ? 'text-amber-400' : 'text-slate-400'}`} />
        <span className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${dotClass}`} />
          <span>{badgeLabel}</span>
        </span>
      </button>

      {/* Botão de Informações / Métricas da Laya */}
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        title="Ver métricas da Laya (Latência, Perdões e P&L)"
        className="ml-1 px-1.5 py-1 rounded border border-slate-700/80 bg-slate-900/90 text-slate-400 hover:text-slate-200 text-xs font-mono"
      >
        ⚙️
      </button>

      {isDropdownOpen && (
        <div className="absolute left-0 top-full mt-2 w-72 rounded-lg shadow-2xl bg-zinc-950 border border-zinc-750 p-3 z-[100] text-xs font-mono text-zinc-200">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800 mb-2.5">
            <span className="font-bold flex items-center gap-1.5 text-zinc-100">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              Governança Laya Sistema 1
            </span>
            <span className="text-[10px] text-zinc-400">{status?.metrics?.totalDecisions || 0} decisões</span>
          </div>

          {/* 4 Métricas Visuais */}
          {status && (
            <div className="grid grid-cols-2 gap-1.5 bg-zinc-900/80 p-2.5 rounded border border-zinc-800 text-[11px] mb-3">
              <div>
                <span className="text-zinc-500 block text-[9px] uppercase">Latência</span>
                <span className="text-zinc-200 font-semibold">
                  p50: {status.metrics.latencyP50}ms | p95: {status.metrics.latencyP95}ms
                </span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[9px] uppercase">Perdões</span>
                <span className="text-amber-400 font-semibold">
                  {status.metrics.sessionPardonsUsed} / {status.metrics.maxSessionPardons} usados
                </span>
              </div>
              <div className="col-span-2 pt-1.5 border-t border-zinc-800 flex justify-between">
                <span className="text-zinc-400 text-[10px]">P&L Contrafactual:</span>
                <span className={`font-bold ${status.metrics.counterfactualPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {status.metrics.counterfactualPnL >= 0 ? `+${status.metrics.counterfactualPnL}R` : `${status.metrics.counterfactualPnL}R`}
                </span>
              </div>
            </div>
          )}

          {/* Seletor Explícito */}
          <div className="space-y-1">
            <div className="text-[10px] text-zinc-400 uppercase font-semibold mb-1">Seletor de Modo:</div>
            <button
              onClick={() => handleModeChange('ACTIVE')}
              className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between transition-colors ${currentMode === 'ACTIVE' ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 font-bold' : 'hover:bg-zinc-900 text-zinc-400'}`}
            >
              <span>ACTIVE (Em produção)</span>
              <Brain className="w-3 h-3 text-emerald-400" />
            </button>
            <button
              onClick={() => handleModeChange('SHADOW')}
              className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between transition-colors ${currentMode === 'SHADOW' ? 'bg-purple-950/80 border border-purple-500/50 text-purple-300 font-bold' : 'hover:bg-zinc-900 text-zinc-400'}`}
            >
              <span>SHADOW (Calibração)</span>
              <span className="text-amber-400">🟡</span>
            </button>
            <button
              onClick={() => handleModeChange('OFF')}
              className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between transition-colors ${currentMode === 'OFF' ? 'bg-zinc-900 border border-zinc-700 text-zinc-200 font-bold' : 'hover:bg-zinc-900 text-zinc-500'}`}
            >
              <span>OFF (Mecânico Puro)</span>
              <ShieldAlert className="w-3 h-3 text-zinc-500" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
