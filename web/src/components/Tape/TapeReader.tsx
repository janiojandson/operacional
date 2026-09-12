import React from 'react';
import { Trade } from '../../../shared/types';
import { Activity, ShieldAlert } from 'lucide-react';

interface TapeReaderProps {
  trades: Trade[];
}

export const TapeReader: React.FC<TapeReaderProps> = ({ trades }) => {
  return (
    <div className="flex flex-col h-full bg-surface/30 border-l border-border/70 select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/70 bg-surface/70">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold text-slate-200 tracking-wide uppercase">Tape (Time & Sales)</span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono">Agressores ao Vivo</span>
      </div>

      {/* Columns Header */}
      <div className="grid grid-cols-4 px-3 py-1 bg-background/40 border-b border-border/40 text-[10px] font-mono text-slate-400 font-semibold">
        <span>HORA</span>
        <span>PREÇO</span>
        <span className="text-right">QTD</span>
        <span className="text-right">TOTAL ($)</span>
      </div>

      {/* Trade Feed */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden font-mono text-[11px] divide-y divide-border/20">
        {trades.map((t) => {
          const date = new Date(t.timestamp);
          const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0').slice(0, 2)}`;
          const isBuy = t.side === 'buy';

          return (
            <div
              key={t.id}
              className={`grid grid-cols-4 px-3 py-1 items-center transition-colors ${
                t.isWhale 
                  ? (isBuy ? 'bg-buy/20 border-l-4 border-buy font-bold' : 'bg-sell/20 border-l-4 border-sell font-bold')
                  : 'hover:bg-surface-hover/50'
              }`}
            >
              <span className="text-slate-500 text-[10px]">{timeStr}</span>
              <span className={isBuy ? 'text-buy font-medium' : 'text-sell font-medium'}>
                {t.price.toLocaleString()}
              </span>
              <span className="text-right text-slate-300">
                {t.amount.toFixed(2)}
              </span>
              <span className="text-right text-slate-400 flex items-center justify-end space-x-1">
                {t.isWhale && <ShieldAlert className="w-3 h-3 text-amber-400 inline" />}
                <span>${(t.cost / 1000).toFixed(1)}k</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
