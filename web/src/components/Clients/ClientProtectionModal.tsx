import React, { useState, useEffect } from 'react';
import { Shield, Plus, Lock, Unlock, Trash2, Users, DollarSign, Clock, AlertTriangle, CheckCircle, X, Sparkles, Send, PhoneCall, RefreshCw } from 'lucide-react';
import { ClientProtectionAccount } from '../../../../shared/types';

interface ClientProtectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients?: ClientProtectionAccount[];
  onRefresh?: () => void;
}

export const ClientProtectionModal: React.FC<ClientProtectionModalProps> = ({
  isOpen,
  onClose,
  clients: initialClients,
  onRefresh
}) => {
  const [localClients, setLocalClients] = useState<ClientProtectionAccount[]>(initialClients || []);
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [initialBalance, setInitialBalance] = useState(10000);
  const [targetGainUsd, setTargetGainUsd] = useState(1000);
  const [trailingLossUsd, setTrailingLossUsd] = useState(400);
  const [timeWindow, setTimeWindow] = useState<'30m' | '1h' | '1d' | '1w' | '1m'>('1d');
  const [selectedPairs, setSelectedPairs] = useState<string[]>(['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT']);
  const [loading, setLoading] = useState(false);
  const [sendingAlertId, setSendingAlertId] = useState<string | null>(null);

  const fetchClients = async () => {
    try {
      const res = await fetch('/api/client-protection');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setLocalClients(data);
        } else if (data && Array.isArray(data.clients)) {
          setLocalClients(data.clients);
        } else {
          setLocalClients([]);
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar clientes:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchClients();
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialClients && initialClients.length > 0) {
      setLocalClients(initialClients);
    }
  }, [initialClients]);

  if (!isOpen) return null;

  // Cálculos de Sugestão Inteligente (Baseado em Payoff 2.5R e Gestão de Banca 24/7)
  const suggestedStopLoss = Math.round(initialBalance * 0.04); // 4% de Stop / Trailing Loss
  const suggestedTargetGain = Math.round(initialBalance * 0.10); // 10% de Meta de Lucro (2.5x o Stop)
  const suggestedLotBase = Math.round(initialBalance * 0.20); // 20% de alocação de margem por trade

  const handleApplyQuantSuggestions = () => {
    setTrailingLossUsd(suggestedStopLoss);
    setTargetGainUsd(suggestedTargetGain);
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || loading) return;
    setLoading(true);

    try {
      const res = await fetch('/api/client-protection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          initialBalance: Number(initialBalance),
          targetGainUsd: Number(targetGainUsd),
          trailingLossUsd: Number(trailingLossUsd),
          timeWindow,
          activePairs: selectedPairs
        })
      });
      if (res.ok) {
        setName('');
        setPhone('');
        setShowAddForm(false);
        fetchClients();
        if (onRefresh) onRefresh();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async (id: string) => {
    try {
      await fetch(`/api/client-protection/${id}/unlock`, { method: 'POST' });
      fetchClients();
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/client-protection/${id}`, { method: 'DELETE' });
      fetchClients();
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendManualWhatsAppReport = async (client: ClientProtectionAccount) => {
    if (!client.phone) {
      alert('Este cliente não possui número de WhatsApp cadastrado.');
      return;
    }
    setSendingAlertId(client.id);
    try {
      const netPnl = client.currentBalance - client.initialBalance;
      const res = await fetch('/api/client-protection/send-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: client.phone,
          message: `📊 *Relatório Diário — MarketFlow Pro*\n\n` +
            `👤 *Conta:* ${client.name}\n` +
            `💰 *Banca Inicial:* $${client.initialBalance.toLocaleString()}\n` +
            `💵 *Saldo Atual:* $${client.currentBalance.toFixed(2)}\n` +
            `📈 *Resultado:* ${netPnl >= 0 ? `+$${netPnl.toFixed(2)}` : `-$${Math.abs(netPnl).toFixed(2)}`}\n` +
            `🛡️ *Status da Proteção:* ${client.status === 'ACTIVE' ? '✅ Protegido e Operando' : (client.status === 'LOCKED_GAIN' ? '🎯 Meta Batida (Pausado)' : '🛑 Stop Acionado (Pausado)')}\n\n` +
            `_Notificação disparada pelo Hub Oficial LicitaRadar/MarketFlow._`
        })
      });
      if (res.ok) {
        alert(`✅ Notificação enviada com sucesso para o WhatsApp (${client.phone}) via Hub!`);
      } else {
        alert('⚠️ Hub de Comunicação não respondeu. Verifique a conexão com o WhatsApp.');
      }
    } catch (e) {
      alert('Erro ao disparar mensagem.');
    } finally {
      setSendingAlertId(null);
    }
  };

  const allAvailablePairs = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT'];
  const clientsList = Array.isArray(localClients) ? localClients : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none animate-in fade-in duration-200 font-sans">
      <div className="bg-surface border border-border/80 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[88vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/80 bg-surface/95">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  Clientes & Proteção Institucional
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold uppercase">
                  Subcontas & Trailing Risk
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Gestão individual de bancas, travas temporais e alertas automáticos via Hub WhatsApp (Instância Licitações).
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-500/30"
            >
              <Plus className="w-4 h-4" />
              <span>{showAddForm ? 'Fechar Cadastro' : 'Novo Cliente / Subconta'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-surface-hover transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Add Client Form */}
          {showAddForm && (
            <form onSubmit={handleAddClient} className="bg-background/80 p-5 rounded-xl border border-emerald-500/40 space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="text-xs font-bold text-emerald-400 flex items-center space-x-1.5">
                  <Users className="w-4 h-4" />
                  <span>Cadastrar Novo Cliente / Subconta com Proteção 24/7</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Disparos pelo Hub de Licitações</span>
              </div>

              {/* Sugestões Quants Automáticas */}
              <div className="p-3 rounded-lg bg-surface/90 border border-emerald-500/30 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-1.5 text-amber-300 font-bold">
                    <Sparkles className="w-4 h-4" />
                    <span>SUGESTÕES QUANTS (Banca ${initialBalance.toLocaleString()}):</span>
                  </div>
                  <span className="text-slate-300">Stop Ideal: <strong className="text-rose-400">${suggestedStopLoss} (4%)</strong></span>
                  <span className="text-slate-300">Meta Lucro: <strong className="text-emerald-400">+${suggestedTargetGain} (10% | 2.5R)</strong></span>
                  <span className="text-slate-300">Lote Base: <strong className="text-accent">${suggestedLotBase} (20%)</strong></span>
                </div>
                <button
                  type="button"
                  onClick={handleApplyQuantSuggestions}
                  className="px-2.5 py-1 rounded bg-accent/20 hover:bg-accent/30 text-accent font-bold border border-accent/40 text-[10px] transition-all"
                >
                  ⚡ Aplicar Sugestões
                </button>
              </div>

              <div className="grid grid-cols-4 gap-3 text-xs font-mono">
                <div>
                  <label className="text-slate-400 text-[11px] block mb-1">Nome do Cliente / Mesa:</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Mesa Alpha ou Cliente Silva"
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="text-slate-400 text-[11px] block mb-1">WhatsApp para Alertas:</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ex: 5541999998888"
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="text-slate-400 text-[11px] block mb-1">Banca Inicial ($ USD):</label>
                  <input
                    type="number"
                    required
                    min={100}
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(Number(e.target.value))}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="text-slate-400 text-[11px] block mb-1">Janela de Proteção:</label>
                  <select
                    value={timeWindow}
                    onChange={(e) => setTimeWindow(e.target.value as any)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent"
                  >
                    <option value="30m">A cada 30 Minutos</option>
                    <option value="1h">A cada 1 Hora</option>
                    <option value="1d">Diário (1 Dia)</option>
                    <option value="1w">Semanal (1 Semana)</option>
                    <option value="1m">Mensal (1 Mês)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                <div>
                  <label className="text-emerald-400 text-[11px] font-bold block mb-1">Target Gain (TG Alvo em $):</label>
                  <input
                    type="number"
                    required
                    min={10}
                    value={targetGainUsd}
                    onChange={(e) => setTargetGainUsd(Number(e.target.value))}
                    className="w-full bg-surface border border-emerald-500/40 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-rose-400 text-[11px] font-bold block mb-1">Trailing Loss Máximo (TL Trava em $):</label>
                  <input
                    type="number"
                    required
                    min={10}
                    value={trailingLossUsd}
                    onChange={(e) => setTrailingLossUsd(Number(e.target.value))}
                    className="w-full bg-surface border border-rose-500/40 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Pairs Selector */}
              <div>
                <label className="text-slate-400 text-[11px] block mb-1 font-mono">Pares Autorizados para Operar:</label>
                <div className="flex flex-wrap gap-2">
                  {allAvailablePairs.map((p) => {
                    const isSel = selectedPairs.includes(p);
                    return (
                      <button
                        type="button"
                        key={p}
                        onClick={() => {
                          if (isSel) setSelectedPairs(selectedPairs.filter(x => x !== p));
                          else setSelectedPairs([...selectedPairs, p]);
                        }}
                        className={`px-2.5 py-1 rounded text-xs font-mono border transition-all ${
                          isSel
                            ? 'bg-accent/20 text-accent border-accent font-bold'
                            : 'bg-surface text-slate-400 border-border'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-500/30 transition-all"
                >
                  {loading ? 'Salvando...' : 'Confirmar e Ativar Proteção'}
                </button>
              </div>
            </form>
          )}

          {/* Client Cards List */}
          <div className="grid grid-cols-2 gap-4">
            {clientsList.map((cli) => {
              const netPnl = cli.currentBalance - cli.initialBalance;
              const isProfit = netPnl >= 0;
              const pnlPct = cli.initialBalance > 0 ? ((netPnl / cli.initialBalance) * 100).toFixed(2) : '0';

              return (
                <div
                  key={cli.id}
                  className={`bg-surface/80 border rounded-xl p-5 space-y-4 font-mono transition-all shadow-md ${
                    cli.status === 'LOCKED_LOSS'
                      ? 'border-rose-500/50 bg-rose-950/20'
                      : cli.status === 'LOCKED_GAIN'
                      ? 'border-emerald-500/50 bg-emerald-950/20'
                      : 'border-border/80'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white text-sm font-sans">{cli.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-surface border border-border text-slate-400">
                          {cli.timeWindow}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-sans">
                        ID: {cli.id} {cli.phone ? `• 📱 ${cli.phone}` : ''}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {cli.phone && (
                        <button
                          onClick={() => handleSendManualWhatsAppReport(cli)}
                          disabled={sendingAlertId === cli.id}
                          title="Enviar resumo da conta para o WhatsApp do cliente"
                          className="flex items-center space-x-1 px-2 py-1 rounded bg-teal-600/20 text-teal-300 border border-teal-500/40 text-[10px] font-bold hover:bg-teal-600/30"
                        >
                          <Send className={`w-3 h-3 ${sendingAlertId === cli.id ? 'animate-spin' : ''}`} />
                          <span>WhatsApp</span>
                        </button>
                      )}

                      {cli.status !== 'ACTIVE' ? (
                        <button
                          onClick={() => handleUnlock(cli.id)}
                          className="flex items-center space-x-1 px-2.5 py-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[11px] font-bold hover:bg-amber-500/30"
                        >
                          <Unlock className="w-3 h-3" />
                          <span>Destravar</span>
                        </button>
                      ) : (
                        <span className="flex items-center space-x-1 px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold">
                          <CheckCircle className="w-3 h-3" />
                          <span>PROTEGIDO</span>
                        </span>
                      )}
                      <button
                        onClick={() => handleDelete(cli.id)}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-surface transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Financial Stats */}
                  <div className="grid grid-cols-3 gap-2 bg-background/50 p-3 rounded-lg border border-border/60 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Banca Inicial:</span>
                      <span className="text-white font-bold">${cli.initialBalance.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Saldo Atual:</span>
                      <span className="text-white font-bold">${cli.currentBalance.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">P&L ({cli.timeWindow}):</span>
                      <span className={`font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfit ? `+$${netPnl.toFixed(2)}` : `-$${Math.abs(netPnl).toFixed(2)}`} ({pnlPct}%)
                      </span>
                    </div>
                  </div>

                  {/* Limits and status message */}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-emerald-400">🎯 Target Gain: +${cli.targetGainUsd}</span>
                    <span className="text-rose-400">🛡️ Trailing Loss: -${cli.trailingLossUsd}</span>
                  </div>

                  {cli.lockedReason && (
                    <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300 flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{cli.lockedReason}</span>
                    </div>
                  )}

                  {/* Authorized Pairs */}
                  <div className="flex flex-wrap gap-1">
                    {cli.activePairs.map((p) => (
                      <span key={p} className="px-2 py-0.5 rounded bg-surface border border-border text-[10px] text-slate-400">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {clientsList.length === 0 && (
            <div className="py-16 flex flex-col items-center justify-center space-y-3 text-slate-400">
              <Shield className="w-12 h-12 text-slate-600 animate-pulse" />
              <p className="text-sm font-sans">Nenhum cliente cadastrado. Clique em "Novo Cliente" para criar uma subconta protegida.</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
