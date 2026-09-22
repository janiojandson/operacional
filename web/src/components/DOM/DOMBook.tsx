import React from 'react';
import { OrderBookData } from '../../../../shared/types';
import { Layers } from 'lucide-react';

interface DOMBookProps {
  book: OrderBookData | null;
}

export const DOMBook: React.FC<DOMBookProps> = ({ book }) => {
  if (!book) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted font-mono text-xs bg-bg-panel">
        Carregando Book L2...
      </div>
    );
  }

  const maxDepthTotal = Math.max(book.bidDepthTotal, book.askDepthTotal, 1);
  const asksReversed = [...book.asks.slice(0, 12)].reverse();
  const bids = book.bids.slice(0, 12);

  return (
    <div className="flex flex-col h-full bg-bg-panel select-none font-mono">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-panel bg-bg-panel">
        <div className="flex items-center space-x-2">
          <Layers className="w-3.5 h-3.5 text-accent" />
          <span className="text-[11px] font-bold text-text-primary tracking-wide uppercase">DOM — Book L2</span>
        </div>
        <div className="text-[10px] font-mono text-text-muted">
          Spread: <span className="text-text-primary font-semibold">{book.spread}</span>
        </div>
      </div>

      {/* Book Ratio Imbalance Bar */}
      <div className="px-3 py-1 bg-bg-app border-b border-border-panel flex flex-col gap-1">
        <div className="flex justify-between text-[10px] font-mono">
          <span className="text-trade-green font-semibold">COMPRA: {(book.bidDepthTotal).toLocaleString()}</span>
          <span className="text-trade-red font-semibold">VENDA: {(book.askDepthTotal).toLocaleString()}</span>
        </div>
        <div className="w-full h-1.5 bg-border-panel/40 rounded-full overflow-hidden flex">
          <div 
            className="bg-trade-green h-full transition-all duration-300"
            style={{ width: `${(book.bidDepthTotal / (book.bidDepthTotal + book.askDepthTotal)) * 100}%` }}
          />
          <div 
            className="bg-trade-red h-full transition-all duration-300"
            style={{ width: `${(book.askDepthTotal / (book.bidDepthTotal + book.askDepthTotal)) * 100}%` }}
          />
        </div>
      </div>

      {/* OrderBook Levels */}
      <div className="flex-1 flex flex-col justify-between overflow-hidden text-[11px] font-mono">
        {/* Asks (Vendas) */}
        <div className="flex flex-col justify-end flex-1 overflow-hidden">
          {asksReversed.map((ask, idx) => {
            const depthPercent = Math.min(100, (ask.total / maxDepthTotal) * 100);
            return (
              <div key={`ask-${idx}`} className="relative flex justify-between items-center px-3 py-[2px] hover:bg-surface-hover/80 cursor-pointer">
                {/* Background Depth Bar */}
                <div 
                  className="absolute right-0 top-0 bottom-0 bg-trade-red/15 pointer-events-none transition-all duration-150"
                  style={{ width: `${depthPercent}%` }}
                />
                <span className="text-trade-red font-semibold z-10">{ask.price.toLocaleString()}</span>
                <span className="text-text-primary z-10">{ask.amount.toFixed(2)}</span>
                <span className="text-text-muted text-[10px] z-10">{ask.total.toFixed(1)}</span>
              </div>
            );
          })}
        </div>

        {/* Current Mid Spread Divider */}
        <div className="py-1 px-3 bg-bg-app border-y border-border-panel flex items-center justify-between text-xs font-bold text-text-primary shadow-inner">
          <span className="text-text-muted font-normal text-[10px]">PREÇO ATUAL</span>
          <span className="font-mono text-sm tracking-wider text-text-primary">
            {book.bids[0]?.price.toLocaleString()}
          </span>
          <span className="text-accent text-[10px]">LIVE</span>
        </div>

        {/* Bids (Compras) */}
        <div className="flex flex-col justify-start flex-1 overflow-hidden">
          {bids.map((bid: { price: number; amount: number; total: number }, idx: number) => {
            const depthPercent = Math.min(100, (bid.total / maxDepthTotal) * 100);
            return (
              <div key={`bid-${idx}`} className="relative flex justify-between items-center px-3 py-[2px] hover:bg-surface-hover/80 cursor-pointer">
                {/* Background Depth Bar */}
                <div 
                  className="absolute right-0 top-0 bottom-0 bg-trade-green/15 pointer-events-none transition-all duration-150"
                  style={{ width: `${depthPercent}%` }}
                />
                <span className="text-trade-green font-semibold z-10">{bid.price.toLocaleString()}</span>
                <span className="text-text-primary z-10">{bid.amount.toFixed(2)}</span>
                <span className="text-text-muted text-[10px] z-10">{bid.total.toFixed(1)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
