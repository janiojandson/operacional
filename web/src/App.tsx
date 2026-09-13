import React, { useState } from 'react';
import { useMarketData } from './hooks/useMarketData';
import { AssetSelector } from './components/Header/AssetSelector';
import { ChartPro } from './components/Chart/ChartPro';
import { DOMBook } from './components/DOM/DOMBook';
import { TapeReader } from './components/Tape/TapeReader';
import { SignalsFeed } from './components/Signals/SignalsFeed';
import { PaperTradingPanel } from './components/PaperTrading/PaperTradingPanel';
import { AIAdvisorModal } from './components/Advisor/AIAdvisorModal';
import { QuantStrategyHealthModal } from './components/Advisor/QuantStrategyHealthModal';
import { ClientProtectionModal } from './components/Clients/ClientProtectionModal';
import { 
  BarChart2, 
  Zap, 
  Briefcase, 
  BookOpen, 
  Clock, 
  Maximize2,
  ChevronRight
} from 'lucide-react';

export default function App() {
  const [activeSymbol, setActiveSymbol] = useState<string>('BTC/USDT');
  const [isAdvisorOpen, setIsAdvisorOpen] = useState<boolean>(false);
  const [isQuantHealthOpen, setIsQuantHealthOpen] = useState<boolean>(false);
  const [isClientsOpen, setIsClientsOpen] = useState<boolean>(false);
  const [density, setDensity] = useState<'compact' | 'normal' | 'spacious'>('normal');
  const [isSidePanelOpen, setIsSidePanelOpen] = useState<boolean>(true);
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState<boolean>(true);
  const [leftColWidthPct, setLeftColWidthPct] = useState<number>(68); // 68% left, 32% right
  const [activeMobileTab, setActiveMobileTab] = useState<'chart' | 'signals' | 'paper' | 'dom' | 'tape'>('chart');

  const {
    isConnected,
    assets,
    book,
    trades,
    candles,
    signals,
    activeCandle,
    paperAccount,
    pairStats,
    dynamicPairs,
    clients,
    clientLogs
  } = useMarketData(activeSymbol);

  const activePosition = paperAccount?.openPositions.find(p => p.symbol === activeSymbol);
  const currentBalance = paperAccount?.balance || 10000;

  const handleUpdateBalance = async (newBalance: number) => {
    try {
      await fetch('/api/paper-trading/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance: newBalance })
      });
    } catch (e) {
      console.error('Failed to update balance:', e);
    }
  };

  const handleResetData = async () => {
    try {
      await fetch('/api/paper-trading/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initialBalance: currentBalance })
      });
    } catch (e) {
      console.error('Failed to reset paper data:', e);
    }
  };

  // Density spacing helpers
  const getGapClass = () => {
    if (density === 'compact') return 'gap-1';
    if (density === 'spacious') return 'gap-3';
    return 'gap-2';
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-slate-100 font-sans overflow-hidden">
      {/* Top Asset Selector & Status Header */}
      <AssetSelector
        assets={assets}
        activeSymbol={activeSymbol}
        onSelect={setActiveSymbol}
        isConnected={isConnected}
        onOpenAdvisor={() => setIsAdvisorOpen(true)}
        onOpenQuantHealth={() => setIsQuantHealthOpen(true)}
        onOpenClients={() => setIsClientsOpen(true)}
        currentBalance={currentBalance}
        onUpdateBalance={handleUpdateBalance}
        onResetData={handleResetData}
        density={density}
        onChangeDensity={setDensity}
        isSidePanelOpen={isSidePanelOpen}
        onToggleSidePanel={() => setIsSidePanelOpen(!isSidePanelOpen)}
        isBottomPanelOpen={isBottomPanelOpen}
        onToggleBottomPanel={() => setIsBottomPanelOpen(!isBottomPanelOpen)}
      />

      {/* Main Workspace Area (Desktop & Tablet Landscape) */}
      <main className="flex-1 hidden lg:flex overflow-hidden relative">
        {/* Left / Center Area: Chart, Signals Feed & Paper Trading Simulator */}
        <section 
          style={{ width: isSidePanelOpen ? `${leftColWidthPct}%` : '100%' }}
          className={`flex flex-col h-full overflow-hidden ${isSidePanelOpen ? 'border-r border-border/80' : ''} transition-all duration-150`}
        >
          {/* Top: Chart Pro with on-chart signals, position lines and flow pressure */}
          <div className={`${isBottomPanelOpen ? 'h-[58%]' : 'h-full'} min-h-0 transition-all duration-150 relative`}>
            <ChartPro
              symbol={activeSymbol}
              candles={candles}
              activeCandle={activeCandle}
              signals={signals}
              openPosition={activePosition}
            />

            {!isBottomPanelOpen && (
              <button
                onClick={() => setIsBottomPanelOpen(true)}
                title="Expandir Painel Inferior de Sinais e Paper Trading"
                className="absolute bottom-3 right-3 z-20 px-3 py-1.5 rounded-lg bg-surface/90 hover:bg-surface border border-border/80 text-xs font-mono font-bold text-accent shadow-xl backdrop-blur-md flex items-center space-x-1.5 transition-all"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Restaurar Painéis</span>
              </button>
            )}
          </div>

          {/* Bottom Split: Signals Radar + Paper Trading Real-time Simulator */}
          {isBottomPanelOpen && (
            <div className={`h-[42%] min-h-0 grid grid-cols-2 ${getGapClass()} border-t border-border/70 bg-background/50`}>
              <div className="h-full overflow-hidden border-r border-border/70">
                <SignalsFeed signals={signals} />
              </div>
              <div className="h-full overflow-hidden">
                <PaperTradingPanel 
                  account={paperAccount} 
                  activeSymbol={activeSymbol}
                  pairStats={pairStats}
                  dynamicPairs={dynamicPairs}
                  clients={clients}
                  clientLogs={clientLogs}
                />
              </div>
            </div>
          )}
        </section>

        {/* Column Width Splitter Bar (Only visible when side panel is open) */}
        {isSidePanelOpen && (
          <div 
            title="Arraste para ajustar largura do DOM e Tape"
            className="w-1.5 bg-border/40 hover:bg-accent cursor-col-resize flex flex-col justify-center items-center group transition-colors select-none z-10"
            onMouseDown={(e) => {
              const startX = e.clientX;
              const startWidth = leftColWidthPct;
              const handleMouseMove = (moveEvent: MouseEvent) => {
                const deltaX = moveEvent.clientX - startX;
                const deltaPct = (deltaX / window.innerWidth) * 100;
                const newPct = Math.min(85, Math.max(45, startWidth + deltaPct));
                setLeftColWidthPct(newPct);
              };
              const handleMouseUp = () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
              };
              window.addEventListener('mousemove', handleMouseMove);
              window.addEventListener('mouseup', handleMouseUp);
            }}
          >
            <div className="w-0.5 h-6 bg-slate-600 group-hover:bg-white rounded-full"></div>
          </div>
        )}

        {/* Right Area: DOM L2 Book & Tape Reader */}
        {isSidePanelOpen && (
          <section 
            style={{ width: `${100 - leftColWidthPct}%` }}
            className={`grid grid-cols-2 h-full overflow-hidden transition-all duration-150 ${getGapClass()}`}
          >
            <div className="h-full overflow-hidden border-r border-border/60">
              <DOMBook book={book} />
            </div>
            <div className="h-full overflow-hidden">
              <TapeReader trades={trades} />
            </div>
          </section>
        )}

        {/* Closed Side Panel Quick Restore Button */}
        {!isSidePanelOpen && (
          <button
            onClick={() => setIsSidePanelOpen(true)}
            title="Expandir Painel Lateral (DOM e Tape)"
            className="absolute top-4 right-4 z-20 px-3 py-1.5 rounded-lg bg-surface/90 hover:bg-surface border border-border/80 text-xs font-mono font-bold text-accent shadow-xl backdrop-blur-md flex items-center space-x-1.5 transition-all"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            <span>Abrir DOM / Tape</span>
          </button>
        )}
      </main>

      {/* Mobile & Tablet Portrait View (Tab-based Ergonomic Layout) */}
      <div className="flex-1 flex flex-col lg:hidden overflow-hidden">
        <div className="flex-1 overflow-hidden relative">
          {activeMobileTab === 'chart' && (
            <div className="h-full w-full">
              <ChartPro
                symbol={activeSymbol}
                candles={candles}
                activeCandle={activeCandle}
                signals={signals}
                openPosition={activePosition}
              />
            </div>
          )}

          {activeMobileTab === 'signals' && (
            <div className="h-full w-full overflow-hidden p-2">
              <SignalsFeed signals={signals} />
            </div>
          )}

          {activeMobileTab === 'paper' && (
            <div className="h-full w-full overflow-hidden p-2">
              <PaperTradingPanel 
                account={paperAccount} 
                activeSymbol={activeSymbol}
                pairStats={pairStats}
                dynamicPairs={dynamicPairs}
                clients={clients}
                clientLogs={clientLogs}
              />
            </div>
          )}

          {activeMobileTab === 'dom' && (
            <div className="h-full w-full overflow-hidden p-2">
              <DOMBook book={book} />
            </div>
          )}

          {activeMobileTab === 'tape' && (
            <div className="h-full w-full overflow-hidden p-2">
              <TapeReader trades={trades} />
            </div>
          )}
        </div>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="h-14 bg-surface/95 border-t border-border/80 flex items-center justify-around px-2 z-30 shrink-0 backdrop-blur-md">
          <button
            onClick={() => setActiveMobileTab('chart')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
              activeMobileTab === 'chart' ? 'text-accent font-bold scale-105' : 'text-slate-400 hover:text-white'
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            <span className="text-[10px] mt-0.5 font-mono">Gráfico</span>
          </button>

          <button
            onClick={() => setActiveMobileTab('signals')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
              activeMobileTab === 'signals' ? 'text-accent font-bold scale-105' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span className="text-[10px] mt-0.5 font-mono">Sinais</span>
          </button>

          <button
            onClick={() => setActiveMobileTab('paper')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
              activeMobileTab === 'paper' ? 'text-accent font-bold scale-105' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span className="text-[10px] mt-0.5 font-mono">Robô</span>
          </button>

          <button
            onClick={() => setActiveMobileTab('dom')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
              activeMobileTab === 'dom' ? 'text-accent font-bold scale-105' : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span className="text-[10px] mt-0.5 font-mono">DOM</span>
          </button>

          <button
            onClick={() => setActiveMobileTab('tape')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
              activeMobileTab === 'tape' ? 'text-accent font-bold scale-105' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span className="text-[10px] mt-0.5 font-mono">Tape</span>
          </button>
        </nav>
      </div>

      {/* AI Advisor Modal (Chat + 7 Blocks + Copy 1-Click) */}
      <AIAdvisorModal
        isOpen={isAdvisorOpen}
        onClose={() => setIsAdvisorOpen(false)}
        pairStats={pairStats}
      />

      {/* 7-Block Quantitative Strategy Health Modal */}
      <QuantStrategyHealthModal
        isOpen={isQuantHealthOpen}
        onClose={() => setIsQuantHealthOpen(false)}
      />

      {/* Client Protection & Account Management Modal */}
      <ClientProtectionModal
        isOpen={isClientsOpen}
        onClose={() => setIsClientsOpen(false)}
      />
    </div>
  );
}
