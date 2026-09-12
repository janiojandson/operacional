import React from 'react';
import { FlowSignal } from '../../../shared/types';
import { Bell, ShieldAlert, Zap, Scale } from 'lucide-react';

interface SignalsFeedProps {
  signals: FlowSignal[];
}

export const SignalsFeed: React.FC<SignalsFeedProps> = ({ signals }) => {
  return (
    <div className="flex flex-col h-full bg-surface/20 border-t border-border/70 select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/70 bg-surface/60">
        <div className="flex items-center space-x-2">
          <Bell className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-semibold text-slate-200 tracking-wide uppercase">
            Radar de Fluxo Institucional (Alertas em Tempo Real)
          </span>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          {signals.length} sinais capturados
        </span>
      </div>

      {/* Signals List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 font-mono text-xs">
        {signals.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500 text-xs">
            Monitorando fluxo de ordens e absorções em tempo real...
          </div>
        ) : (
          signals.map((signal) => {
            const timeStr = new Date(signal.timestamp).toLocaleTimeString();
            let icon = <Zap className="w-4 h-4 text-accent" />;
            let badgeColor = 'bg-accent/20 text-accent border-accent/30';

            if (signal.type === 'ABSORPTION_BUY' || signal.type === 'ABSORPTION_SELL') {
              icon = <ShieldAlert className="w-4 h-4 text-emerald-400" />;
              badgeColor = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            } else if (signal.type === 'BOOK_IMBALANCE') {
              icon = <Scale className="w-4 h-4 text-amber-400" />;
              badgeColor = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
            } else if (signal.type === 'WHALE_AGGRESSION') {
              icon = <Zap className="w-4 h-4 text-purple-400" />;
              badgeColor = 'bg-purple-500/20 text-purple-400 border-purple-500/30';
            }

            return (
              <div
                key={signal.id}
                className="flex items-start justify-between p-2.5 rounded bg-surface/80 border border-border/60 hover:border-slate-600 transition-colors shadow-sm"
              >
                <div className="flex items-start space-x-3">
                  <div className="mt-0.5">{icon}</div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white tracking-wide">{signal.symbol}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${badgeColor}`}>
                        {signal.type.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-slate-300 text-[11px] mt-1 font-sans">{signal.message}</p>
                  </div>
                </div>
                <div className="text-right text-[10px] text-slate-400">
                  <div>{timeStr}</div>
                  <div className="text-slate-300 font-semibold mt-1">@ {signal.price.toLocaleString()}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
