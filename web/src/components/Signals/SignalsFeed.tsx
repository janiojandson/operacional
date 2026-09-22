import React, { useState } from 'react';
import { FlowSignal } from '../../../../shared/types';
import { Bell, ShieldAlert, Zap, Scale, Trash2 } from 'lucide-react';

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
    <div className="flex flex-col h-full bg-bg-panel select-none overflow-hidden">
      {/* Header com Botão Limpar Sinais */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-panel bg-bg-panel shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <Bell className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-[11px] font-bold text-text-primary tracking-wide uppercase truncate">
            Radar de Fluxo Institucional
          </span>
        </div>
        
        <div className="flex items-center space-x-2 shrink-0">
          <span className="text-[10px] text-text-muted font-mono bg-bg-app px-2 py-0.5 rounded border border-border-panel">
            {visibleSignals.length} ativos
          </span>
          <button
            onClick={handleClearSignals}
            title="Limpar Sinais do Radar (Vassoura / Reset Visual)"
            className="p-1 rounded text-text-muted hover:text-trade-red hover:bg-surface-hover border border-transparent hover:border-border-panel transition-all flex items-center space-x-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="text-[10px] font-mono hidden xl:inline">Limpar</span>
          </button>
        </div>
      </div>

      {/* Signals List com Scroll Suave e Fade */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 font-mono text-xs no-scrollbar">
        {visibleSignals.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-text-muted text-xs space-y-1 py-6">
            <Zap className="w-5 h-5 text-text-muted/40 animate-pulse" />
            <span>Monitorando fluxo de ordens e absorções institucionais...</span>
          </div>
        ) : (
          visibleSignals.map((signal) => {
            const timeStr = new Date(signal.timestamp).toLocaleTimeString();
            let icon = <Zap className="w-3.5 h-3.5 text-accent shrink-0" />;
            let badgeColor = 'bg-accent/20 text-accent border-accent/30';

            if (signal.type === 'ABSORPTION_BUY' || signal.type === 'ABSORPTION_SELL') {
              icon = <ShieldAlert className="w-3.5 h-3.5 text-trade-green shrink-0" />;
              badgeColor = 'bg-trade-green/15 text-trade-green border-trade-green/30';
            } else if (signal.type === 'BOOK_IMBALANCE') {
              icon = <Scale className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
              badgeColor = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
            } else if (signal.type === 'WHALE_AGGRESSION') {
              icon = <Zap className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
              badgeColor = 'bg-purple-500/15 text-purple-400 border-purple-500/30';
            }

            return (
              <div
                key={signal.id}
                className="flex items-start justify-between p-2 rounded-md bg-bg-app/70 border border-border-panel hover:border-text-muted/40 transition-all shadow-sm"
              >
                <div className="flex items-start space-x-2 min-w-0 flex-1 pr-2">
                  <div className="mt-0.5">{icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                      <span className="font-bold text-text-primary tracking-wide text-xs">{signal.symbol}</span>
                      <span className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold tracking-wider uppercase ${badgeColor}`}>
                        {signal.type.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-text-muted text-[11px] mt-1 font-sans leading-relaxed break-words">
                      {signal.message}
                    </p>
                  </div>
                </div>
                <div className="text-right text-[10px] text-text-muted shrink-0 font-mono">
                  <div>{timeStr}</div>
                  <div className="text-text-primary font-bold mt-1">@ ${signal.price.toLocaleString()}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
