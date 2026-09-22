import React from 'react';
import { Trade } from '../../../../shared/types';
import { Activity, ShieldAlert } from 'lucide-react';

interface TapeReaderProps {
  trades: Trade[];
}

export const TapeReader: React.FC<TapeReaderProps> = ({ trades }) => {
  return (
    <div className="flex flex-col h-full bg-bg-panel select-none font-mono">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-panel bg-bg-panel">
        <div className="flex items-center space-x-2">
          <Activity className="w-3.5 h-3.5 text-trade-green" />
          <span className="text-[11px] font-bold text-text-primary tracking-wide uppercase">Tape (Time & Sales)</span>
        </div>
        <span className="text-[10px] text-text-muted font-mono">Agressores ao Vivo</span>
      </div>

      {/* Columns Header */}
      <div className="grid grid-cols-4 px-3 py-1 bg-bg-app border-b border-border-panel text-[10px] font-mono text-text-muted font-semibold">
        <span>HORA</span>
        <span>PREÇO</span>
        <span className="text-right">QTD</span>
        <span className="text-right">TOTAL ($)</span>
      </div>

      {/* Trade Feed */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden font-mono text-[11px] divide-y divide-border-panel/30">
        {trades.map((t) => {
          const date = new Date(t.timestamp);
          const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0').slice(0, 2)}`;
          const isBuy = t.side === 'buy';

          return (
            <div
              key={t.id}
              className={`grid grid-cols-4 px-3 py-1 items-center transition-colors ${
                t.isWhale 
                  ? (isBuy ? 'bg-trade-green/15 border-l-4 border-trade-green font-bold' : 'bg-trade-red/15 border-l-4 border-trade-red font-bold')
                  : 'hover:bg-surface-hover/50'
              }`}
            >
              <span className="text-text-muted text-[10px]">{timeStr}</span>
              <span className={isBuy ? 'text-trade-green font-semibold' : 'text-trade-red font-semibold'}>
                {t.price.toLocaleString()}
              </span>
              <span className="text-right text-text-primary">
                {t.amount.toFixed(2)}
              </span>
              <span className="text-right text-text-muted flex items-center justify-end space-x-1">
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
