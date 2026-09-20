import React, { useState, useEffect } from 'react';
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
  Clock
} from 'lucide-react';

export default function TradingTerminal() {
  const [activeSymbol, setActiveSymbol] = useState<string>('BTC/USDT');
  const [isAdvisorOpen, setIsAdvisorOpen] = useState<boolean>(false);
  const [isQuantHealthOpen, setIsQuantHealthOpen] = useState<boolean>(false);
  const [isShadowAuditOpen, setIsShadowAuditOpen] = useState<boolean>(false);

  // Estados dos Botões Operacionais
  const [trailingStopEnabled, setTrailingStopEnabled] = useState<boolean>(true);
  const [shadowFilterActive, setShadowFilterActive] = useState<boolean>(false);

  // Splitter States
  const [leftColWidthPct, setLeftColWidthPct] = useState<number>(65);
  const [chartHeightPct, setChartHeightPct] = useState<number>(58);
  const [signalsWidthPct, setSignalsWidthPct] = useState<number>(48);
  const [domWidthPct, setDomWidthPct] = useState<number>(50);

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
    dynamicPairs
  } = useMarketData(activeSymbol);

  const activePosition = paperAccount?.openPositions?.find((p: any) => p.symbol === activeSymbol);

  // ─── 4. CÁLCULO DA BANCA VIVA (LIVE EQUITY EM TEMPO REAL) ────────────────
  const walletBalance = Number(paperAccount?.balance || 10000);
  const openPositionsList = paperAccount?.openPositions || [];
  const totalUnrealizedPnl = openPositionsList.reduce(
    (acc: number, pos: any) => acc + Number(pos.pnlUsd || pos.unrealizedPnl || 0),
    0
  );
  // Banca Viva = Caixa + Soma do PnL flutuante de todas as posições abertas
  const liveEquity = Number((walletBalance + totalUnrealizedPnl).toFixed(2));

  // ─── 3. MONITORAMENTO DE PERDA MÁXIMA DIÁRIA & PISO DE BANCA ─────────────
  useEffect(() => {
    const maxDailyLoss = 150.0;     // Teto de perda aberta diária (-$150)
    const minEquityFloor = 9500.0;   // Piso de proteção da banca ($9.500)

    if (totalUnrealizedPnl <= -maxDailyLoss || liveEquity <= minEquityFloor) {
      console.warn(`[CIRCUIT BREAKER VISUAL] ⚠️ Alerta de Risco: PnL Aberto (-$${Math.abs(totalUnrealizedPnl).toFixed(2)}) atingiu o teto diário!`);
    }
  }, [totalUnrealizedPnl, liveEquity]);

  useEffect(() => {
    fetch('/api/admin/config/toggles', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('mfp_token') || ''}`
      }
    })
      .then(res => res.json())
      .then((data: any) => {
        if (data?.success) {
          setTrailingStopEnabled(Boolean(data.trailingStopEnabled));
          setShadowFilterActive(Boolean(data.shadowFilterActive));
        }
      })
      .catch(() => { });
  }, []);

  const handleToggleTrailing = async () => {
    const nextVal = !trailingStopEnabled;
    setTrailingStopEnabled(nextVal);
    try {
      await fetch('/api/admin/config/trailing-stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('mfp_token') || ''}`
        },
        body: JSON.stringify({ enabled: nextVal })
      });
    } catch {
      setTrailingStopEnabled(!nextVal);
    }
  };

  const handleToggleShadow = async () => {
    const nextVal = !shadowFilterActive;
    setShadowFilterActive(nextVal);
    try {
      await fetch('/api/admin/config/shadow-filter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('mfp_token') || ''}`
        },
        body: JSON.stringify({ active: nextVal })
      });
    } catch {
      setShadowFilterActive(!nextVal);
    }
  };

  const handleUpdateBalance = async (newBalance: number) => {
    try {
      await fetch('/api/paper-trading/balance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('mfp_token') || ''}`
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
          'Authorization': `Bearer ${localStorage.getItem('mfp_token') || ''}`
        },
        body: JSON.stringify({ initialBalance: walletBalance })
      });
    } catch (e) {
      console.error('Failed to reset paper data:', e);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-bg-app text-text-primary font-sans overflow-hidden select-none">
      {/* Cabeçalho com Banca Viva e PnL ao Vivo */}
      <AssetSelector
        assets={assets}
        activeSymbol={activeSymbol}
        onSelect={setActiveSymbol}
        isConnected={isConnected}
        onOpenAdvisor={() => setIsAdvisorOpen(true)}
        onOpenQuantHealth={() => setIsQuantHealthOpen(true)}
        onOpenShadowAudit={() => setIsShadowAuditOpen(true)}
        currentBalance={liveEquity}
        walletBalance={walletBalance}
        openPnl={totalUnrealizedPnl}
        onUpdateBalance={handleUpdateBalance}
        onResetData={handleResetData}
      />

      {/* Barra de Controle de Estratégias no Cabeçalho */}
      <div className="bg-[#0f172a] border-b border-slate-800 px-3 py-1.5 flex items-center justify-between z-20 shrink-0 text-xs">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider hidden sm:inline">
            Controle Operacional:
          </span>

          {/* Botão Trailing Stop */}
          <button
            onClick={handleToggleTrailing}
            className={`flex items-center gap-2 px-3 py-1 rounded border font-mono transition-all ${trailingStopEnabled
                ? 'bg-emerald-950/50 border-emerald-500/60 text-emerald-400 hover:bg-emerald-900/60'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'
              }`}
            title="Alternar Trailing Stop (80%/20%) vs Alvo Fixo (100%)"
          >
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${trailingStopEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span>Trailing Stop: <b>{trailingStopEnabled ? 'ATIVADO (80%/20%)' : 'DESATIVADO (FIXO)'}</b></span>
            </span>
          </button>

          {/* Botão Shadow Mode */}
          <button
            onClick={handleToggleShadow}
            className={`flex items-center gap-2 px-3 py-1 rounded border font-mono transition-all ${shadowFilterActive
                ? 'bg-purple-950/60 border-purple-500/70 text-purple-300 hover:bg-purple-900/70'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'
              }`}
            title="Alternar Executor Real (Bloqueia ordens) vs Modo Fantasma (Auditor)"
          >
            <svg className="w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${shadowFilterActive ? 'bg-purple-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>Shadow Mode: <b>{shadowFilterActive ? 'EXECUTOR REAL' : 'MODO FANTASMA'}</b></span>
            </span>
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-2 text-[11px] font-mono text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>PostgreSQL Railway Conectado</span>
        </div>
      </div>

      {/* Layout Desktop */}
      <main className="flex-1 hidden lg:flex overflow-hidden relative p-1.5 gap-1.5 bg-bg-app">
        <section
          style={{ width: `${leftColWidthPct}%` }}
          className="flex flex-col h-full overflow-hidden gap-1.5"
        >
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

          <div
            title="Arraste para ajustar a altura"
            className="h-1.5 w-full bg-border-panel/40 hover:bg-accent cursor-row-resize flex justify-center items-center group transition-colors select-none z-20 shrink-0 rounded-full"
            onMouseDown={(e) => {
              e.preventDefault();
              const startY = e.clientY;
              const startHeight = chartHeightPct;
              const containerHeight = window.innerHeight - 85;
              const handleMouseMove = (moveEvent: MouseEvent) => {
                const deltaY = moveEvent.clientY - startY;
                const deltaPct = (deltaY / containerHeight) * 100;
                setChartHeightPct(Math.min(82, Math.max(25, startHeight + deltaPct)));
              };
              const handleMouseUp = () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
              };
              window.addEventListener('mousemove', handleMouseMove);
              window.addEventListener('mouseup', handleMouseUp);
            }}
          >
            <div className="h-0.5 w-10 bg-slate-600 group-hover:bg-white rounded-full" />
          </div>

          <div
            style={{ height: `${100 - chartHeightPct}%` }}
            className="w-full min-h-[120px] flex overflow-hidden gap-1.5"
          >
            <div
              style={{ width: `${signalsWidthPct}%` }}
              className="h-full overflow-hidden bg-bg-panel border border-border-panel rounded-md shadow-sm"
            >
              <SignalsFeed signals={signals} />
            </div>

            <div
              title="Arraste para ajustar largura"
              className="w-1.5 h-full bg-border-panel/40 hover:bg-accent cursor-col-resize flex flex-col justify-center items-center group transition-colors select-none z-10 shrink-0 rounded-full"
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startWidth = signalsWidthPct;
                const leftContainerWidth = (window.innerWidth * leftColWidthPct) / 100;
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaX = moveEvent.clientX - startX;
                  const deltaPct = (deltaX / leftContainerWidth) * 100;
                  setSignalsWidthPct(Math.min(75, Math.max(25, startWidth + deltaPct)));
                };
                const handleMouseUp = () => {
                  window.removeEventListener('mousemove', handleMouseMove);
                  window.removeEventListener('mouseup', handleMouseUp);
                };
                window.addEventListener('mousemove', handleMouseMove);
                window.addEventListener('mouseup', handleMouseUp);
              }}
            >
              <div className="w-0.5 h-6 bg-slate-600 group-hover:bg-white rounded-full" />
            </div>

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

        <div
          title="Arraste para ajustar largura"
          className="w-1.5 h-full bg-border-panel/40 hover:bg-accent cursor-col-resize flex flex-col justify-center items-center group transition-colors select-none z-20 shrink-0 rounded-full"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = leftColWidthPct;
            const handleMouseMove = (moveEvent: MouseEvent) => {
              const deltaX = moveEvent.clientX - startX;
              const deltaPct = (deltaX / window.innerWidth) * 100;
              setLeftColWidthPct(Math.min(82, Math.max(35, startWidth + deltaPct)));
            };
            const handleMouseUp = () => {
              window.removeEventListener('mousemove', handleMouseMove);
              window.removeEventListener('mouseup', handleMouseUp);
            };
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
          }}
        >
          <div className="w-0.5 h-8 bg-slate-600 group-hover:bg-white rounded-full" />
        </div>

        <section
          style={{ width: `${100 - leftColWidthPct}%` }}
          className="flex h-full overflow-hidden gap-1.5"
        >
          <div
            style={{ width: `${domWidthPct}%` }}
            className="h-full overflow-hidden bg-bg-panel border border-border-panel rounded-md shadow-sm"
          >
            <DOMBook book={book} />
          </div>

          <div
            title="Arraste para ajustar largura"
            className="w-1.5 h-full bg-border-panel/40 hover:bg-accent cursor-col-resize flex flex-col justify-center items-center group transition-colors select-none z-10 shrink-0 rounded-full"
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startWidth = domWidthPct;
              const rightContainerWidth = (window.innerWidth * (100 - leftColWidthPct)) / 100;
              const handleMouseMove = (moveEvent: MouseEvent) => {
                const deltaX = moveEvent.clientX - startX;
                const deltaPct = (deltaX / rightContainerWidth) * 100;
                setDomWidthPct(Math.min(75, Math.max(25, startWidth + deltaPct)));
              };
              const handleMouseUp = () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
              };
              window.addEventListener('mousemove', handleMouseMove);
              window.addEventListener('mouseup', handleMouseUp);
            }}
          >
            <div className="w-0.5 h-6 bg-slate-600 group-hover:bg-white rounded-full" />
          </div>

          <div
            style={{ width: `${100 - domWidthPct}%` }}
            className="h-full overflow-hidden bg-bg-panel border border-border-panel rounded-md shadow-sm"
          >
            <TapeReader trades={trades} />
          </div>
        </section>
      </main>

      {/* Layout Mobile */}
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

        <nav className="h-14 bg-surface/95 border-t border-border/80 flex items-center justify-around px-2 z-30 shrink-0 backdrop-blur-md">
          <button
            onClick={() => setActiveMobileTab('chart')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${activeMobileTab === 'chart' ? 'text-accent font-bold scale-105' : 'text-slate-400 hover:text-white'
              }`}
          >
            <BarChart2 className="w-4 h-4" />
            <span className="text-[10px] mt-0.5 font-mono">Gráfico</span>
          </button>

          <button
            onClick={() => setActiveMobileTab('signals')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${activeMobileTab === 'signals' ? 'text-accent font-bold scale-105' : 'text-slate-400 hover:text-white'
              }`}
          >
            <Zap className="w-4 h-4" />
            <span className="text-[10px] mt-0.5 font-mono">Sinais</span>
          </button>

          <button
            onClick={() => setActiveMobileTab('paper')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${activeMobileTab === 'paper' ? 'text-accent font-bold scale-105' : 'text-slate-400 hover:text-white'
              }`}
          >
            <Briefcase className="w-4 h-4" />
            <span className="text-[10px] mt-0.5 font-mono">Operações</span>
          </button>

          <button
            onClick={() => setActiveMobileTab('dom')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${activeMobileTab === 'dom' ? 'text-accent font-bold scale-105' : 'text-slate-400 hover:text-white'
              }`}
          >
            <BookOpen className="w-4 h-4" />
            <span className="text-[10px] mt-0.5 font-mono">DOM</span>
          </button>

          <button
            onClick={() => setActiveMobileTab('tape')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${activeMobileTab === 'tape' ? 'text-accent font-bold scale-105' : 'text-slate-400 hover:text-white'
              }`}
          >
            <Clock className="w-4 h-4" />
            <span className="text-[10px] mt-0.5 font-mono">Tape</span>
          </button>
        </nav>
      </div>

      <AIAdvisorModal
        isOpen={isAdvisorOpen}
        onClose={() => setIsAdvisorOpen(false)}
        pairStats={pairStats}
      />

      <QuantStrategyHealthModal
        isOpen={isQuantHealthOpen}
        onClose={() => setIsQuantHealthOpen(false)}
      />

      <ShadowAuditModal
        isOpen={isShadowAuditOpen}
        onClose={() => setIsShadowAuditOpen(false)}
      />
    </div>
  );
}