import React from 'react';
import { AssetSummary } from '../../../shared/types';
import { TrendingUp, TrendingDown, Radio, Brain } from 'lucide-react';
import { TenantSelector } from './TenantSelector';

interface AssetSelectorProps {
  assets: AssetSummary[];
  activeSymbol: string;
  onSelect: (symbol: string) => void;
  isConnected: boolean;
  onOpenAdvisor: () => void;
  onOpenQuantHealth: () => void;
}

export const AssetSelector: React.FC<AssetSelectorProps> = ({
  assets,
  activeSymbol,
  onSelect,
  isConnected,
  onOpenAdvisor,
  onOpenQuantHealth
}) => {
  return (
    <header className="flex items-center justify-between px-4 py-2 bg-surface/90 border-b border-border/80 backdrop-blur-md select-none">
      <div className="flex items-center space-x-6">
        {/* Logo */}
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-accent to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-accent-glow">
            MF
          </div>
          <div>
            <span className="font-bold text-sm text-white tracking-wide">MARKETFLOW <span className="text-accent">PRO</span></span>
            <div className="text-[10px] text-slate-400 font-mono flex items-center space-x-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>INSTITUTIONAL QUANT v0.3</span>
            </div>
          </div>
        </div>

        {/* Multi-Tenant Organization Switcher */}
        <TenantSelector />

        {/* Asset Badges */}
        <div className="flex items-center space-x-2 overflow-x-auto py-1">
          {assets.map((asset) => {
            const isActive = asset.symbol === activeSymbol;
            const isPositive = asset.change24h >= 0;

            return (
              <button
                key={asset.symbol}
                onClick={() => onSelect(asset.symbol)}
                className={`flex items-center space-x-2.5 px-3 py-1.5 rounded-md border text-xs font-mono transition-all duration-150 ${
                  isActive
                    ? 'bg-accent/15 border-accent text-white shadow-sm'
                    : 'bg-surface/50 border-border hover:bg-surface-hover text-slate-300'
                }`}
              >
                <span className="font-semibold">{asset.symbol}</span>
                <span className="text-slate-200 font-bold">${asset.lastPrice.toLocaleString()}</span>
                <span className={`flex items-center text-[10px] font-semibold ${isPositive ? 'text-buy' : 'text-sell'}`}>
                  {isPositive ? <TrendingUp className="w-3 h-3 mr-0.5 inline" /> : <TrendingDown className="w-3 h-3 mr-0.5 inline" />}
                  {isPositive ? `+${asset.change24h}%` : `${asset.change24h}%`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center space-x-2.5">
        <button
          onClick={onOpenQuantHealth}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 text-xs font-bold font-mono transition-all"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>SAÚDE DA ESTRATÉGIA (6 BLOCOS)</span>
        </button>

        <button
          onClick={onOpenAdvisor}
          className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-accent to-purple-600 hover:from-accent/90 hover:to-purple-500 text-white text-xs font-bold font-mono shadow-md shadow-accent-glow transition-all"
        >
          <Brain className="w-4 h-4" />
          <span>CONSULTOR IA</span>
        </button>

        <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-surface border border-border text-xs font-mono">
          <Radio className={`w-3.5 h-3.5 ${isConnected ? 'text-emerald-400 animate-pulse' : 'text-rose-500'}`} />
          <span className={isConnected ? 'text-emerald-400' : 'text-rose-500'}>
            {isConnected ? 'LIVE WS' : 'OFFLINE'}
          </span>
        </div>
      </div>
    </header>
  );
};
