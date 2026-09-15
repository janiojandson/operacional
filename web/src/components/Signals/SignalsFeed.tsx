import React, { useState } from 'react';
import { FlowSignal } from '../../../shared/types';
import { Bell, ShieldAlert, Zap, Scale, Trash2, CheckCircle2 } from 'lucide-react';

interface SignalsFeedProps {
  signals: FlowSignal[];
}

export const SignalsFeed: React.FC<SignalsFeedProps> = ({ signals }) => {
  const [clearedBeforeTimestamp, setClearedBeforeTimestamp] = useState<number>(0);

  const visibleSignals = signals.filter(s => s.timestamp > clearedBeforeTimestamp);

  const handleClearSignals = () => {
    setClearedBeforeTimestamp(Date.now());
  };

  return (
    <div className="flex flex-col h-full bg-surface/25 border-t border-border/70 select-none overflow-hidden">
      {/* Header com Botão Limpar Sinais */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-border/70 bg-surface/70 shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <Bell className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-xs font-bold text-slate-200 tracking-wide uppercase truncate">
            Radar de Fluxo Institucional
          </span>
        </div>
        
        <div className="flex items-center space-x-2 shrink-0">
          <span className="text-[10px] text-slate-400 font-mono bg-background/60 px-2 py-0.5 rounded border border-border/50">
            {visibleSignals.length} ativos
          </span>
          <button
            onClick={handleClearSignals}
            title="Limpar Sinais do Radar (Vassoura / Reset Visual)"
            className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-surface border border-transparent hover:border-border/60 transition-all flex items-center space-x-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="text-[10px] font-mono hidden xl:inline">Limpar</span>
          </button>
        </div>
      </div>

      {/* Signals List com Scroll Suave e Fade */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 font-mono text-xs no-scrollbar">
        {visibleSignals.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs space-y-1 py-6">
            <Zap className="w-5 h-5 text-slate-600 animate-pulse" />
            <span>Monitorando fluxo de ordens e absorções institucionais...</span>
          </div>
        ) : (
          visibleSignals.map((signal) => {
            const timeStr = new Date(signal.timestamp).toLocaleTimeString();
            let icon = <Zap className="w-3.5 h-3.5 text-accent shrink-0" />;
            let badgeColor = 'bg-accent/20 text-accent border-accent/30';

            if (signal.type === 'ABSORPTION_BUY' || signal.type === 'ABSORPTION_SELL') {
              icon = <ShieldAlert className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
              badgeColor = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            } else if (signal.type === 'BOOK_IMBALANCE') {
              icon = <Scale className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
              badgeColor = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
            } else if (signal.type === 'WHALE_AGGRESSION') {
              icon = <Zap className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
              badgeColor = 'bg-purple-500/20 text-purple-400 border-purple-500/30';
            }

            return (
              <div
                key={signal.id}
                className="flex items-start justify-between p-2.5 rounded-xl bg-surface/85 border border-border/60 hover:border-slate-500 transition-all shadow-sm animate-in fade-in slide-in-from-top-1 duration-200"
              >
                <div className="flex items-start space-x-2.5 min-w-0 flex-1 pr-2">
                  <div className="mt-0.5">{icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                      <span className="font-bold text-white tracking-wide text-xs">{signal.symbol}</span>
                      <span className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold tracking-wider uppercase ${badgeColor}`}>
                        {signal.type.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-slate-300 text-[11px] mt-1 font-sans leading-relaxed break-words">
                      {signal.message}
                    </p>
                  </div>
                </div>
                <div className="text-right text-[10px] text-slate-400 shrink-0 font-mono">
                  <div>{timeStr}</div>
                  <div className="text-slate-200 font-bold mt-1">@ ${signal.price.toLocaleString()}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
