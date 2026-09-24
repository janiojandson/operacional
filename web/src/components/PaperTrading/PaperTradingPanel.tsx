import React, { useState } from 'react';
import { PaperAccount } from '../../../../shared/paperTypes';
import { PairPerformance, DynamicPairStatus } from '../../../../shared/types';
import { Bot, Zap, Power, Flame, CheckCircle, XCircle } from 'lucide-react';
import { positionRiskSummary } from './positionRiskSummary';

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
      <div className="h-full flex items-center justify-center text-text-muted font-mono text-xs bg-bg-panel">
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
    <div className="flex flex-col h-full bg-bg-panel select-none font-mono overflow-hidden">
      {/* Top Header Metrics */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-bg-panel border-b border-border-panel shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="flex items-center space-x-1 text-accent shrink-0">
            <Bot className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-primary hidden sm:inline">
              Operações
            </span>
          </div>

          <div className="flex space-x-1 bg-bg-app p-0.5 rounded border border-border-panel text-[10px]">
            <button
              onClick={() => setTab('AUTONOMY')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded transition-all whitespace-nowrap ${
                tab === 'AUTONOMY' ? 'bg-gradient-to-r from-accent to-purple-600 text-white font-bold shadow-sm' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Zap className="w-3 h-3 text-amber-400 shrink-0" />
              <span>Autonomia IA</span>
            </button>
            <button
              onClick={() => setTab('POSITIONS')}
              className={`px-2.5 py-1 rounded transition-all whitespace-nowrap ${
                tab === 'POSITIONS' ? 'bg-accent text-white font-bold shadow-sm' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Posições ({account.openPositions.length})
            </button>
            <button
              onClick={() => setTab('HISTORY')}
              className={`px-2.5 py-1 rounded transition-all whitespace-nowrap ${
                tab === 'HISTORY' ? 'bg-accent text-white font-bold shadow-sm' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Histórico ({account.history.length})
            </button>
          </div>
        </div>

        {/* Account Financials */}
        <div className="flex items-center space-x-3 text-xs shrink-0">
          <div className="flex items-center space-x-1">
            <span className="text-text-muted text-[10px]">PNL:</span>
            <span className={`font-bold ${account.realizedPnl >= 0 ? 'text-trade-green' : 'text-trade-red'}`}>
              {account.realizedPnl >= 0 ? `+$${account.realizedPnl.toFixed(2)}` : `-$${Math.abs(account.realizedPnl).toFixed(2)}`}
            </span>
          </div>

          <div className="flex items-center space-x-1">
            <span className="text-text-muted text-[10px]">WIN:</span>
            <span className="font-bold text-amber-400">{account.winRate}%</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-2 text-xs no-scrollbar">
        
        {/* Autonomy & Adaptive Power Tab */}
        {tab === 'AUTONOMY' && (
          <div className="space-y-2">
            <div className="flex flex-col space-y-1 text-text-muted px-2.5 py-1.5 bg-bg-app rounded-md border border-border-panel">
              <div className="flex items-center justify-between text-[11px] flex-wrap gap-1">
                <span className="font-bold text-text-primary">CONTROLE TERMODINÂMICO & POTÊNCIA DA IA (1.5x A 5.0x)</span>
                <span className="text-accent font-bold text-[10px] px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30">Auto-Adaptação Ativa</span>
              </div>
              <p className="text-[10px] text-text-muted leading-relaxed font-sans">
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

                let cardBorderClass = 'bg-bg-app/70 border-border-panel';
                if (isGodMode) cardBorderClass = 'bg-gradient-to-r from-purple-950/40 via-accent/20 to-amber-950/40 border-amber-400 shadow-lg shadow-amber-500/20';
                else if (isGalactic) cardBorderClass = 'bg-indigo-950/30 border-purple-400 shadow-md shadow-purple-500/20';
                else if (isSupernova) cardBorderClass = 'bg-rose-950/30 border-rose-400 shadow-md shadow-rose-500/20';
                else if (isMaxExtract) cardBorderClass = 'bg-accent/15 border-accent shadow-md shadow-accent-glow/20';
                else if (!pair.isActiveForTrading) cardBorderClass = 'bg-bg-app/40 border-dashed border-border-panel opacity-60';

                return (
                  <div
                    key={pair.symbol}
                    className={`p-2 rounded-md border transition-all flex items-center justify-between gap-2 ${cardBorderClass}`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                      <button
                        onClick={() => handleTogglePair(pair.symbol, pair.isActiveForTrading)}
                        className={`p-1.5 rounded shrink-0 transition-colors ${
                          pair.isActiveForTrading
                            ? 'bg-trade-green/20 text-trade-green hover:bg-trade-green/30'
                            : 'bg-trade-red/20 text-trade-red hover:bg-trade-red/30'
                        }`}
                        title={pair.isActiveForTrading ? 'Clique para pausar par' : 'Clique para reativar par'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                          <span className="font-bold text-text-primary text-xs">{pair.symbol}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-bg-app border border-border-panel text-text-muted">
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
                        <p className="text-[10px] text-text-muted mt-0.5 font-sans truncate">
                          {pair.actionReason}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 text-right shrink-0">
                      <div>
                        <div className="text-[9px] text-text-muted">SCORE</div>
                        <div className="font-bold text-text-primary">{pair.efficiencyScore}/100</div>
                      </div>

                      <div>
                        <div className="text-[9px] text-text-muted">POTÊNCIA</div>
                        <div className={`font-bold ${isGodMode ? 'text-amber-300 font-black text-xs' : (isGalactic ? 'text-purple-300' : (isMaxExtract ? 'text-amber-400' : 'text-accent'))}`}>
                          {pair.powerMultiplier}x
                        </div>
                      </div>

                      <div className="w-12">
                        <div className="text-[9px] text-text-muted">WIN</div>
                        <div className="font-bold text-text-primary">{stat?.winRate || 0}%</div>
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
            <div className="h-full flex items-center justify-center text-text-muted text-xs py-6">
              Aguardando confirmação de sinal de fluxo para nova entrada a mercado...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {account.openPositions.map((pos) => {
                const isBuy = pos.type === 'BUY';
                const isProfit = pos.pnlUsd >= 0;
                const sizing = positionRiskSummary(pos);

                return (
                  <div
                    key={pos.id}
                    className="p-2.5 rounded-md bg-bg-app/90 border border-border-panel flex flex-col justify-between space-y-2 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-text-primary text-xs">{pos.symbol}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${isBuy ? 'bg-trade-green/20 text-trade-green border border-trade-green/30' : 'bg-trade-red/20 text-trade-red border border-trade-red/30'}`}>
                          {isBuy ? 'Posição (Buy)' : 'Posição (Sell)'}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30">
                          10x ISOLADA
                        </span>
                      </div>
                      <div className={`font-bold text-xs ${isProfit ? 'text-trade-green' : 'text-trade-red'}`}>
                        {isProfit ? `+$${pos.pnlUsd.toFixed(2)}` : `-$${Math.abs(pos.pnlUsd).toFixed(2)}`} ({pos.pnlPct}%)
                      </div>
                    </div>

                    <div className="grid grid-cols-3 text-[10px] bg-bg-panel p-1.5 rounded border border-border-panel text-center">
                      <div>
                        <span className="text-text-muted text-[9px] block">ENTRADA</span>
                        <span className="text-text-primary font-bold">${pos.entryPrice.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-trade-green text-[9px] block">ALVO (TP)</span>
                        <span className="text-trade-green font-bold">${pos.takeProfit.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-trade-red text-[9px] block">STOP (SL)</span>
                        <span className="text-trade-red font-bold">${pos.stopLoss.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 text-[9px] bg-slate-950/40 p-1.5 rounded border border-border-panel text-center">
                      <div><span className="text-text-muted block">NOTIONAL</span><span className="text-accent font-bold">{sizing.notionalUsd}</span></div>
                      <div><span className="text-text-muted block">RISCO</span><span className="text-amber-400 font-bold">{sizing.riskUsd}</span></div>
                      <div><span className="text-text-muted block">MARGEM</span><span className="text-text-primary font-bold">{sizing.marginUsd}</span></div>
                      <div><span className="text-text-muted block">EXPOSIÇÃO</span><span className="text-purple-300 font-bold">{sizing.exposurePct}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* History Tab */}
        {tab === 'HISTORY' && (
          <div className="space-y-1 divide-y divide-border-panel/40">
            {account.history.length === 0 ? (
              <div className="h-full flex items-center justify-center text-text-muted text-xs py-6">
                Nenhuma operação finalizada na sessão.
              </div>
            ) : (
              account.history.map((hist: { id: string; status: string; symbol: string; type: string; entryPrice: number; currentPrice: number; pnlUsd: number; netPnl?: number; fee?: number; pnlPct: number; powerMultiplier: number; temperature: string; signalReason: string }) => {
                const isTp = hist.status === 'CLOSED_TP';
                const netVal = hist.netPnl ?? hist.pnlUsd;
                const feeVal = hist.fee ?? 0;
                return (
                  <div key={hist.id} className="flex items-center justify-between py-1.5 px-2 hover:bg-surface-hover/40 text-[11px] rounded transition-colors">
                    <div className="flex items-center space-x-2">
                      {isTp ? <CheckCircle className="w-3.5 h-3.5 text-trade-green shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-trade-red shrink-0" />}
                      <span className="font-bold text-text-primary">{hist.symbol}</span>
                      <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${hist.type === 'BUY' ? 'text-trade-green bg-trade-green/10' : 'text-trade-red bg-trade-red/10'}`}>
                        {hist.type === 'BUY' ? 'BUY' : 'SELL'}
                      </span>
                    </div>

                    <div className="text-text-muted text-[10px] hidden sm:block">
                      ${hist.entryPrice.toLocaleString()} → ${hist.currentPrice.toLocaleString()}
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="text-text-muted text-[9px] hidden sm:inline">fee ${feeVal.toFixed(2)}</span>
                      <span className={`font-bold ${netVal >= 0 ? 'text-trade-green' : 'text-trade-red'}`}>
                        {netVal >= 0 ? `+$${netVal.toFixed(2)}` : `-$${Math.abs(netVal).toFixed(2)}`}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${isTp ? 'bg-trade-green/20 text-trade-green' : 'bg-trade-red/20 text-trade-red'}`}>
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
