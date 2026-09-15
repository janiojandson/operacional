import React, { useState } from 'react';
import { AssetSummary } from '../../../shared/types';
import { 
  TrendingUp, 
  TrendingDown, 
  Radio, 
  Brain, 
  Settings,
  RefreshCw,
  Edit3,
  X,
  Check,
  Zap
} from 'lucide-react';
import { TenantSelector } from './TenantSelector';

interface AssetSelectorProps {
  assets: AssetSummary[];
  activeSymbol: string;
  onSelect: (symbol: string) => void;
  isConnected: boolean;
  onOpenAdvisor: () => void;
  onOpenQuantHealth: () => void;
  currentBalance: number;
  onUpdateBalance: (balance: number) => void;
  onResetData: () => void;
}

export const AssetSelector: React.FC<AssetSelectorProps> = ({
  assets,
  activeSymbol,
  onSelect,
  isConnected,
  onOpenAdvisor,
  onOpenQuantHealth,
  currentBalance,
  onUpdateBalance,
  onResetData
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [customBalanceInput, setCustomBalanceInput] = useState(currentBalance.toString());

  const handleSaveBalance = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(customBalanceInput);
    if (!isNaN(val) && val > 0) {
      onUpdateBalance(val);
      setIsSettingsOpen(false);
    }
  };

  return (
    <header className="flex items-center justify-between px-3 md:px-4 py-2 bg-surface/95 border-b border-border/80 backdrop-blur-md select-none font-sans z-30 relative gap-3">
      {/* Left Section: Logo, Tenant & Asset Badges */}
      <div className="flex items-center space-x-3 md:space-x-4 min-w-0 flex-1">
        {/* Logo Institucional */}
        <div className="flex items-center space-x-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-accent to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-accent-glow text-sm">
            MF
          </div>
          <div className="hidden sm:block">
            <span className="font-bold text-xs md:text-sm text-white tracking-wide">
              MARKETFLOW <span className="text-accent">PRO</span>
            </span>
            <div className="text-[9px] md:text-[10px] text-slate-400 font-mono flex items-center space-x-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>24/7 INSTITUCIONAL</span>
            </div>
          </div>
        </div>

        {/* Multi-Tenant Organization Switcher */}
        <div className="hidden lg:block shrink-0">
          <TenantSelector />
        </div>

        {/* Saldo / Banca (Visual Limpo de Terminal Institucional) */}
        <div className="flex items-center space-x-1.5 bg-background/80 px-2.5 py-1 rounded-lg border border-border/70 text-xs font-mono shrink-0">
          <span className="text-slate-400 text-[11px] hidden sm:inline">Banca:</span>
          <span className="font-bold text-white tracking-wide">${currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>

        {/* Asset Badges (Scrollable Bar) */}
        <div className="flex items-center space-x-1.5 overflow-x-auto py-0.5 max-w-full no-scrollbar">
          {assets.map((asset) => {
            const isActive = asset.symbol === activeSymbol;
            const isPositive = asset.change24h >= 0;

            return (
              <button
                key={asset.symbol}
                onClick={() => onSelect(asset.symbol)}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md border text-[11px] font-mono whitespace-nowrap transition-all duration-150 shrink-0 ${
                  isActive
                    ? 'bg-accent/20 border-accent text-white shadow-sm'
                    : 'bg-surface/50 border-border hover:bg-surface-hover text-slate-300'
                }`}
              >
                <span className="font-semibold">{asset.symbol}</span>
                <span className="text-slate-200 font-bold hidden sm:inline">${asset.lastPrice.toLocaleString()}</span>
                <span className={`flex items-center text-[9px] font-semibold ${isPositive ? 'text-buy' : 'text-sell'}`}>
                  {isPositive ? <TrendingUp className="w-2.5 h-2.5 mr-0.5 inline" /> : <TrendingDown className="w-2.5 h-2.5 mr-0.5 inline" />}
                  {isPositive ? `+${asset.change24h}%` : `${asset.change24h}%`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Section: Action Buttons & Live Status */}
      <div className="flex items-center space-x-2 shrink-0">
        {/* Botão 7 BLOCOS */}
        <button
          onClick={onOpenQuantHealth}
          title="Auditoria Quantitativa dos 7 Blocos de Risco"
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 text-xs font-bold font-mono transition-all whitespace-nowrap shadow-sm"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>7 BLOCOS</span>
        </button>

        {/* Botão Consultor IA */}
        <button
          onClick={onOpenAdvisor}
          title="Consultor e Auditoria Estratégica IA"
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-accent to-purple-600 hover:from-accent/90 hover:to-purple-500 text-white text-xs font-bold font-mono shadow-md shadow-accent-glow transition-all whitespace-nowrap"
        >
          <Brain className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">CONSULTOR IA</span>
        </button>

        {/* Live WS Status */}
        <div className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-[11px] font-mono shrink-0">
          <Radio className={`w-3.5 h-3.5 ${isConnected ? 'text-emerald-400 animate-pulse' : 'text-rose-500'}`} />
          <span className={`font-bold ${isConnected ? 'text-emerald-400' : 'text-rose-500'}`}>
            {isConnected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>

        {/* Botão Discreto de Configurações Administrativas (⚙️) */}
        <button
          onClick={() => {
            setCustomBalanceInput(currentBalance.toString());
            setIsSettingsOpen(!isSettingsOpen);
          }}
          title="Configurações da Sessão do Terminal (Oculto na Live)"
          className="p-1.5 rounded-lg bg-surface border border-border/80 text-slate-400 hover:text-white hover:bg-surface-hover transition-all"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Modal de Configurações Administrativas (Menu Oculto para Lives) */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border/80 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 font-mono">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center space-x-2 text-white">
                <Settings className="w-4 h-4 text-accent" />
                <span className="text-xs font-bold uppercase tracking-wider">Configurações da Sessão</span>
              </div>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Ajuste de Banca */}
            <form onSubmit={handleSaveBalance} className="space-y-2">
              <label className="text-[11px] text-slate-300 font-bold block">Ajustar Saldo da Banca ($)</label>
              <div className="flex space-x-2">
                <input
                  type="number"
                  step="any"
                  value={customBalanceInput}
                  onChange={(e) => setCustomBalanceInput(e.target.value)}
                  className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-xl bg-accent hover:bg-accent/80 text-white text-xs font-bold transition-all flex items-center space-x-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Salvar</span>
                </button>
              </div>
            </form>

            {/* Ação de Zerar / Resetar */}
            <div className="pt-2 border-t border-border/50">
              <label className="text-[11px] text-slate-400 block mb-1.5">Reiniciar Métricas e Histórico</label>
              <button
                onClick={() => {
                  if (window.confirm('Deseja realmente zerar todo o histórico e reiniciar as métricas da sessão?')) {
                    onResetData();
                    setIsSettingsOpen(false);
                  }
                }}
                className="w-full py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all flex items-center justify-center space-x-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Zerar Histórico da Sessão</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
