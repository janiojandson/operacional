import React, { useState } from 'react';
import { PaperAccount } from '../../../shared/paperTypes';
import { PairPerformance } from '../../../../server/src/engine/pairPerformanceTracker';
import { DynamicPairStatus } from '../../../../server/src/engine/autoPairSelectorEngine';
import { ClientAccountConfig, ClientTradeLog } from '../../../shared/clientTypes';
import { Bot, Zap, Power, Flame, CheckCircle, XCircle, Users, ShieldAlert, Key, Plus, Phone } from 'lucide-react';

interface PaperTradingPanelProps {
  account: PaperAccount | null;
  activeSymbol: string;
  pairStats: PairPerformance[];
  dynamicPairs: DynamicPairStatus[];
  clients: ClientAccountConfig[];
  clientLogs: ClientTradeLog[];
}

export const PaperTradingPanel: React.FC<PaperTradingPanelProps> = ({ 
  account, 
  activeSymbol, 
  pairStats,
  dynamicPairs,
  clients,
  clientLogs
}) => {
  const [tab, setTab] = useState<'AUTONOMY' | 'CLIENTS' | 'POSITIONS' | 'HISTORY'>('AUTONOMY');
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newExchange, setNewExchange] = useState<'BYBIT' | 'BINANCE'>('BYBIT');
  const [newApiKey, setNewApiKey] = useState('');
  const [newMaxLoss, setNewMaxLoss] = useState(250);
  const [newMaxProfit, setNewMaxProfit] = useState(500);
  const [newLot, setNewLot] = useState(1000);
  const [newPhone, setNewPhone] = useState('5511999999999');

  if (!account) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 font-mono text-xs bg-surface/20">
        Iniciando motor de simulação sem repaint...
      </div>
    );
  }

  const handleTogglePair = async (symbol: string, currentActive: boolean) => {
    try {
      await fetch(`http://localhost:4000/api/pairs/${encodeURIComponent(symbol)}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive })
      });
    } catch (e) {
      console.error('Toggle failed:', e);
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName) return;

    const newConfig: ClientAccountConfig = {
      id: `client-${Date.now()}`,
      clientName: newClientName,
      exchange: newExchange,
      apiKey: newApiKey || 'api_key_hidden_***',
      apiSecret: 'api_secret_hidden_***',
      isActive: true,
      maxDailyLossUsd: Number(newMaxLoss),
      maxDailyProfitTargetUsd: Number(newMaxProfit),
      currentDailyPnl: 0,
      maxOpenPositions: 2,
      fixedLotUsd: Number(newLot),
      copyAiAutonomy: true,
      notificationPhone: newPhone
    };

    try {
      await fetch('http://localhost:4000/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      setShowAddClient(false);
      setNewClientName('');
    } catch (err) {
      console.error('Failed to create client:', err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface/30 border-t border-border/80 select-none font-mono">
      {/* Top Header Metrics */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface/70 border-b border-border/70">
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 text-accent">
            <Bot className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-100">
              Operações
            </span>
          </div>

          <div className="flex space-x-1 bg-background/60 p-0.5 rounded border border-border/60 text-[10px]">
            <button
              onClick={() => setTab('AUTONOMY')}
              className={`flex items-center space-x-1 px-2 py-0.5 rounded transition-colors ${
                tab === 'AUTONOMY' ? 'bg-gradient-to-r from-accent to-purple-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Autonomia IA</span>
            </button>
            <button
              onClick={() => setTab('CLIENTS')}
              className={`flex items-center space-x-1 px-2 py-0.5 rounded transition-colors ${
                tab === 'CLIENTS' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3 h-3" />
              <span>Clientes & Proteções ({clients.length})</span>
            </button>
            <button
              onClick={() => setTab('POSITIONS')}
              className={`px-2 py-0.5 rounded transition-colors ${
                tab === 'POSITIONS' ? 'bg-accent text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Abertas ({account.openPositions.length})
            </button>
            <button
              onClick={() => setTab('HISTORY')}
              className={`px-2 py-0.5 rounded transition-colors ${
                tab === 'HISTORY' ? 'bg-accent text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Histórico ({account.history.length})
            </button>
          </div>
        </div>

        {/* Account Financials */}
        <div className="flex items-center space-x-3 text-xs">
          <div className="flex items-center space-x-1">
            <span className="text-slate-400 text-[10px]">PNL:</span>
            <span className={`font-bold ${account.realizedPnl >= 0 ? 'text-buy' : 'text-sell'}`}>
              {account.realizedPnl >= 0 ? `+$${account.realizedPnl}` : `-$${Math.abs(account.realizedPnl)}`}
            </span>
          </div>

          <div className="flex items-center space-x-1">
            <span className="text-slate-400 text-[10px]">WIN:</span>
            <span className="font-bold text-amber-400">{account.winRate}%</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-2 text-xs">
        
        {/* Clients & Risk Protection Tab */}
        {tab === 'CLIENTS' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400">
                REPLICAÇÃO DE CONTAS CLIENTES COM PROTEÇÃO DIÁRIA DE LOSS / GAIN
              </span>
              <button
                onClick={() => setShowAddClient(!showAddClient)}
                className="flex items-center space-x-1 px-2 py-0.5 rounded bg-accent/20 hover:bg-accent/30 text-accent border border-accent/30 text-[10px] font-bold"
              >
                <Plus className="w-3 h-3" />
                <span>Conectar Nova Conta API</span>
              </button>
            </div>

            {/* Modal/Form Add Client */}
            {showAddClient && (
              <form onSubmit={handleCreateClient} className="p-3 bg-surface border border-accent/40 rounded-lg space-y-2 text-[11px] animate-fadeIn">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-slate-400 text-[9px] block">NOME DO CLIENTE</label>
                    <input 
                      type="text" 
                      value={newClientName} 
                      onChange={e => setNewClientName(e.target.value)} 
                      placeholder="Ex: Trader João"
                      className="w-full bg-background border border-border px-2 py-1 rounded text-white text-xs font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-[9px] block">EXCHANGE</label>
                    <select 
                      value={newExchange} 
                      onChange={e => setNewExchange(e.target.value as any)}
                      className="w-full bg-background border border-border px-2 py-1 rounded text-white text-xs font-mono"
                    >
                      <option value="BYBIT">Bybit (Futures/Spot)</option>
                      <option value="BINANCE">Binance (Futures/Spot)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 text-[9px] block">CHAVE API (READ+TRADE ONLY)</label>
                    <input 
                      type="text" 
                      value={newApiKey} 
                      onChange={e => setNewApiKey(e.target.value)} 
                      placeholder="bybit_api_key_***"
                      className="w-full bg-background border border-border px-2 py-1 rounded text-white text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="text-rose-400 text-[9px] block">STOP LOSS DIÁRIO ($)</label>
                    <input 
                      type="number" 
                      value={newMaxLoss} 
                      onChange={e => setNewMaxLoss(Number(e.target.value))}
                      className="w-full bg-background border border-border px-2 py-1 rounded text-rose-400 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-emerald-400 text-[9px] block">META LUCRO DIÁRIA ($)</label>
                    <input 
                      type="number" 
                      value={newMaxProfit} 
                      onChange={e => setNewMaxProfit(Number(e.target.value))}
                      className="w-full bg-background border border-border px-2 py-1 rounded text-emerald-400 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-accent text-[9px] block">LOTE BASE ($)</label>
                    <input 
                      type="number" 
                      value={newLot} 
                      onChange={e => setNewLot(Number(e.target.value))}
                      className="w-full bg-background border border-border px-2 py-1 rounded text-accent text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-[9px] block">WHATSAPP NOTIFICAÇÃO</label>
                    <input 
                      type="text" 
                      value={newPhone} 
                      onChange={e => setNewPhone(e.target.value)}
                      className="w-full bg-background border border-border px-2 py-1 rounded text-slate-300 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-1">
                  <button type="button" onClick={() => setShowAddClient(false)} className="px-3 py-1 rounded bg-surface hover:bg-surface-hover text-slate-400">
                    Cancelar
                  </button>
                  <button type="submit" className="px-3 py-1 rounded bg-accent hover:bg-accent/90 text-white font-bold">
                    Salvar e Ativar Proteções
                  </button>
                </div>
              </form>
            )}

            {/* Clients List */}
            <div className="space-y-2">
              {clients.map(c => (
                <div key={c.id} className="p-2.5 rounded-lg bg-surface/80 border border-border/80 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded bg-emerald-500/15 text-emerald-400">
                      <Key className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white text-xs">{c.clientName}</span>
                        <span className="text-[9px] px-1.5 rounded bg-accent/20 text-accent font-semibold">{c.exchange}</span>
                        <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1 rounded">ATIVO 24/7</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 flex space-x-3">
                        <span>Lote Base: ${c.fixedLotUsd}</span>
                        <span>Trava Loss: <strong className="text-rose-400">-${c.maxDailyLossUsd}</strong></span>
                        <span>Trava Gain: <strong className="text-emerald-400">+${c.maxDailyProfitTargetUsd}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right text-[11px]">
                    <div className="text-[9px] text-slate-400">PNL DIÁRIO ATUAL</div>
                    <div className={`font-bold ${c.currentDailyPnl >= 0 ? 'text-buy' : 'text-sell'}`}>
                      {c.currentDailyPnl >= 0 ? `+$${c.currentDailyPnl}` : `-$${Math.abs(c.currentDailyPnl)}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Client Real-time Execution Logs */}
            <div className="mt-3">
              <span className="text-[9px] text-slate-400 font-bold block mb-1">LOG DE DISPARO EM TEMPO REAL (CLIENTES):</span>
              <div className="space-y-1 max-h-32 overflow-y-auto divide-y divide-border/20 bg-background/50 p-1.5 rounded border border-border/40 text-[10px]">
                {clientLogs.length === 0 ? (
                  <div className="text-slate-500 text-center py-2">Nenhum evento de cliente disparado ainda.</div>
                ) : (
                  clientLogs.map(l => (
                    <div key={l.id} className="py-1 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {l.status === 'EXECUTED' ? <CheckCircle className="w-3 h-3 text-buy" /> : <ShieldAlert className="w-3 h-3 text-rose-400" />}
                        <span className="font-bold text-white">{l.symbol}</span>
                        <span className="text-slate-300 font-sans">{l.reason}</span>
                      </div>
                      <span className="text-slate-500 text-[9px]">{new Date(l.executedAt).toLocaleTimeString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Autonomy & Adaptive Power Tab */}
        {tab === 'AUTONOMY' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
              <span>CONTROLE DINÂMICO DE PARES (SELEÇÃO DA IA + POTÊNCIA ADAPTATIVA)</span>
              <span className="text-accent">Auto-Adaptação Ativa</span>
            </div>

            <div className="space-y-1.5">
              {dynamicPairs.map((pair) => {
                const stat = pairStats.find(s => s.symbol === pair.symbol);
                const isMaxExtract = pair.powerMultiplier >= 2.0;

                return (
                  <div
                    key={pair.symbol}
                    className={`p-2 rounded border transition-all flex items-center justify-between ${
                      pair.isActiveForTrading
                        ? (isMaxExtract ? 'bg-accent/15 border-accent shadow-md shadow-accent-glow/20' : 'bg-surface/80 border-border/80')
                        : 'bg-surface/30 border-dashed border-border/40 opacity-60'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => handleTogglePair(pair.symbol, pair.isActiveForTrading)}
                        className={`p-1.5 rounded transition-colors ${
                          pair.isActiveForTrading
                            ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                        }`}
                        title={pair.isActiveForTrading ? 'Clique para pausar par' : 'Clique para reativar par'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>

                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-white text-xs">{pair.symbol}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-background/80 border border-border text-slate-300">
                            {pair.regime.replace('_', ' ')}
                          </span>
                          {isMaxExtract && (
                            <span className="flex items-center text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold animate-pulse">
                              <Flame className="w-3 h-3 mr-0.5 text-amber-400 inline" />
                              EXTRAÇÃO MÁXIMA
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-sans truncate max-w-sm">
                          {pair.actionReason}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4 text-right">
                      <div>
                        <div className="text-[9px] text-slate-400">SCORE EFICÁCIA</div>
                        <div className="font-bold text-slate-200">{pair.efficiencyScore}/100</div>
                      </div>

                      <div>
                        <div className="text-[9px] text-slate-400">POTÊNCIA / MÃO</div>
                        <div className={`font-bold ${isMaxExtract ? 'text-amber-400' : 'text-accent'}`}>
                          {pair.powerMultiplier}x (${pair.recommendedAllocationUsd.toLocaleString()})
                        </div>
                      </div>

                      <div className="w-16">
                        <div className="text-[9px] text-slate-400">WIN RATE</div>
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
              Aguardando confirmação de sinal de fluxo para nova entrada...
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {account.openPositions.map((pos) => {
                const isBuy = pos.type === 'BUY';
                const isProfit = pos.pnlUsd >= 0;

                return (
                  <div
                    key={pos.id}
                    className="p-2 rounded bg-surface/90 border border-border/80 flex flex-col justify-between space-y-1.5 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white text-xs">{pos.symbol}</span>
                        <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${isBuy ? 'bg-buy/20 text-buy border border-buy/30' : 'bg-sell/20 text-sell border border-sell/30'}`}>
                          {pos.type}
                        </span>
                      </div>
                      <div className={`font-bold text-xs ${isProfit ? 'text-buy' : 'text-sell'}`}>
                        {isProfit ? `+$${pos.pnlUsd}` : `-$${Math.abs(pos.pnlUsd)}`} ({pos.pnlPct}%)
                      </div>
                    </div>

                    <div className="grid grid-cols-3 text-[10px] bg-background/50 p-1 rounded border border-border/40">
                      <div>
                        <span className="text-slate-400 text-[9px] block">ENTRADA</span>
                        <span className="text-slate-200">${pos.entryPrice.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-emerald-400 text-[9px] block">ALVO (TP)</span>
                        <span className="text-emerald-400 font-semibold">${pos.takeProfit.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-rose-400 text-[9px] block">STOP (SL)</span>
                        <span className="text-rose-400 font-semibold">${pos.stopLoss.toLocaleString()}</span>
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
                Nenhuma operação finalizada ainda.
              </div>
            ) : (
              account.history.map((hist) => {
                const isTp = hist.status === 'CLOSED_TP';
                return (
                  <div key={hist.id} className="flex items-center justify-between py-1 px-2 hover:bg-surface-hover/40 text-[11px]">
                    <div className="flex items-center space-x-1.5">
                      {isTp ? <CheckCircle className="w-3.5 h-3.5 text-buy" /> : <XCircle className="w-3.5 h-3.5 text-sell" />}
                      <span className="font-bold text-white">{hist.symbol}</span>
                      <span className={`text-[9px] px-1 rounded ${hist.type === 'BUY' ? 'text-buy bg-buy/10' : 'text-sell bg-sell/10'}`}>
                        {hist.type}
                      </span>
                    </div>

                    <div className="text-slate-400 text-[10px]">
                      ${hist.entryPrice.toLocaleString()} → ${hist.currentPrice.toLocaleString()}
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className={`font-bold ${isTp ? 'text-buy' : 'text-sell'}`}>
                        {isTp ? `+$${hist.pnlUsd}` : `-$${Math.abs(hist.pnlUsd)}`}
                      </span>
                      <span className={`text-[9px] px-1 py-0.5 rounded font-semibold ${isTp ? 'bg-buy/20 text-buy' : 'bg-sell/20 text-sell'}`}>
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
