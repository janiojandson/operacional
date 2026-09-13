import React, { useState } from 'react';
import { AssetSummary } from '../../../shared/types';
import { 
  TrendingUp, 
  TrendingDown, 
  Radio, 
  Brain, 
  LayoutGrid, 
  SlidersHorizontal,
  Shield,
  Menu,
  X,
  RefreshCw,
  Edit3
} from 'lucide-react';
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
  density: 'compact' | 'normal' | 'spacious';
  onChangeDensity: (density: 'compact' | 'normal' | 'spacious') => void;
  isSidePanelOpen: boolean;
  onToggleSidePanel: () => void;
  isBottomPanelOpen: boolean;
  onToggleBottomPanel: () => void;
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
  density,
  onChangeDensity,
  isSidePanelOpen,
  onToggleSidePanel,
  isBottomPanelOpen,
  onToggleBottomPanel
}) => {
  const [isEditingBalance, setIsEditingBalance] = useState(false);
  const [customBalanceInput, setCustomBalanceInput] = useState(currentBalance.toString());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSaveBalance = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(customBalanceInput);
    if (!isNaN(val) && val > 0) {
      onUpdateBalance(val);
      setIsEditingBalance(false);
    }
  };

  return (
    <header className="flex items-center justify-between px-3 md:px-4 py-2 bg-surface/95 border-b border-border/80 backdrop-blur-md select-none font-sans z-30 relative gap-3">
      {/* Left Section: Logo, Tenant & Asset Badges */}
      <div className="flex items-center space-x-3 md:space-x-4 min-w-0 flex-1">
        {/* Logo */}
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
              <span>24/7 AUTONOMOUS</span>
            </div>
          </div>
        </div>

        {/* Multi-Tenant Organization Switcher */}
        <div className="hidden lg:block shrink-0">
          <TenantSelector />
        </div>

        {/* Dynamic Balance Control */}
        <div className="flex items-center space-x-1.5 bg-background/80 px-2 py-1 rounded-lg border border-border/70 text-xs font-mono shrink-0">
          <span className="text-slate-400 text-[11px] hidden sm:inline">Banca:</span>
          {isEditingBalance ? (
            <form onSubmit={handleSaveBalance} className="flex items-center space-x-1">
              <input
                type="number"
                value={customBalanceInput}
                onChange={(e) => setCustomBalanceInput(e.target.value)}
                className="w-16 sm:w-20 bg-surface border border-accent rounded px-1.5 py-0.5 text-white font-bold text-xs focus:outline-none"
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
              className="font-bold text-white hover:text-accent transition-colors flex items-center space-x-1 text-xs"
            >
              <span>${currentBalance.toLocaleString()}</span>
              <Edit3 className="w-2.5 h-2.5 text-slate-400" />
            </button>
          )}

          <button
            onClick={() => {
              if (window.confirm('Deseja realmente zerar todo o histórico e reiniciar as métricas?')) {
                onResetData();
              }
            }}
            title="Zerar / Reiniciar dados de entrada"
            className="text-[10px] text-slate-400 hover:text-rose-400 px-1 py-0.5 rounded hover:bg-surface border border-transparent hover:border-border transition-all flex items-center space-x-0.5"
          >
            <RefreshCw className="w-2.5 h-2.5 inline" />
            <span className="hidden md:inline">Zerar</span>
          </button>
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
                className={`flex items-center space-x-1.5 px-2 py-1 rounded-md border text-[11px] font-mono whitespace-nowrap transition-all duration-150 shrink-0 ${
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

      {/* Right Section: Workspace Toggles & Institutional Action Buttons */}
      <div className="flex items-center space-x-1.5 md:space-x-2 shrink-0">
        {/* Workspace Density Controls (Desktop) */}
        <div className="hidden xl:flex items-center bg-background/80 p-0.5 rounded-lg border border-border/70 text-[10px] font-mono">
          <button
            onClick={() => onChangeDensity('compact')}
            title="Densidade Compacta"
            className={`px-2 py-0.5 rounded transition-all ${density === 'compact' ? 'bg-accent text-white font-bold' : 'text-slate-400 hover:text-white'}`}
          >
            Compacto
          </button>
          <button
            onClick={() => onChangeDensity('normal')}
            title="Densidade Normal"
            className={`px-2 py-0.5 rounded transition-all ${density === 'normal' ? 'bg-accent text-white font-bold' : 'text-slate-400 hover:text-white'}`}
          >
            Normal
          </button>
          <button
            onClick={() => onChangeDensity('spacious')}
            title="Densidade Espaçosa"
            className={`px-2 py-0.5 rounded transition-all ${density === 'spacious' ? 'bg-accent text-white font-bold' : 'text-slate-400 hover:text-white'}`}
          >
            Amplo
          </button>
        </div>

        {/* Panel Collapse Toggles (Desktop) */}
        <div className="hidden lg:flex items-center space-x-1 bg-background/80 p-1 rounded-lg border border-border/70 text-xs">
          <button
            onClick={onToggleBottomPanel}
            title={isBottomPanelOpen ? "Recolher Painel Inferior (Sinais & Paper Trading)" : "Expandir Painel Inferior"}
            className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all flex items-center space-x-1 ${
              isBottomPanelOpen ? 'bg-surface text-slate-300 hover:text-white' : 'bg-accent/20 text-accent border border-accent/40 font-bold'
            }`}
          >
            <LayoutGrid className="w-3 h-3" />
            <span>{isBottomPanelOpen ? 'Painel Inf.' : '+ Sinais/Paper'}</span>
          </button>

          <button
            onClick={onToggleSidePanel}
            title={isSidePanelOpen ? "Recolher Painel Lateral (DOM & Tape)" : "Expandir Painel Lateral"}
            className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all flex items-center space-x-1 ${
              isSidePanelOpen ? 'bg-surface text-slate-300 hover:text-white' : 'bg-accent/20 text-accent border border-accent/40 font-bold'
            }`}
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>{isSidePanelOpen ? 'DOM/Tape' : '+ DOM/Tape'}</span>
          </button>
        </div>

        {/* Action Buttons */}
        <button
          onClick={onOpenClients}
          title="Gestão de Subcontas de Clientes com Trava TG e TL"
          className="hidden md:flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/40 text-xs font-bold font-mono transition-all whitespace-nowrap"
        >
          <Shield className="w-3.5 h-3.5" />
          <span>CLIENTES</span>
        </button>

        <button
          onClick={onOpenQuantHealth}
          title="Auditoria Matemática e Risco dos 7 Blocos"
          className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 text-xs font-bold font-mono transition-all whitespace-nowrap"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>7 BLOCOS</span>
        </button>

        <button
          onClick={onOpenAdvisor}
          title="Diálogo Estratégico com Consultor IA"
          className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-gradient-to-r from-accent to-purple-600 hover:from-accent/90 hover:to-purple-500 text-white text-xs font-bold font-mono shadow-md shadow-accent-glow transition-all whitespace-nowrap"
        >
          <Brain className="w-3.5 h-3.5" />
          <span>CONSULTOR IA</span>
        </button>

        {/* Live WS Status */}
        <div className="flex items-center space-x-1 px-2 py-1 rounded bg-surface border border-border text-[11px] font-mono shrink-0">
          <Radio className={`w-3 h-3 ${isConnected ? 'text-emerald-400 animate-pulse' : 'text-rose-500'}`} />
          <span className={`hidden sm:inline ${isConnected ? 'text-emerald-400' : 'text-rose-500'}`}>
            {isConnected ? 'LIVE' : 'OFF'}
          </span>
        </div>

        {/* Mobile Menu Toggle Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1 rounded-lg bg-surface border border-border text-slate-300 md:hidden"
        >
          {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="absolute top-full left-0 right-0 bg-surface/95 border-b border-border/80 backdrop-blur-xl p-3 flex flex-col space-y-2.5 md:hidden shadow-2xl animate-fadeIn">
          <div className="flex items-center justify-between pb-2 border-b border-border/50">
            <TenantSelector />
            <div className="flex items-center space-x-1 bg-background/80 p-0.5 rounded border border-border text-[10px]">
              <button
                onClick={() => onChangeDensity('compact')}
                className={`px-2 py-0.5 rounded ${density === 'compact' ? 'bg-accent text-white font-bold' : 'text-slate-400'}`}
              >
                Compacto
              </button>
              <button
                onClick={() => onChangeDensity('normal')}
                className={`px-2 py-0.5 rounded ${density === 'normal' ? 'bg-accent text-white font-bold' : 'text-slate-400'}`}
              >
                Normal
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                onOpenClients();
                setMobileMenuOpen(false);
              }}
              className="flex items-center justify-center space-x-1.5 p-2 rounded-lg bg-teal-600/20 text-teal-300 border border-teal-500/40 text-xs font-bold font-mono"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Clientes & Proteção</span>
            </button>

            <button
              onClick={() => {
                onOpenQuantHealth();
                setMobileMenuOpen(false);
              }}
              className="flex items-center justify-center space-x-1.5 p-2 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 text-xs font-bold font-mono"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>Saúde (7 Blocos)</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

