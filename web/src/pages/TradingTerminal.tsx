import React, { useState, useRef } from 'react';
import { useMarketData } from '../hooks/useMarketData';
import { AssetSelector } from '../components/Header/AssetSelector';
import { ChartPro } from '../components/Chart/ChartPro';
import { DOMBook } from '../components/DOM/DOMBook';
import { TapeReader } from '../components/Tape/TapeReader';
import { SignalsFeed } from '../components/Signals/SignalsFeed';
import { PaperTradingPanel } from '../components/PaperTrading/PaperTradingPanel';
import { AIAdvisorModal } from '../components/Advisor/AIAdvisorModal';
import { QuantStrategyHealthModal } from '../components/Advisor/QuantStrategyHealthModal';
import { ShadowAuditModal } from '../components/ShadowAuditModal';
import { 
  BarChart2, 
  Zap, 
  Briefcase, 
  BookOpen, 
  Clock, 
  Maximize2
} from 'lucide-react';

export default function TradingTerminal() {
  const [activeSymbol, setActiveSymbol] = useState<string>('BTC/USDT');
  const [isAdvisorOpen, setIsAdvisorOpen] = useState<boolean>(false);
  const [isQuantHealthOpen, setIsQuantHealthOpen] = useState<boolean>(false);
  const [isShadowAuditOpen, setIsShadowAuditOpen] = useState<boolean>(false);
  
  // Painéis Redimensionáveis (Splitter States)
  const [leftColWidthPct, setLeftColWidthPct] = useState<number>(65); // 65% esquerda (Gráfico/Sinais/Boleta), 35% direita (DOM/Tape)
  const [chartHeightPct, setChartHeightPct] = useState<number>(58); // 58% Gráfico, 42% Base (Sinais/Boleta)
  const [signalsWidthPct, setSignalsWidthPct] = useState<number>(48); // 48% Sinais, 52% Boleta
  const [domWidthPct, setDomWidthPct] = useState<number>(50); // 50% DOM, 50% Tape

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
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('mfp_token')}`
        },
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
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('mfp_token')}`
        },
        body: JSON.stringify({ initialBalance: currentBalance })
      });
    } catch (e) {
      console.error('Failed to reset paper data:', e);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-bg-app text-text-primary font-sans overflow-hidden select-none">
      {/* Top Asset Selector & Institutional Live Header */}
      <AssetSelector
        assets={assets}
        activeSymbol={activeSymbol}
        onSelect={setActiveSymbol}
        isConnected={isConnected}
        onOpenAdvisor={() => setIsAdvisorOpen(true)}
        onOpenQuantHealth={() => setIsQuantHealthOpen(true)}
        onOpenShadowAudit={() => setIsShadowAuditOpen(true)}
        currentBalance={currentBalance}
        onUpdateBalance={handleUpdateBalance}
        onResetData={handleResetData}
      />

      {/* Main Workspace Area (Desktop & Tablet Landscape) Redimensionável */}
      <main className="flex-1 hidden lg:flex overflow-hidden relative p-1.5 gap-1.5 bg-bg-app">
        {/* Left Column: Gráfico (Superior) + Sinais & Boleta (Inferior) */}
        <section 
          style={{ width: `${leftColWidthPct}%` }}
          className="flex flex-col h-full overflow-hidden gap-1.5"
        >
          {/* Top: Chart Pro */}
          <div 
            style={{ height: `${chartHeightPct}%` }}
            className="w-full min-h-[150px] relative overflow-hidden bg-bg-panel border border-border-panel rounded-md shadow-sm"
          >
            <ChartPro
              symbol={activeSymbol}
              candles={candles}
              activeCandle={activeCandle}
              signals={signals}
              openPosition={activePosition}
            />
          </div>

          {/* Horizontal Splitter (Arraste para ajustar altura entre Gráfico e Base) */}
          <div
            title="Arraste para ajustar a altura do Gráfico e dos Painéis Inferiores"
            className="h-1.5 w-full bg-border-panel/40 hover:bg-accent cursor-row-resize flex justify-center items-center group transition-colors select-none z-20 shrink-0 rounded-full"
            onMouseDown={(e) => {
              e.preventDefault();
              const startY = e.clientY;
              const startHeight = chartHeightPct;
              const containerHeight = window.innerHeight - 56; // menos header
              const handleMouseMove = (moveEvent: MouseEvent) => {
                const deltaY = moveEvent.clientY - startY;
                const deltaPct = (deltaY / containerHeight) * 100;
                const newPct = Math.min(82, Math.max(25, startHeight + deltaPct));
                setChartHeightPct(newPct);
              };
              const handleMouseUp = () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
              };
              window.addEventListener('mousemove', handleMouseMove);
              window.addEventListener('mouseup', handleMouseUp);
            }}
          >
            <div className="h-0.5 w-10 bg-slate-600 group-hover:bg-white rounded-full"></div>
          </div>

          {/* Bottom Split: Sinais Radar + Boleta de Operações Quantitativas */}
          <div 
            style={{ height: `${100 - chartHeightPct}%` }}
            className="w-full min-h-[120px] flex overflow-hidden gap-1.5"
          >
            {/* Radar de Sinais */}
            <div 
              style={{ width: `${signalsWidthPct}%` }}
              className="h-full overflow-hidden bg-bg-panel border border-border-panel rounded-md shadow-sm"
            >
              <SignalsFeed signals={signals} />
            </div>

            {/* Splitter Vertical entre Sinais e Boleta */}
            <div
              title="Arraste para ajustar largura entre Radar de Sinais e Operações"
              className="w-1.5 h-full bg-border-panel/40 hover:bg-accent cursor-col-resize flex flex-col justify-center items-center group transition-colors select-none z-10 shrink-0 rounded-full"
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startWidth = signalsWidthPct;
                const leftContainerWidth = (window.innerWidth * leftColWidthPct) / 100;
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaX = moveEvent.clientX - startX;
                  const deltaPct = (deltaX / leftContainerWidth) * 100;
                  const newPct = Math.min(75, Math.max(25, startWidth + deltaPct));
                  setSignalsWidthPct(newPct);
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

            {/* Boleta de Operações Quantitativas */}
            <div 
              style={{ width: `${100 - signalsWidthPct}%` }}
              className="h-full overflow-hidden bg-bg-panel border border-border-panel rounded-md shadow-sm"
            >
              <PaperTradingPanel 
                account={paperAccount} 
                activeSymbol={activeSymbol}
                pairStats={pairStats}
                dynamicPairs={dynamicPairs}
              />
            </div>
          </div>
        </section>

        {/* Main Vertical Splitter Bar (Arraste para ajustar largura entre Gráfico e DOM/Tape) */}
        <div 
          title="Arraste para ajustar largura entre Gráfico e DOM/Tape"
          className="w-1.5 h-full bg-border-panel/40 hover:bg-accent cursor-col-resize flex flex-col justify-center items-center group transition-colors select-none z-20 shrink-0 rounded-full"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = leftColWidthPct;
            const handleMouseMove = (moveEvent: MouseEvent) => {
              const deltaX = moveEvent.clientX - startX;
              const deltaPct = (deltaX / window.innerWidth) * 100;
              const newPct = Math.min(82, Math.max(35, startWidth + deltaPct));
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
          <div className="w-0.5 h-8 bg-slate-600 group-hover:bg-white rounded-full"></div>
        </div>

        {/* Right Column: DOM L2 Book & Tape Reader */}
        <section 
          style={{ width: `${100 - leftColWidthPct}%` }}
          className="flex h-full overflow-hidden gap-1.5"
        >
          {/* DOM Book */}
          <div 
            style={{ width: `${domWidthPct}%` }}
            className="h-full overflow-hidden bg-bg-panel border border-border-panel rounded-md shadow-sm"
          >
            <DOMBook book={book} />
          </div>

          {/* Splitter Vertical entre DOM Book e Tape Reader */}
          <div
            title="Arraste para ajustar largura entre Book DOM e Tape"
            className="w-1.5 h-full bg-border-panel/40 hover:bg-accent cursor-col-resize flex flex-col justify-center items-center group transition-colors select-none z-10 shrink-0 rounded-full"
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startWidth = domWidthPct;
              const rightContainerWidth = (window.innerWidth * (100 - leftColWidthPct)) / 100;
              const handleMouseMove = (moveEvent: MouseEvent) => {
                const deltaX = moveEvent.clientX - startX;
                const deltaPct = (deltaX / rightContainerWidth) * 100;
                const newPct = Math.min(75, Math.max(25, startWidth + deltaPct));
                setDomWidthPct(newPct);
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

          {/* Tape Reader */}
          <div 
            style={{ width: `${100 - domWidthPct}%` }}
            className="h-full overflow-hidden bg-bg-panel border border-border-panel rounded-md shadow-sm"
          >
            <TapeReader trades={trades} />
          </div>
        </section>
      </main>

      {/* Mobile & Tablet Portrait View */}
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
            <span className="text-[10px] mt-0.5 font-mono">Operações</span>
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

      {/* AI Advisor Modal (Chat + Consultor) */}
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

      {/* Shadow Mode Auditor Modal (Live Anti-USD & Spread L2) */}
      <ShadowAuditModal
        isOpen={isShadowAuditOpen}
        onClose={() => setIsShadowAuditOpen(false)}
      />
    </div>
  );
}
