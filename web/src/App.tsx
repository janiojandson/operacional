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

export default function App() {
  const [activeSymbol, setActiveSymbol] = useState<string>('BTC/USDT');
  const [isAdvisorOpen, setIsAdvisorOpen] = useState<boolean>(false);
  const [isQuantHealthOpen, setIsQuantHealthOpen] = useState<boolean>(false);
  const [isClientsOpen, setIsClientsOpen] = useState<boolean>(false);
  const [temperature, setTemperature] = useState<number>(1.5);
  const [leftColWidthPct, setLeftColWidthPct] = useState<number>(66); // 66% left, 34% right default

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

  const handleUpdateTemperature = async (temp: number) => {
    setTemperature(temp);
    try {
      await fetch('/api/paper-trading/temperature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minTemperature: temp })
      });
    } catch (e) {
      console.error('Failed to update min temperature:', e);
    }
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
        temperature={temperature}
        onUpdateTemperature={handleUpdateTemperature}
      />

      {/* Main Workspace Grid with Resizable Columns */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left / Center Area: Chart, Signals Feed & Paper Trading Simulator */}
        <section 
          style={{ width: `${leftColWidthPct}%` }}
          className="flex flex-col h-full overflow-hidden border-r border-border/80 transition-all duration-75"
        >
          {/* Top: Chart Pro with on-chart signals, position lines and flow pressure */}
          <div className="flex-1 h-[56%] min-h-0">
            <ChartPro
              symbol={activeSymbol}
              candles={candles}
              activeCandle={activeCandle}
              signals={signals}
              openPosition={activePosition}
            />
          </div>

          {/* Bottom Split: Signals Radar + Paper Trading Real-time Simulator */}
          <div className="h-[44%] min-h-0 grid grid-cols-2">
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
        </section>

        {/* Column Width Splitter Bar */}
        <div 
          title="Ajustar proporção das colunas"
          className="w-1.5 bg-border/40 hover:bg-accent cursor-col-resize flex flex-col justify-center items-center group transition-colors select-none"
          onMouseDown={(e) => {
            const startX = e.clientX;
            const startWidth = leftColWidthPct;
            const handleMouseMove = (moveEvent: MouseEvent) => {
              const deltaX = moveEvent.clientX - startX;
              const deltaPct = (deltaX / window.innerWidth) * 100;
              const newPct = Math.min(85, Math.max(40, startWidth + deltaPct));
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

        {/* Right Area: DOM L2 Book & Tape Reader */}
        <section 
          style={{ width: `${100 - leftColWidthPct}%` }}
          className="grid grid-cols-2 h-full overflow-hidden transition-all duration-75"
        >
          <div className="h-full overflow-hidden">
            <DOMBook book={book} />
          </div>
          <div className="h-full overflow-hidden">
            <TapeReader trades={trades} />
          </div>
        </section>
      </main>

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
        clients={clients}
        onRefresh={() => {}}
      />
    </div>
  );
}
