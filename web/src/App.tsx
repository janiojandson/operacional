import React, { useState } from 'react';
import { useMarketData } from './hooks/useMarketData';
import { AssetSelector } from './components/Header/AssetSelector';
import { ChartPro } from './components/Chart/ChartPro';
import { DOMBook } from './components/DOM/DOMBook';
import { TapeReader } from './components/Tape/TapeReader';
import { SignalsFeed } from './components/Signals/SignalsFeed';
import { PaperTradingPanel } from './components/PaperTrading/PaperTradingPanel';
import { AIAdvisorModal } from './components/Advisor/AIAdvisorModal';

export default function App() {
  const [activeSymbol, setActiveSymbol] = useState<string>('BTC/USDT');
  const [isAdvisorOpen, setIsAdvisorOpen] = useState<boolean>(false);

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

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-slate-100 font-sans overflow-hidden">
      {/* Top Asset Selector & Status Header */}
      <AssetSelector
        assets={assets}
        activeSymbol={activeSymbol}
        onSelect={setActiveSymbol}
        isConnected={isConnected}
        onOpenAdvisor={() => setIsAdvisorOpen(true)}
      />

      {/* Main Workspace Grid */}
      <main className="flex-1 grid grid-cols-12 overflow-hidden">
        {/* Left / Center Area: Chart, Signals Feed & Paper Trading Simulator */}
        <section className="col-span-8 flex flex-col h-full overflow-hidden border-r border-border/80">
          {/* Top: Chart Pro with on-chart signals and position lines */}
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

        {/* Right Area: DOM L2 Book & Tape Reader */}
        <section className="col-span-4 grid grid-cols-2 h-full overflow-hidden">
          <div className="h-full overflow-hidden">
            <DOMBook book={book} />
          </div>
          <div className="h-full overflow-hidden">
            <TapeReader trades={trades} />
          </div>
        </section>
      </main>

      {/* AI Advisor Modal */}
      <AIAdvisorModal
        isOpen={isAdvisorOpen}
        onClose={() => setIsAdvisorOpen(false)}
        pairStats={pairStats}
      />
    </div>
  );
}
