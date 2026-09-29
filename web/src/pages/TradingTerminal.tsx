import React, { useState, useEffect } from 'react';
import { useMarketData } from '../hooks/useMarketData';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { AssetSelector } from '../components/Header/AssetSelector';
import { ChartPro } from '../components/Chart/ChartPro';
import { DOMBook } from '../components/DOM/DOMBook';
import { TapeReader } from '../components/Tape/TapeReader';
import { SignalsFeed } from '../components/Signals/SignalsFeed';
import { PaperTradingPanel } from '../components/PaperTrading/PaperTradingPanel';
import { AIAdvisorModal } from '../components/Advisor/AIAdvisorModal';
import { QuantStrategyHealthModal } from '../components/Advisor/QuantStrategyHealthModal';
import { MasterHealthDashboard } from '../components/Advisor/MasterHealthDashboard';
import { ShadowAuditModal } from '../components/ShadowAuditModal';
import { LayaGovernanceControl } from '../components/Header/LayaGovernanceControl';
import { ResponsiveShell } from '../components/Layout/ResponsiveShell';
import { RefreshCw, Activity } from 'lucide-react';

export default function TradingTerminal() {
  const [activeSymbol, setActiveSymbol] = useState<string>('BTC/USDT');
  const [isAdvisorOpen, setIsAdvisorOpen] = useState<boolean>(false);
  const [isQuantHealthOpen, setIsQuantHealthOpen] = useState<boolean>(false);
  const [isMasterHealthOpen, setIsMasterHealthOpen] = useState<boolean>(false);
  const [isShadowAuditOpen, setIsShadowAuditOpen] = useState<boolean>(false);

  // Estados dos Botões Operacionais
  const [trailingStopEnabled, setTrailingStopEnabled] = useState<boolean>(true);
  const [shadowFilterActive, setShadowFilterActive] = useState<boolean>(false);
  const [resetTimer, setResetTimer] = useState<number>(0);

  const { canExecuteOrders } = useBreakpoint();

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

  // ─── 4. CÁLCULO DA BANCA VIVA (LIVE EQUITY EM TEMPO REAL) & MARGENS ─────
  const walletBalance = Number(paperAccount?.balance || 10000);
  const openPositionsList = paperAccount?.openPositions || [];
  const totalUnrealizedPnl = openPositionsList.reduce(
    (acc: number, pos: any) => acc + Number(pos.pnlUsd || pos.unrealizedPnl || 0),
    0
  );
  // Margem total comprometida nas posições abertas
  const totalMarginUsed = openPositionsList.reduce((acc: number, pos: any) => {
    let margin = Number(pos.marginUsd || 0);
    if (!margin && pos.notionalUsd) {
      margin = Number(pos.notionalUsd) / 10;
    }
    if (!margin && pos.qty && (pos.entryPrice || pos.currentPrice)) {
      const price = Number(pos.entryPrice || pos.currentPrice || 0);
      margin = (Number(pos.qty) * price) / 10;
    }
    return acc + (isNaN(margin) ? 0 : margin);
  }, 0);
  // Banca Viva = Caixa + Soma do PnL flutuante de todas as posições abertas
  const liveEquity = Number((walletBalance + totalUnrealizedPnl).toFixed(2));
  const availableMargin = Math.max(0, Number((walletBalance - totalMarginUsed).toFixed(2)));

  // ─── 3. MONITORAMENTO DE PERDA MÁXIMA DIÁRIA & PISO DE BANCA ─────────────
  useEffect(() => {
    const maxDailyLoss = 150.0;     // Teto de perda aberta diária (-$150)
    const minEquityFloor = 9500.0;   // Piso de proteção da banca ($9.500)

    if (totalUnrealizedPnl <= -maxDailyLoss || liveEquity <= minEquityFloor) {
      console.warn(`[CIRCUIT BREAKER VISUAL] ⚠️ Alerta de Risco: PnL Aberto (-$${Math.abs(totalUnrealizedPnl).toFixed(2)}) atingiu o teto diário!`);
    }
  }, [totalUnrealizedPnl, liveEquity]);

  const [sentinelData, setSentinelData] = useState<{
    regime: string;
    predictiveScore: number;
    isCircuitBreakerActive: boolean;
  }>({ regime: 'NEUTRAL_RANGING', predictiveScore: 0, isCircuitBreakerActive: false });

  useEffect(() => {
    fetch('/api/admin/config/toggles', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('mfp_token') || ''}`
      }
    })
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.trailingStopEnabled === 'boolean') {
          setTrailingStopEnabled(data.trailingStopEnabled);
        }
        if (typeof data.shadowFilterActive === 'boolean') {
          setShadowFilterActive(data.shadowFilterActive);
        }
      })
      .catch(() => {});

    // Polling de telemetria do Macro Sentinel
    const fetchSentinel = () => {
      fetch('/api/macro-regime')
        .then((res) => res.json())
        .then((data) => {
          if (data && data.macroSentinel) {
            setSentinelData({
              regime: data.macroSentinel.regime || 'NEUTRAL_RANGING',
              predictiveScore: data.macroSentinel.predictiveScore ?? 0,
              isCircuitBreakerActive: Boolean(data.macroSentinel.isCircuitBreakerActive)
            });
          }
        })
        .catch(() => {});
    };

    fetchSentinel();
    const interval = setInterval(fetchSentinel, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleTrailing = async () => {
    const newState = !trailingStopEnabled;
    setTrailingStopEnabled(newState);
    try {
      await fetch('/api/admin/config/toggles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('mfp_token') || ''}`
        },
        body: JSON.stringify({ trailingStopEnabled: newState })
      });
    } catch (e) {
      console.error('Failed to persist Trailing Stop state:', e);
    }
  };

  const handleToggleShadow = async () => {
    const newState = !shadowFilterActive;
    setShadowFilterActive(newState);
    try {
      await fetch('/api/admin/config/toggles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('mfp_token') || ''}`
        },
        body: JSON.stringify({ shadowFilterActive: newState })
      });
    } catch (e) {
      console.error('Failed to persist Shadow Mode state:', e);
    }
  };

  const handleUpdateBalance = async (newBalance: number) => {
    try {
      const res = await fetch('/api/trading/balance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('mfp_token') || ''}`
        },
        body: JSON.stringify({ balance: newBalance })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.warn(`Erro ao atualizar saldo: ${errorData.error || res.statusText}`);
      }
    } catch (e) {
      console.error('Failed to update balance:', e);
    }
  };

  const handleResetData = async () => {
    if (!window.confirm('Deseja realmente zerar todo o histórico, ordens e banco do Master para $10.000,00 com fechamento automático e aguardar 15s para sincronização?')) {
      return;
    }

    setResetTimer(15);
    const interval = setInterval(() => {
      setResetTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      const res = await fetch('/api/trading/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('mfp_token') || ''}`
        },
        body: JSON.stringify({ masterBalance: 10000, mirrorBalance: 500 })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.warn(`Erro ao resetar sessão: ${errorData.message || res.statusText}`);
      }
    } catch (e: any) {
      console.error('Failed to reset paper data:', e);
    }
  };

  return (
    <>
      <ResponsiveShell
        header={
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
            marginUsed={totalMarginUsed}
            availableMargin={availableMargin}
            onUpdateBalance={handleUpdateBalance}
            onResetData={handleResetData}
          />
        }
        governanceBar={
          <div className="bg-[#0b1120] border-b border-slate-800/80 px-2 sm:px-3 py-1 sm:py-1.5 flex items-center justify-between z-20 shrink-0 text-xs shadow-md overflow-x-auto no-scrollbar gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold hidden xl:inline shrink-0">
                Controle Operacional:
              </span>

              {/* Botão Trailing Stop */}
              <button
                onClick={handleToggleTrailing}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[11px] sm:text-xs font-semibold transition-all shrink-0 ${
                  trailingStopEnabled
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/50 shadow-sm shadow-emerald-950/20'
                    : 'bg-slate-900/90 border-slate-700/80 text-slate-400 hover:bg-slate-800'
                }`}
                title="Alternar Trailing Stop (Runner Mode 100% / Piso 2.3R) vs Alvo Fixo (100% / 2.5R)"
              >
                <span className={`w-2 h-2 rounded-full ${trailingStopEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <span>Trailing: <b className="text-white">{trailingStopEnabled ? 'RUNNER' : 'FIXO'}</b></span>
              </button>

              {/* Botão Shadow Mode */}
              <button
                onClick={handleToggleShadow}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[11px] sm:text-xs font-semibold transition-all shrink-0 ${
                  shadowFilterActive
                    ? 'bg-purple-950/50 border-purple-500/60 text-purple-300 hover:bg-purple-900/60 shadow-sm shadow-purple-950/20'
                    : 'bg-slate-900/90 border-slate-700/80 text-slate-400 hover:bg-slate-800'
                }`}
                title="Alternar Executor Real vs Modo Fantasma"
              >
                <span className={`w-2 h-2 rounded-full ${shadowFilterActive ? 'bg-purple-400 animate-pulse' : 'bg-amber-400'}`} />
                <span>Shadow: <b className="text-white">{shadowFilterActive ? 'REAL' : 'FANTASMA'}</b></span>
              </button>

              {/* Botão Governança Laya */}
              <LayaGovernanceControl />

              {/* Pílula de Telemetria do Macro Sentinel */}
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[11px] sm:text-xs font-semibold shadow-sm transition-all shrink-0 ${
                  sentinelData.isCircuitBreakerActive
                    ? 'bg-rose-950/70 border-rose-500/80 text-rose-300 animate-pulse'
                    : sentinelData.predictiveScore > 20
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                    : sentinelData.predictiveScore < -20
                    ? 'bg-rose-950/40 border-rose-500/50 text-rose-300'
                    : 'bg-slate-900/90 border-slate-700/80 text-slate-300'
                }`}
                title={`Macro Sentinel | Regime: ${sentinelData.regime} | Score: ${sentinelData.predictiveScore} | Circuit Breaker: ${sentinelData.isCircuitBreakerActive ? 'DISPARADO 🛑' : 'SEGURO 🟢'}`}
              >
                <span className={`w-2 h-2 rounded-full ${
                  sentinelData.isCircuitBreakerActive
                    ? 'bg-rose-500 animate-ping'
                    : sentinelData.predictiveScore > 0
                    ? 'bg-emerald-400'
                    : 'bg-amber-400'
                }`} />
                <span>
                  SENTINEL: <b className="text-white">{sentinelData.regime}</b> | CB: <b className={sentinelData.isCircuitBreakerActive ? 'text-rose-400 font-black' : 'text-emerald-400'}>{sentinelData.isCircuitBreakerActive ? 'ATIVO 🛑' : 'SEGURO 🟢'}</b>
                </span>
              </div>

              {/* Botão Dashboard dos 10 Blocos */}
              <button
                onClick={() => setIsMasterHealthOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[11px] sm:text-xs font-semibold transition-all bg-cyan-950/40 border-cyan-500/50 text-cyan-300 hover:bg-cyan-900/60 shadow-sm shadow-cyan-950/20 shrink-0"
                title="Abrir Dashboard dos 10 Blocos e Atribuição Laya v3.0"
              >
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">10 BLOCOS &amp; SAÚDE</span>
                <span className="sm:hidden">10 BLOCOS</span>
              </button>

              {/* Botão Direto Zerar Sessão */}
              <button
                onClick={handleResetData}
                disabled={resetTimer > 0}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[11px] sm:text-xs font-semibold transition-all shrink-0 ${
                  resetTimer > 0
                    ? 'bg-amber-950/60 border-amber-500/60 text-amber-300 cursor-not-allowed'
                    : 'bg-rose-950/40 border-rose-500/50 text-rose-300 hover:bg-rose-900/60 shadow-sm shadow-rose-950/20'
                }`}
                title="Zera histórico, ordens e banco do Master aguardando 15s para sincronização total"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-rose-400 ${resetTimer > 0 ? 'animate-spin' : ''}`} />
                <span>
                  {resetTimer > 0 ? (
                    <span>SYNC: <b className="text-white">{resetTimer}s</b></span>
                  ) : (
                    <span>ZERAR</span>
                  )}
                </span>
              </button>
            </div>

            <div className="hidden lg:flex items-center gap-2.5 text-[11px] font-mono text-slate-400 shrink-0 pl-2">
              <span className="flex items-center gap-1 text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>BingX V2 AO VIVO</span>
              </span>
              <span className="text-slate-500">|</span>
              <span className="flex items-center gap-1 text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Postgres Railway</span>
              </span>
            </div>
          </div>
        }
        chart={
          <ChartPro
            symbol={activeSymbol}
            candles={candles}
            activeCandle={activeCandle}
            signals={signals}
            openPosition={activePosition}
            trailingStopEnabled={trailingStopEnabled}
          />
        }
        dom={<DOMBook book={book} />}
        tape={<TapeReader trades={trades} />}
        radar={<SignalsFeed signals={signals} />}
        operations={
          <PaperTradingPanel
            account={paperAccount}
            activeSymbol={activeSymbol}
            pairStats={pairStats}
            dynamicPairs={dynamicPairs}
            canExecuteOrders={canExecuteOrders}
          />
        }
      />

      <AIAdvisorModal
        isOpen={isAdvisorOpen}
        onClose={() => setIsAdvisorOpen(false)}
        pairStats={pairStats}
      />

      <QuantStrategyHealthModal
        isOpen={isQuantHealthOpen}
        onClose={() => setIsQuantHealthOpen(false)}
      />

      <MasterHealthDashboard
        isOpen={isMasterHealthOpen}
        onClose={() => setIsMasterHealthOpen(false)}
      />

      <ShadowAuditModal
        isOpen={isShadowAuditOpen}
        onClose={() => setIsShadowAuditOpen(false)}
      />
    </>
  );
}
