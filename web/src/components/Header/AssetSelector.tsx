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
  onOpenClients: () => void;
  currentBalance: number;
  onUpdateBalance: (balance: number) => void;
  onResetData: () => void;
  temperature: number;
  onUpdateTemperature: (temp: number) => void;
}

export const AssetSelector: React.FC<AssetSelectorProps> = ({
  assets,
  activeSymbol,
  onSelect,
  isConnected,
  onOpenAdvisor,
  onOpenQuantHealth,
  onOpenClients,
  currentBalance,
  onUpdateBalance,
  onResetData,
  temperature,
  onUpdateTemperature
}) => {
  const [isEditingBalance, setIsEditingBalance] = React.useState(false);
  const [customBalanceInput, setCustomBalanceInput] = React.useState(currentBalance.toString());

  const handleSaveBalance = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(customBalanceInput);
    if (!isNaN(val) && val > 0) {
      onUpdateBalance(val);
      setIsEditingBalance(false);
    }
  };

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-surface/90 border-b border-border/80 backdrop-blur-md select-none font-sans">
      <div className="flex items-center space-x-5">
        {/* Logo */}
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-accent to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-accent-glow">
            MF
          </div>
          <div>
            <span className="font-bold text-sm text-white tracking-wide">MARKETFLOW <span className="text-accent">PRO</span></span>
            <div className="text-[10px] text-slate-400 font-mono flex items-center space-x-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>AUTONOMOUS 24/7 v0.4</span>
            </div>
          </div>
        </div>

        {/* Multi-Tenant Organization Switcher */}
        <TenantSelector />

        {/* Dynamic Balance Control */}
        <div className="flex items-center space-x-2 bg-background/80 px-2.5 py-1 rounded-lg border border-border/70 text-xs font-mono">
          <span className="text-slate-400">Banca:</span>
          {isEditingBalance ? (
            <form onSubmit={handleSaveBalance} className="flex items-center space-x-1">
              <input
                type="number"
                value={customBalanceInput}
                onChange={(e) => setCustomBalanceInput(e.target.value)}
                className="w-20 bg-surface border border-accent rounded px-1.5 py-0.5 text-white font-bold text-xs focus:outline-none"
                autoFocus
              />
              <button type="submit" className="px-1.5 py-0.5 rounded bg-accent text-white font-bold text-[10px]">OK</button>
              <button type="button" onClick={() => setIsEditingBalance(false)} className="px-1.5 py-0.5 rounded bg-surface text-slate-400 text-[10px]">X</button>
            </form>
          ) : (
            <button
              onClick={() => {
                setCustomBalanceInput(currentBalance.toString());
                setIsEditingBalance(true);
              }}
              title="Clique para editar a banca inicial"
              className="font-bold text-white hover:text-accent transition-colors flex items-center space-x-1"
            >
              <span>${currentBalance.toLocaleString()}</span>
              <span className="text-[10px] text-slate-500 font-normal">✏️</span>
            </button>
          )}

          <button
            onClick={() => {
              if (window.confirm('Deseja realmente zerar todo o histórico e reiniciar as métricas?')) {
                onResetData();
              }
            }}
            title="Zerar / Reiniciar dados de entrada"
            className="text-[10px] text-slate-400 hover:text-rose-400 px-1.5 py-0.5 rounded hover:bg-surface border border-transparent hover:border-border transition-all"
          >
            🔄 Zerar
          </button>
        </div>

        {/* Temperature Risk Control (>= 1.5x) */}
        <div className="flex items-center space-x-1.5 bg-background/80 px-2.5 py-1 rounded-lg border border-border/70 text-xs font-mono">
          <span className="text-slate-400">Temp:</span>
          <select
            value={temperature}
            onChange={(e) => onUpdateTemperature(parseFloat(e.target.value))}
            className="bg-surface border border-border/60 rounded px-1.5 py-0.5 text-accent font-bold text-xs focus:outline-none"
          >
            <option value={1.5}>1.5x (Normal)</option>
            <option value={2.0}>2.0x (Extração)</option>
            <option value={3.0}>3.0x (Power)</option>
            <option value={4.0}>4.0x (Galáctico)</option>
            <option value={5.0}>5.0x (Suprema)</option>
          </select>
        </div>

        {/* Asset Badges */}
        <div className="flex items-center space-x-2 overflow-x-auto py-1 max-w-md no-scrollbar">
          {assets.map((asset) => {
            const isActive = asset.symbol === activeSymbol;
            const isPositive = asset.change24h >= 0;

            return (
              <button
                key={asset.symbol}
                onClick={() => onSelect(asset.symbol)}
                className={`flex items-center space-x-2 px-2.5 py-1 rounded-md border text-xs font-mono whitespace-nowrap transition-all duration-150 ${
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
      <div className="flex items-center space-x-2">
        <button
          onClick={onOpenClients}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/40 text-xs font-bold font-mono transition-all"
        >
          <span>🛡️ CLIENTES & PROTEÇÃO</span>
        </button>

        <button
          onClick={onOpenQuantHealth}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 text-xs font-bold font-mono transition-all"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>SAÚDE (7 BLOCOS)</span>
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

