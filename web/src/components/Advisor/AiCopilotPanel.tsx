import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../contexts/AuthContext';
import { RefreshCw, Bot, ShieldCheck, Lock, Unlock, Activity } from 'lucide-react';

interface PairInfo {
  symbol: string;
  active: boolean;
  regime?: string;
  temperature?: string;
  powerMultiplier?: number;
}

interface AiStatus {
  enabled: boolean;
  configured: boolean;
  model: string;
  intervalMs: number;
  powerRange: number[];
  lockout: boolean;
}

interface Decision {
  id: number;
  ts: string;
  source: string;
  ok: boolean;
  raw: string | null;
  actions: string | null;
  applied: string | null;
  rejected: string | null;
  error: string | null;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export default function AiCopilotPanel() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [pairs, setPairs] = useState<PairInfo[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, d] = await Promise.all([
        authFetch('/api/ai-copilot/status'),
        authFetch('/api/pairs/list'),
        authFetch('/api/ai-copilot/decisions?limit=30'),
      ]);
      if (s.ok) setStatus(await s.json());
      if (p.ok) { const pd = await p.json(); setPairs(Array.isArray(pd.pairs) ? pd.pairs : []); }
      if (d.ok) { const dd = await d.json(); setDecisions(Array.isArray(dd.decisions) ? dd.decisions : []); }
    } catch (e) {
      console.error('Erro ao carregar painel IA:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 30000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const activeCount = pairs.filter((p) => p.active).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">IA Controladora & Pares (Observação)</h2>
          <p className="text-xs text-slate-400 mt-0.5">Somente leitura — as IAs seguem operando de forma autônoma.</p>
        </div>
        <button onClick={fetchAll} className="p-2 rounded-xl text-slate-400 hover:text-white bg-surface border border-border/60">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Status da IA */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-surface border border-border/60 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-mono uppercase">IA de Postura</span>
            <Bot className="w-4 h-4 text-accent" />
          </div>
          <div className={`text-xl font-black ${status?.configured ? 'text-emerald-400' : 'text-rose-400'}`}>
            {status?.configured ? 'ATIVA' : 'OFF'}
          </div>
          <div className="text-xs text-slate-500 mt-1">modelo {status?.model}</div>
        </div>

        <div className="bg-surface border border-border/60 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-mono uppercase">Cadência</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xl font-black text-white">{Math.round((status?.intervalMs || 0) / 60000)} min</div>
          <div className="text-xs text-slate-500 mt-1">potência {status?.powerRange?.[0]}–{status?.powerRange?.[1]}×</div>
        </div>

        <div className="bg-surface border border-border/60 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-mono uppercase">Circuit Breaker</span>
            {status?.lockout ? <Lock className="w-4 h-4 text-rose-400" /> : <Unlock className="w-4 h-4 text-emerald-400" />}
          </div>
          <div className={`text-xl font-black ${status?.lockout ? 'text-rose-400' : 'text-emerald-400'}`}>
            {status?.lockout ? 'LOCKOUT' : 'LIBERADO'}
          </div>
          <div className="text-xs text-slate-500 mt-1">lockout −3R/dia + safe-halt</div>
        </div>

        <div className="bg-surface border border-border/60 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-mono uppercase">Pares Ativos</span>
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-black text-white">{activeCount}</div>
          <div className="text-xs text-slate-500 mt-1">de {pairs.length} monitorados</div>
        </div>
      </div>

      {/* Pares */}
      <div className="bg-surface border border-border/60 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border/60">
          <span className="text-sm font-bold text-white">Pares Monitorados</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-4">
          {pairs.map((p) => (
            <div key={p.symbol} className="flex items-center justify-between px-3 py-2 rounded-xl bg-background/50 border border-border/40">
              <div className="flex items-center space-x-2">
                <span className={`w-2 h-2 rounded-full ${p.active ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                <span className="text-sm font-semibold text-white">{p.symbol}</span>
              </div>
              <div className="text-[10px] font-mono text-slate-400 text-right">
                <div>{p.temperature}</div>
                <div>{p.powerMultiplier}× · {p.regime}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Decisões da IA */}
      <div className="bg-surface border border-border/60 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border/60">
          <span className="text-sm font-bold text-white">Decisões da IA (últimas {decisions.length})</span>
        </div>
        <div className="divide-y divide-border/30">
          {decisions.length === 0 && (
            <div className="px-5 py-6 text-center text-slate-500 text-sm font-mono">Nenhuma decisão registrada ainda.</div>
          )}
          {decisions.map((d) => {
            const applied = safeParse<any[]>(d.applied) || [];
            const rejected = safeParse<any[]>(d.rejected) || [];
            return (
              <div key={d.id} className="px-5 py-3 hover:bg-surface-hover/20 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono text-slate-500">{new Date(d.ts).toLocaleString('pt-BR')}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${d.source === 'SCHEDULER' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-violet-500/20 text-violet-300'}`}>{d.source}</span>
                  </div>
                  <span className={`text-[10px] font-bold ${d.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{d.ok ? 'OK' : (d.error || 'ERRO')}</span>
                </div>
                {applied.length > 0 && (
                  <div className="text-xs text-emerald-300 font-mono">✓ {applied.map((a: any) => a?.detail || JSON.stringify(a)).join(' · ')}</div>
                )}
                {rejected.length > 0 && (
                  <div className="text-xs text-amber-300 font-mono">✗ {rejected.map((r: any) => `${r?.reason || 'rejeitada'}`).join(' · ')}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
