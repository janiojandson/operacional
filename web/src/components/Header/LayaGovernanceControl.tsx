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

export const LayaGovernanceControl: React.FC = () => {
  const [status, setStatus] = useState<LayaStatusResponse | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/admin/laya/status');
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
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleModeChange = async (newMode: LayaMode) => {
    setIsUpdating(true);
    try {
      const res = await fetch('/api/admin/laya/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode })
      });
      if (res.ok) {
        await fetchStatus();
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
  let badgeClasses = 'bg-gray-700/40 text-gray-300 border-gray-600';
  let badgeLabel = 'Laya: OFF';
  let dotClass = 'bg-gray-400';

  if (isOffline) {
    badgeClasses = 'bg-red-950/60 text-red-400 border-red-700 animate-pulse';
    badgeLabel = 'Laya: OFFLINE (FALLBACK)';
    dotClass = 'bg-red-500';
  } else if (currentMode === 'ACTIVE') {
    badgeClasses = 'bg-emerald-950/60 text-emerald-400 border-emerald-600 shadow-sm shadow-emerald-500/20';
    badgeLabel = 'Laya: ACTIVE 🧠';
    dotClass = 'bg-emerald-400 animate-ping';
  } else if (currentMode === 'SHADOW') {
    badgeClasses = 'bg-amber-950/60 text-amber-400 border-amber-600 animate-pulse shadow-sm shadow-amber-500/20';
    badgeLabel = 'Laya: SHADOW 🟡';
    dotClass = 'bg-amber-400';
  }

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        disabled={isUpdating}
        title="Controle de Governança Laya Sistema 1"
        className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded border text-xs font-bold font-mono transition-all select-none ${badgeClasses}`}
      >
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        <span>{badgeLabel}</span>
      </button>

      {isDropdownOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-md shadow-2xl bg-zinc-900 border border-zinc-700 p-2.5 z-50 text-xs font-mono text-zinc-200">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800 mb-2">
            <span className="font-bold flex items-center gap-1.5 text-zinc-100">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              Governança Laya
            </span>
            <span className="text-[10px] text-zinc-400">{status?.metrics?.totalDecisions || 0} decisões</span>
          </div>

          {/* 4 Métricas Visuais */}
          {status && (
            <div className="grid grid-cols-2 gap-1.5 bg-zinc-950/80 p-2 rounded border border-zinc-800 text-[11px] mb-2.5">
              <div>
                <span className="text-zinc-500 block text-[9px] uppercase">Latência</span>
                <span className="text-zinc-300 font-semibold">
                  p50: {status.metrics.latencyP50}ms | p95: {status.metrics.latencyP95}ms
                </span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[9px] uppercase">Perdões</span>
                <span className="text-amber-400 font-semibold">
                  {status.metrics.sessionPardonsUsed} / {status.metrics.maxSessionPardons} usados
                </span>
              </div>
              <div className="col-span-2 pt-1 border-t border-zinc-900 flex justify-between">
                <span className="text-zinc-500 text-[10px]">P&L Contrafactual:</span>
                <span className={`font-bold ${status.metrics.counterfactualPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {status.metrics.counterfactualPnL >= 0 ? `+${status.metrics.counterfactualPnL}R` : `${status.metrics.counterfactualPnL}R`}
                </span>
              </div>
            </div>
          )}

          {/* Seletor de Modo */}
          <div className="space-y-1">
            <button
              onClick={() => handleModeChange('ACTIVE')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between transition-colors ${currentMode === 'ACTIVE' ? 'bg-emerald-900/50 text-emerald-300 font-bold' : 'hover:bg-zinc-800 text-zinc-400'}`}
            >
              <span>ACTIVE (Em produção)</span>
              <Brain className="w-3 h-3 text-emerald-400" />
            </button>
            <button
              onClick={() => handleModeChange('SHADOW')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between transition-colors ${currentMode === 'SHADOW' ? 'bg-amber-900/50 text-amber-300 font-bold' : 'hover:bg-zinc-800 text-zinc-400'}`}
            >
              <span>SHADOW (Calibração)</span>
              <span className="text-amber-400">🟡</span>
            </button>
            <button
              onClick={() => handleModeChange('OFF')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between transition-colors ${currentMode === 'OFF' ? 'bg-zinc-800 text-zinc-200 font-bold' : 'hover:bg-zinc-800 text-zinc-500'}`}
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
