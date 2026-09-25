import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Radio,
  Brain,
  Settings,
  RefreshCw,
  X,
  Check,
  Activity
} from 'lucide-react';
import { TenantSelector } from './TenantSelector';

export interface AssetSummary {
  symbol: string;
  lastPrice: number;
  change24h: number;
  high24h?: number;
  low24h?: number;
  volume24h?: number;
}

interface AssetSelectorProps {
  assets?: AssetSummary[];
  activeSymbol: string;
  onSelect: (symbol: string) => void;
  isConnected: boolean;
  onOpenAdvisor: () => void;
  onOpenQuantHealth: () => void;
  onOpenShadowAudit: () => void;
  currentBalance?: number;
  walletBalance?: number;
  openPnl?: number;
  marginUsed?: number;
  availableMargin?: number;
  onUpdateBalance: (balance: number) => void;
  onResetData: () => void;
}

export const AssetSelector: React.FC<AssetSelectorProps> = ({
  assets = [],
  activeSymbol,
  onSelect,
  isConnected,
  onOpenAdvisor,
  onOpenQuantHealth,
  onOpenShadowAudit,
  currentBalance = 10000,
  walletBalance,
  openPnl = 0,
  marginUsed = 0,
  availableMargin,
  onUpdateBalance,
  onResetData
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const safeBalance = Number(currentBalance || 10000);
  const [customBalanceInput, setCustomBalanceInput] = useState(String(safeBalance));

  const handleSaveBalance = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(customBalanceInput);
    if (!isNaN(val) && val > 0) {
      onUpdateBalance(val);
      setIsSettingsOpen(false);
    }
  };

  const cashBalance = Number(walletBalance !== undefined ? walletBalance : safeBalance);
  const floatingPnl = Number(openPnl || 0);

  return (
    <header className="flex items-center justify-between px-3 md:px-4 py-2 bg-bg-panel border-b border-border-panel select-none font-sans z-30 relative gap-3">
      <div className="flex items-center space-x-3 md:space-x-4 min-w-0 flex-1">
        <div className="flex items-center space-x-2 shrink-0">
          <div className="w-8 h-8 rounded bg-gradient-to-tr from-accent to-purple-600 flex items-center justify-center font-bold text-white shadow-md text-sm">
            MF
          </div>
          <div className="hidden sm:block">
            <span className="font-bold text-xs md:text-sm text-text-primary tracking-wide">
              MARKETFLOW <span className="text-accent">PRO</span>
            </span>
            <div className="text-[9px] md:text-[10px] text-text-muted font-mono flex items-center space-x-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-trade-green animate-pulse"></span>
              <span>24/7 INSTITUCIONAL</span>
            </div>
          </div>
        </div>

        <div className="hidden lg:block shrink-0">
          <TenantSelector />
        </div>

        {/* ─── BANCA VIVA COM PNL AO VIVO ─── */}
        <div
          className="flex items-center space-x-2 bg-slate-900/90 px-3 py-1 rounded-lg border border-slate-700/80 text-xs font-mono shrink-0 shadow-sm transition-all"
          title={`Saldo Caixa: $${cashBalance.toFixed(2)} | PnL Aberto: ${floatingPnl >= 0 ? '+' : ''}$${floatingPnl.toFixed(2)}`}
        >
          <div className="flex flex-col text-right">
            <span className="text-slate-400 text-[9px] uppercase tracking-wider leading-tight font-semibold">
              Banca Viva (Equity)
            </span>
            <span className="font-bold text-white tracking-tight text-xs sm:text-sm">
              ${safeBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {floatingPnl !== 0 && (
            <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center border ${floatingPnl > 0
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse'
                : 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse'
              }`}>
              {floatingPnl > 0 ? `+${floatingPnl.toFixed(2)}` : floatingPnl.toFixed(2)}
            </div>
          )}
        </div>

        {/* ─── MARGEM ALOCADA & DISPONÍVEL (HUD LIVE TIKTOK) ─── */}
        {marginUsed > 0 && (
          <div
            className="hidden sm:flex items-center space-x-2 bg-slate-900/90 px-2.5 py-1 rounded-lg border border-amber-500/30 text-xs font-mono shrink-0 shadow-sm transition-all"
            title={`Margem em Operação: $${marginUsed.toFixed(2)} | Livre: $${(availableMargin ?? (safeBalance - marginUsed)).toFixed(2)}`}
          >
            <div className="flex flex-col text-right">
              <span className="text-amber-400/90 text-[9px] uppercase tracking-wider leading-tight font-bold">
                Margem Alocada
              </span>
              <span className="font-black text-amber-300 tracking-tight text-xs">
                ${marginUsed.toFixed(2)} <span className="text-[10px] text-slate-400 font-normal">({safeBalance > 0 ? ((marginUsed / safeBalance) * 100).toFixed(1) : 0}%)</span>
              </span>
            </div>
            <div className="w-px h-6 bg-slate-700/80" />
            <div className="flex flex-col text-left">
              <span className="text-emerald-400/90 text-[9px] uppercase tracking-wider leading-tight font-bold">
                Margem Livre
              </span>
              <span className="font-black text-emerald-400 tracking-tight text-xs">
                ${(availableMargin ?? Math.max(0, safeBalance - marginUsed)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        {/* Lista de Ativos */}
        <div className="flex items-center space-x-1.5 overflow-x-auto py-0.5 max-w-full no-scrollbar">
          {assets.map((asset) => {
            const isActive = asset.symbol === activeSymbol;
            const isPositive = asset.change24h >= 0;

            return (
              <button
                key={asset.symbol}
                onClick={() => onSelect(asset.symbol)}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded border text-[11px] font-mono whitespace-nowrap transition-all duration-150 shrink-0 ${isActive
                    ? 'bg-accent/20 border-accent text-white shadow-sm'
                    : 'bg-bg-app border-border-panel hover:bg-surface-hover text-text-muted hover:text-text-primary'
                  }`}
              >
                <span className="font-semibold">{asset.symbol}</span>
                <span className="text-text-primary font-bold hidden sm:inline">${asset.lastPrice.toLocaleString()}</span>
                <span className={`flex items-center text-[9px] font-semibold ${isPositive ? 'text-trade-green' : 'text-trade-red'}`}>
                  {isPositive ? <TrendingUp className="w-2.5 h-2.5 mr-0.5 inline" /> : <TrendingDown className="w-2.5 h-2.5 mr-0.5 inline" />}
                  {isPositive ? `+${asset.change24h}%` : `${asset.change24h}%`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center space-x-2 shrink-0">
        <button
          onClick={onOpenShadowAudit}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 border border-cyan-500/40 text-xs font-bold font-mono transition-all whitespace-nowrap shadow-sm shadow-cyan-500/10"
        >
          <Activity className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
          <span>📊 SHADOW MODE</span>
        </button>

        <button
          onClick={onOpenQuantHealth}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-trade-green/15 hover:bg-trade-green/25 text-trade-green border border-trade-green/40 text-xs font-bold font-mono transition-all whitespace-nowrap shadow-sm"
        >
          <span className="w-2 h-2 rounded-full bg-trade-green animate-pulse"></span>
          <span>7 BLOCOS</span>
        </button>

        <button
          onClick={onOpenAdvisor}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-gradient-to-r from-accent to-purple-600 hover:from-accent/90 hover:to-purple-500 text-white text-xs font-bold font-mono shadow-md shadow-accent-glow transition-all whitespace-nowrap"
        >
          <Brain className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">CONSULTOR IA</span>
        </button>

        <div className="flex items-center space-x-1 px-2.5 py-1.5 rounded bg-bg-app border border-border-panel text-[11px] font-mono shrink-0">
          <Radio className={`w-3.5 h-3.5 ${isConnected ? 'text-trade-green animate-pulse' : 'text-trade-red'}`} />
          <span className={`font-bold ${isConnected ? 'text-trade-green' : 'text-trade-red'}`}>
            {isConnected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>

        <button
          onClick={() => {
            setCustomBalanceInput(String(safeBalance));
            setIsSettingsOpen(!isSettingsOpen);
          }}
          title="Configurações da Sessão"
          className="p-1.5 rounded bg-bg-app border border-border-panel text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-bg-panel border border-border-panel rounded-md p-5 max-w-sm w-full space-y-4 shadow-2xl font-mono">
            <div className="flex items-center justify-between pb-3 border-b border-border-panel">
              <div className="flex items-center space-x-2 text-text-primary">
                <Settings className="w-4 h-4 text-accent" />
                <span className="text-xs font-bold uppercase tracking-wider">Configurações da Sessão</span>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-text-muted hover:text-text-primary p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBalance} className="space-y-2">
              <label className="text-[11px] text-text-primary font-bold block">Ajustar Saldo da Banca ($)</label>
              <div className="flex space-x-2">
                <input
                  type="number"
                  step="any"
                  value={customBalanceInput}
                  onChange={(e) => setCustomBalanceInput(e.target.value)}
                  className="flex-1 bg-bg-app border border-border-panel rounded px-3 py-2 text-text-primary text-xs font-mono focus:outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded bg-accent hover:bg-accent/80 text-white text-xs font-bold transition-all flex items-center space-x-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Salvar</span>
                </button>
              </div>
            </form>

            <div className="pt-2 border-t border-border-panel">
              <label className="text-[11px] text-text-muted block mb-1.5">Reiniciar Métricas e Histórico</label>
              <button
                onClick={() => {
                  if (window.confirm('Deseja realmente zerar todo o histórico e reiniciar as métricas da sessão?')) {
                    onResetData();
                    setIsSettingsOpen(false);
                  }
                }}
                className="w-full py-2 rounded bg-trade-red/15 hover:bg-trade-red/25 text-trade-red border border-trade-red/30 text-xs font-bold transition-all flex items-center justify-center space-x-1.5"
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