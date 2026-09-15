import React, { useState } from 'react';
import { PaperAccount } from '../../../shared/paperTypes';
import { PairPerformance } from '../../../../server/src/engine/pairPerformanceTracker';
import { DynamicPairStatus } from '../../../../server/src/engine/autoPairSelectorEngine';
import { Bot, Zap, Power, Flame, CheckCircle, XCircle } from 'lucide-react';

interface PaperTradingPanelProps {
  account: PaperAccount | null;
  activeSymbol: string;
  pairStats: PairPerformance[];
  dynamicPairs: DynamicPairStatus[];
  clients?: any[];
  clientLogs?: any[];
}

export const PaperTradingPanel: React.FC<PaperTradingPanelProps> = ({ 
  account, 
  activeSymbol, 
  pairStats,
  dynamicPairs
}) => {
  const [tab, setTab] = useState<'AUTONOMY' | 'POSITIONS' | 'HISTORY'>('AUTONOMY');

  if (!account) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 font-mono text-xs bg-surface/20">
        Iniciando motor de execução quantitativa institucional...
      </div>
    );
  }

  const handleTogglePair = async (symbol: string, currentActive: boolean) => {
    try {
      await fetch(`/api/pairs/${encodeURIComponent(symbol)}/toggle`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('mfp_token')}`
        },
        body: JSON.stringify({ active: !currentActive })
      });
    } catch (e) {
      console.error('Toggle failed:', e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface/25 border-t border-border/80 select-none font-mono overflow-hidden">
      {/* Top Header Metrics */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface/70 border-b border-border/70 shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="flex items-center space-x-1 text-accent shrink-0">
            <Bot className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-100 hidden sm:inline">
              Operações
            </span>
          </div>

          <div className="flex space-x-1 bg-background/60 p-0.5 rounded-lg border border-border/60 text-[10px]">
            <button
              onClick={() => setTab('AUTONOMY')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md transition-all whitespace-nowrap ${
                tab === 'AUTONOMY' ? 'bg-gradient-to-r from-accent to-purple-600 text-white font-bold shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Zap className="w-3 h-3 text-amber-400 shrink-0" />
              <span>Autonomia IA</span>
            </button>
            <button
              onClick={() => setTab('POSITIONS')}
              className={`px-2.5 py-1 rounded-md transition-all whitespace-nowrap ${
                tab === 'POSITIONS' ? 'bg-accent text-white font-bold shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Posições ({account.openPositions.length})
            </button>
            <button
              onClick={() => setTab('HISTORY')}
              className={`px-2.5 py-1 rounded-md transition-all whitespace-nowrap ${
                tab === 'HISTORY' ? 'bg-accent text-white font-bold shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Histórico ({account.history.length})
            </button>
          </div>
        </div>

        {/* Account Financials */}
        <div className="flex items-center space-x-3 text-xs shrink-0">
          <div className="flex items-center space-x-1">
            <span className="text-slate-400 text-[10px]">PNL:</span>
            <span className={`font-bold ${account.realizedPnl >= 0 ? 'text-buy' : 'text-sell'}`}>
              {account.realizedPnl >= 0 ? `+$${account.realizedPnl.toFixed(2)}` : `-$${Math.abs(account.realizedPnl).toFixed(2)}`}
            </span>
          </div>

          <div className="flex items-center space-x-1">
            <span className="text-slate-400 text-[10px]">WIN:</span>
            <span className="font-bold text-amber-400">{account.winRate}%</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-2 text-xs no-scrollbar">
        
        {/* Autonomy & Adaptive Power Tab */}
        {tab === 'AUTONOMY' && (
          <div className="space-y-2">
            <div className="flex flex-col space-y-1 text-slate-400 px-2.5 py-2 bg-surface/50 rounded-xl border border-border/40">
              <div className="flex items-center justify-between text-[11px] flex-wrap gap-1">
                <span className="font-bold text-slate-200">CONTROLE TERMODINÂMICO & POTÊNCIA DA IA (1.5x A 5.0x)</span>
                <span className="text-accent font-bold text-[10px] px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30">Auto-Adaptação Ativa</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                A IA analisa em tempo real o fluxo de ordens (Order Flow), desequilíbrio de book e densidade institucional de cada par, operando de <span className="text-accent font-semibold">1.5x</span> até <span className="text-amber-400 font-semibold">5.0x</span> em confluências de altíssima probabilidade.
              </p>
            </div>

            <div className="space-y-1.5">
              {dynamicPairs.map((pair) => {
                const stat = pairStats.find(s => s.symbol === pair.symbol);
                const isGodMode = pair.powerMultiplier >= 5.0;
                const isGalactic = pair.powerMultiplier >= 4.0 && pair.powerMultiplier < 5.0;
                const isSupernova = pair.powerMultiplier >= 3.0 && pair.powerMultiplier < 4.0;
                const isMaxExtract = pair.powerMultiplier >= 2.0 && pair.powerMultiplier < 3.0;

                let cardBorderClass = 'bg-surface/80 border-border/80';
                if (isGodMode) cardBorderClass = 'bg-gradient-to-r from-purple-950/40 via-accent/20 to-amber-950/40 border-amber-400 shadow-lg shadow-amber-500/20';
                else if (isGalactic) cardBorderClass = 'bg-indigo-950/30 border-purple-400 shadow-md shadow-purple-500/20';
                else if (isSupernova) cardBorderClass = 'bg-rose-950/30 border-rose-400 shadow-md shadow-rose-500/20';
                else if (isMaxExtract) cardBorderClass = 'bg-accent/15 border-accent shadow-md shadow-accent-glow/20';
                else if (!pair.isActiveForTrading) cardBorderClass = 'bg-surface/30 border-dashed border-border/40 opacity-60';

                return (
                  <div
                    key={pair.symbol}
                    className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${cardBorderClass}`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                      <button
                        onClick={() => handleTogglePair(pair.symbol, pair.isActiveForTrading)}
                        className={`p-1.5 rounded-lg shrink-0 transition-colors ${
                          pair.isActiveForTrading
                            ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                        }`}
                        title={pair.isActiveForTrading ? 'Clique para pausar par' : 'Clique para reativar par'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                          <span className="font-bold text-white text-xs">{pair.symbol}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-background/80 border border-border text-slate-300">
                            {pair.regime.replace('_', ' ')}
                          </span>

                          {/* Temperatura / Potência Badge */}
                          {isGodMode && (
                            <span className="flex items-center text-[9px] px-2 py-0.5 rounded bg-gradient-to-r from-amber-500/30 to-purple-500/30 text-amber-300 border border-amber-400 font-extrabold animate-pulse">
                              ⚡ INSTITUCIONAL MÁX (5.0x)
                            </span>
                          )}
                          {isGalactic && (
                            <span className="flex items-center text-[9px] px-1.5 py-0.2 rounded bg-purple-500/25 text-purple-300 border border-purple-400 font-bold animate-pulse">
                              🌌 ALTA CONFLUÊNCIA (4.0x)
                            </span>
                          )}
                          {isSupernova && (
                            <span className="flex items-center text-[9px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold">
                              💥 POWER (3.0x)
                            </span>
                          )}
                          {isMaxExtract && (
                            <span className="flex items-center text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                              <Flame className="w-3 h-3 mr-0.5 text-amber-400 inline" />
                              MÁXIMA (2.0x)
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-sans truncate">
                          {pair.actionReason}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 text-right shrink-0">
                      <div>
                        <div className="text-[9px] text-slate-400">SCORE</div>
                        <div className="font-bold text-slate-200">{pair.efficiencyScore}/100</div>
                      </div>

                      <div>
                        <div className="text-[9px] text-slate-400">POTÊNCIA</div>
                        <div className={`font-bold ${isGodMode ? 'text-amber-300 font-black text-xs' : (isGalactic ? 'text-purple-300' : (isMaxExtract ? 'text-amber-400' : 'text-accent'))}`}>
                          {pair.powerMultiplier}x
                        </div>
                      </div>

                      <div className="w-12">
                        <div className="text-[9px] text-slate-400">WIN</div>
                        <div className="font-bold text-slate-300">{stat?.winRate || 0}%</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Positions Tab */}
        {tab === 'POSITIONS' && (
          account.openPositions.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-xs py-6">
              Aguardando confirmação de sinal de fluxo para nova entrada a mercado...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {account.openPositions.map((pos) => {
                const isBuy = pos.type === 'BUY';
                const isProfit = pos.pnlUsd >= 0;

                return (
                  <div
                    key={pos.id}
                    className="p-2.5 rounded-xl bg-surface/90 border border-border/80 flex flex-col justify-between space-y-2 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white text-xs">{pos.symbol}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${isBuy ? 'bg-buy/20 text-buy border border-buy/30' : 'bg-sell/20 text-sell border border-sell/30'}`}>
                          {isBuy ? 'Posição (Buy)' : 'Posição (Sell)'}
                        </span>
                      </div>
                      <div className={`font-bold text-xs ${isProfit ? 'text-buy' : 'text-sell'}`}>
                        {isProfit ? `+$${pos.pnlUsd.toFixed(2)}` : `-$${Math.abs(pos.pnlUsd).toFixed(2)}`} ({pos.pnlPct}%)
                      </div>
                    </div>

                    <div className="grid grid-cols-3 text-[10px] bg-background/60 p-1.5 rounded-lg border border-border/40 text-center">
                      <div>
                        <span className="text-slate-400 text-[9px] block">ENTRADA</span>
                        <span className="text-slate-200 font-bold">${pos.entryPrice.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-emerald-400 text-[9px] block">ALVO (TP)</span>
                        <span className="text-emerald-400 font-bold">${pos.takeProfit.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-rose-400 text-[9px] block">STOP (SL)</span>
                        <span className="text-rose-400 font-bold">${pos.stopLoss.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* History Tab */}
        {tab === 'HISTORY' && (
          <div className="space-y-1 divide-y divide-border/30">
            {account.history.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs py-6">
                Nenhuma operação finalizada na sessão.
              </div>
            ) : (
              account.history.map((hist) => {
                const isTp = hist.status === 'CLOSED_TP';
                return (
                  <div key={hist.id} className="flex items-center justify-between py-1.5 px-2 hover:bg-surface-hover/40 text-[11px] rounded-lg transition-colors">
                    <div className="flex items-center space-x-2">
                      {isTp ? <CheckCircle className="w-3.5 h-3.5 text-buy shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-sell shrink-0" />}
                      <span className="font-bold text-white">{hist.symbol}</span>
                      <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${hist.type === 'BUY' ? 'text-buy bg-buy/10' : 'text-sell bg-sell/10'}`}>
                        {hist.type === 'BUY' ? 'BUY' : 'SELL'}
                      </span>
                    </div>

                    <div className="text-slate-400 text-[10px] hidden sm:block">
                      ${hist.entryPrice.toLocaleString()} → ${hist.currentPrice.toLocaleString()}
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className={`font-bold ${isTp ? 'text-buy' : 'text-sell'}`}>
                        {isTp ? `+$${hist.pnlUsd.toFixed(2)}` : `-$${Math.abs(hist.pnlUsd).toFixed(2)}`}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${isTp ? 'bg-buy/20 text-buy' : 'bg-sell/20 text-sell'}`}>
                        {isTp ? 'TP' : 'SL'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
