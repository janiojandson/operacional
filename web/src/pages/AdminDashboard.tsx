import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, authFetch } from '../contexts/AuthContext';
import {
  Users, DollarSign, BarChart2, TrendingUp, Activity, Shield,
  Download, Plus, Trash2, Power, PowerOff, RefreshCw, Edit3,
  CheckCircle, XCircle, AlertTriangle, LogOut, ChevronRight,
  FileText, Terminal, Zap, Clock, Key, FileSpreadsheet, Bell
} from 'lucide-react';
import TradingTerminal from './TradingTerminal';

type AdminTab = 'dashboard' | 'clients' | 'banca' | 'reports' | 'trading';

interface ClientRow {
  userId: string;
  email: string;
  name: string | null;
  clientId: string | null;
  isActive: boolean;
  createdAt: number;
  config: {
    riskPct: number;
    leverage: number;
    maxDailyLossUsd: number;
    maxDailyProfitUsd: number;
    balance: number;
    isActive: boolean;
    apiConnected: boolean;
    bybitTestnet: boolean;
    hasApiKeys: boolean;
    maskedApiKey: string | null;
  } | null;
}

interface ReportData {
  trades: any[];
  summary: {
    totalTrades: number;
    closedTrades: number;
    openTrades: number;
    totalPnlUsd: number;
    winRate: number;
    wins: number;
    losses: number;
  };
}

interface BalanceEdit {
  id: string;
  client_id: string;
  admin_id: string;
  old_balance: number;
  new_balance: number;
  reason: string | null;
  action: string;
  timestamp: number;
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [balanceEdits, setBalanceEdits] = useState<BalanceEdit[]>([]);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Novo cliente
  const [showNewClient, setShowNewClient] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');

  // Edição de banca
  const [selectedClientId, setSelectedClientId] = useState('');
  const [newBalance, setNewBalance] = useState('');
  const [editReason, setEditReason] = useState('');

  // Filtros de relatório
  const [reportClientId, setReportClientId] = useState('');
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/clients');
      const data = await res.json();
      setClients(Array.isArray(data) ? data : []);
    } catch { notify('Erro ao carregar clientes.', 'error'); }
    finally { setLoading(false); }
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (reportClientId) params.set('clientId', reportClientId);
      if (reportFrom) params.set('from', String(new Date(reportFrom).getTime()));
      if (reportTo) params.set('to', String(new Date(reportTo).getTime()));
      const res = await authFetch(`/api/admin/reports?${params}`);
      setReport(await res.json());
    } catch { notify('Erro ao carregar relatório.', 'error'); }
    finally { setLoading(false); }
  }, [reportClientId, reportFrom, reportTo]);

  const fetchBalanceEdits = useCallback(async () => {
    const res = await authFetch('/api/admin/balance-edits');
    const data = await res.json();
    setBalanceEdits(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    if (activeTab === 'dashboard' || activeTab === 'clients') fetchClients();
    if (activeTab === 'reports') fetchReport();
    if (activeTab === 'banca') { fetchClients(); fetchBalanceEdits(); }
  }, [activeTab]);

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await authFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: newEmail, password: newPassword, name: newName, role: 'CLIENT' })
    });
    const data = await res.json();
    if (res.ok) {
      notify(`✅ Cliente ${newName} criado! ID: ${data.clientId}`);
      setShowNewClient(false); setNewEmail(''); setNewPassword(''); setNewName('');
      fetchClients();
    } else {
      notify(data.error || 'Erro ao criar cliente.', 'error');
    }
  };

  const handleEditBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId || !newBalance) return;
    const res = await authFetch(`/api/admin/clients/${selectedClientId}/balance`, {
      method: 'POST',
      body: JSON.stringify({ balance: Number(newBalance), reason: editReason })
    });
    const data = await res.json();
    if (res.ok) {
      notify(`✅ Saldo atualizado: $${Number(newBalance).toFixed(2)}`);
      setNewBalance(''); setEditReason('');
      fetchClients(); fetchBalanceEdits();
    } else {
      notify(data.error || 'Erro ao editar saldo.', 'error');
    }
  };

  const handleResetBalance = async (clientId: string) => {
    if (!confirm('Zerar a banca deste cliente? Esta ação ficará registrada na auditoria.')) return;
    const res = await authFetch(`/api/admin/clients/${clientId}/reset-balance`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Reset manual via painel admin' })
    });
    if (res.ok) { notify('🔄 Banca zerada com sucesso.'); fetchClients(); fetchBalanceEdits(); }
    else notify('Erro ao zerar banca.', 'error');
  };

  const handleKillSwitch = async (clientId: string, active: boolean) => {
    const res = await authFetch(`/api/admin/clients/${clientId}/kill-switch`, {
      method: 'POST',
      body: JSON.stringify({ active })
    });
    if (res.ok) { notify(active ? '✅ Cliente ativado.' : '⛔ Cliente desativado (Kill Switch).'); fetchClients(); }
    else notify('Erro ao alterar status.', 'error');
  };

  const handleDownloadReport = async (format: 'csv' | 'json') => {
    const params = new URLSearchParams({ format });
    if (reportClientId) params.set('clientId', reportClientId);
    if (reportFrom) params.set('from', String(new Date(reportFrom).getTime()));
    if (reportTo) params.set('to', String(new Date(reportTo).getTime()));
    const token = localStorage.getItem('mfp_token');
    const url = `/api/admin/reports/download?${params}`;
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', '');
    // Fazer via fetch para passar o token
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    a.href = objectUrl;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  };

  const activeClients = clients.filter(c => c.isActive && c.config?.isActive);
  const connectedClients = clients.filter(c => c.config?.apiConnected);
  const totalBalance = clients.reduce((s, c) => s + (c.config?.balance ?? 0), 0);

  if (activeTab === 'trading') {
    return (
      <div className="h-screen flex flex-col">
        <div className="flex items-center px-4 py-2 bg-surface border-b border-border/60 shrink-0">
          <button onClick={() => setActiveTab('dashboard')} className="flex items-center space-x-1.5 text-accent text-xs font-mono hover:text-white transition-colors">
            <ChevronRight className="w-3 h-3 rotate-180" />
            <span>Voltar ao Admin</span>
          </button>
          <span className="mx-3 text-border">|</span>
          <span className="text-xs font-mono text-slate-400">Terminal de Trading — Visão Admin Master</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <TradingTerminal />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-slate-100 font-sans flex flex-col">

      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl font-mono text-sm flex items-center space-x-2 animate-in fade-in slide-in-from-top-2 duration-300 ${
          notification.type === 'success' ? 'bg-emerald-900/90 border border-emerald-500/50 text-emerald-300' : 'bg-rose-900/90 border border-rose-500/50 text-rose-300'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          <span>{notification.msg}</span>
        </div>
      )}

      {/* Header */}
      <header className="h-14 bg-surface/95 border-b border-border/60 backdrop-blur-md flex items-center px-6 shrink-0">
        <div className="flex items-center space-x-3 flex-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-accent to-violet-500 flex items-center justify-center shadow-lg shadow-accent/30">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-sm font-black text-white">MarketFlow Pro</span>
            <span className="ml-2 text-[10px] font-mono px-2 py-0.5 rounded bg-accent/20 text-accent border border-accent/30 uppercase">Admin</span>
          </div>
        </div>

        <nav className="flex items-center space-x-1">
          {([
            { id: 'dashboard', icon: Activity, label: 'Dashboard' },
            { id: 'clients', icon: Users, label: 'Clientes' },
            { id: 'banca', icon: DollarSign, label: 'Banca' },
            { id: 'reports', icon: FileText, label: 'Relatórios' },
            { id: 'trading', icon: Terminal, label: 'Terminal' }
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-accent/20 text-accent border border-accent/30'
                  : 'text-slate-400 hover:text-white hover:bg-surface-hover'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center space-x-3 ml-4">
          <span className="text-xs text-slate-400 font-mono">{user?.email}</span>
          <button onClick={logout} className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-surface-hover transition-all">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto p-6">

        {/* ── DASHBOARD ── */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white">Visão Geral do SaaS</h2>

            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Clientes Ativos', value: activeClients.length, icon: Users, color: 'text-emerald-400', bg: 'from-emerald-500/10 to-transparent' },
                { label: 'API Conectada', value: connectedClients.length, icon: Zap, color: 'text-accent', bg: 'from-accent/10 to-transparent' },
                { label: 'Banca Total', value: `$${totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: DollarSign, color: 'text-amber-400', bg: 'from-amber-500/10 to-transparent' },
                { label: 'Total de Clientes', value: clients.length, icon: Shield, color: 'text-violet-400', bg: 'from-violet-500/10 to-transparent' }
              ].map(kpi => (
                <div key={kpi.label} className={`bg-gradient-to-br ${kpi.bg} bg-surface border border-border/60 rounded-2xl p-5`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-slate-400 font-mono uppercase tracking-wider">{kpi.label}</span>
                    <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                  </div>
                  <div className={`text-2xl font-black ${kpi.color}`}>{kpi.value}</div>
                </div>
              ))}
            </div>

            {/* Clients Quick Table */}
            <div className="bg-surface border border-border/60 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
                <span className="text-sm font-bold text-white">Clientes Recentes</span>
                <button onClick={fetchClients} className="text-slate-400 hover:text-white"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border/40 text-slate-500 uppercase tracking-wider">
                      <th className="text-left px-5 py-3">Nome</th>
                      <th className="text-left px-5 py-3">Email</th>
                      <th className="text-right px-5 py-3">Banca</th>
                      <th className="text-center px-5 py-3">API</th>
                      <th className="text-center px-5 py-3">Rede</th>
                      <th className="text-center px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map(c => (
                      <tr key={c.userId} className="border-b border-border/20 hover:bg-surface-hover/30 transition-colors">
                        <td className="px-5 py-3 text-white font-semibold">{c.name || '—'}</td>
                        <td className="px-5 py-3 text-slate-400">{c.email}</td>
                        <td className="px-5 py-3 text-right text-amber-400 font-bold">${(c.config?.balance ?? 0).toFixed(2)}</td>
                        <td className="px-5 py-3 text-center">
                          {c.config?.apiConnected
                            ? <span className="text-emerald-400">● Online</span>
                            : c.config?.hasApiKeys
                            ? <span className="text-amber-400">○ Desconectada</span>
                            : <span className="text-slate-600">– Sem Chave</span>
                          }
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${c.config?.bybitTestnet ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                            {c.config?.bybitTestnet ? 'TESTNET' : 'MAINNET'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.config?.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                            {c.config?.isActive ? 'ATIVO' : 'BLOQUEADO'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {clients.length === 0 && (
                  <div className="py-12 text-center text-slate-500 text-sm">Nenhum cliente cadastrado ainda.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── CLIENTES ── */}
        {activeTab === 'clients' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Gestão de Clientes</h2>
              <div className="flex space-x-2">
                <button onClick={fetchClients} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover transition-all"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
                <button
                  onClick={() => setShowNewClient(!showNewClient)}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-accent hover:bg-accent/80 text-white text-sm font-bold transition-all shadow-lg shadow-accent/20"
                >
                  <Plus className="w-4 h-4" />
                  <span>Novo Cliente</span>
                </button>
              </div>
            </div>

            {/* Novo Cliente Form */}
            {showNewClient && (
              <form onSubmit={handleCreateClient} className="bg-surface border border-accent/30 rounded-2xl p-5 space-y-4 animate-in fade-in duration-200">
                <h3 className="text-sm font-bold text-accent flex items-center space-x-2"><Plus className="w-4 h-4" /><span>Cadastrar Novo Cliente</span></h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-[11px] text-slate-400 font-mono block mb-1">Nome Completo</label>
                    <input required value={newName} onChange={e => setNewName(e.target.value)} placeholder="João Silva" className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent transition-all" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 font-mono block mb-1">Email de Acesso</label>
                    <input type="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="cliente@email.com" className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent transition-all" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 font-mono block mb-1">Senha Inicial</label>
                    <input type="password" required minLength={8} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 8 caracteres" className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent transition-all" />
                  </div>
                </div>
                <div className="flex justify-end space-x-2">
                  <button type="button" onClick={() => setShowNewClient(false)} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white">Cancelar</button>
                  <button type="submit" className="px-5 py-2 rounded-xl bg-accent hover:bg-accent/80 text-white text-sm font-bold">Criar Cliente</button>
                </div>
              </form>
            )}

            {/* Clients Table */}
            <div className="bg-surface border border-border/60 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border/40 text-slate-500 uppercase tracking-wider text-[10px]">
                      <th className="text-left px-5 py-3">Cliente</th>
                      <th className="text-left px-5 py-3">Client ID</th>
                      <th className="text-right px-5 py-3">Banca</th>
                      <th className="text-center px-5 py-3">Risco</th>
                      <th className="text-center px-5 py-3">Alavancagem</th>
                      <th className="text-center px-5 py-3">API Bybit</th>
                      <th className="text-center px-5 py-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map(c => (
                      <tr key={c.userId} className="border-b border-border/20 hover:bg-surface-hover/20 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-semibold text-white">{c.name}</div>
                          <div className="text-slate-500">{c.email}</div>
                        </td>
                        <td className="px-5 py-4 text-slate-500">{c.clientId || '—'}</td>
                        <td className="px-5 py-4 text-right text-amber-400 font-bold">${(c.config?.balance ?? 0).toFixed(2)}</td>
                        <td className="px-5 py-4 text-center text-white">{c.config?.riskPct ?? '—'}%</td>
                        <td className="px-5 py-4 text-center text-white">{c.config?.leverage ?? '—'}x</td>
                        <td className="px-5 py-4 text-center">
                          {c.config?.hasApiKeys ? (
                            <span className={`flex items-center justify-center space-x-1 ${c.config.apiConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                              <Key className="w-3 h-3" />
                              <span>{c.config.apiConnected ? 'Conectada' : 'Configurada'}</span>
                            </span>
                          ) : (
                            <span className="text-slate-600">Sem chave</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-center space-x-1">
                            <button
                              onClick={() => handleKillSwitch(c.clientId!, !c.config?.isActive)}
                              title={c.config?.isActive ? 'Desativar (Kill Switch)' : 'Ativar Cliente'}
                              className={`p-1.5 rounded-lg transition-all ${c.config?.isActive ? 'text-emerald-400 hover:bg-rose-500/10 hover:text-rose-400' : 'text-rose-400 hover:bg-emerald-500/10 hover:text-emerald-400'}`}
                            >
                              {c.config?.isActive ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── BANCA ── */}
        {activeTab === 'banca' && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-white">Gestão de Banca</h2>

            <div className="grid grid-cols-2 gap-5">
              {/* Edit Balance Form */}
              <div className="bg-surface border border-border/60 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2 mb-4"><Edit3 className="w-4 h-4 text-accent" /><span>Editar Saldo da Banca</span></h3>
                <form onSubmit={handleEditBalance} className="space-y-3">
                  <div>
                    <label className="text-[11px] text-slate-400 font-mono block mb-1">Cliente</label>
                    <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent">
                      <option value="">Selecione um cliente...</option>
                      {clients.filter(c => c.clientId).map(c => (
                        <option key={c.clientId} value={c.clientId!}>
                          {c.name} — ${(c.config?.balance ?? 0).toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 font-mono block mb-1">Novo Saldo (USD)</label>
                    <input type="number" min={0} step={0.01} value={newBalance} onChange={e => setNewBalance(e.target.value)} placeholder="Ex: 1500.00" className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 font-mono block mb-1">Motivo (opcional)</label>
                    <input value={editReason} onChange={e => setEditReason(e.target.value)} placeholder="Ex: Depósito confirmado" className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" />
                  </div>
                  <button type="submit" disabled={!selectedClientId || !newBalance} className="w-full py-2 rounded-xl bg-accent hover:bg-accent/80 text-white text-sm font-bold transition-all disabled:opacity-40">
                    Confirmar Edição de Saldo
                  </button>
                </form>

                {/* Quick reset buttons per client */}
                <div className="mt-4 pt-4 border-t border-border/40">
                  <p className="text-[11px] text-slate-500 font-mono mb-2">ZERAR BANCA (registrado em auditoria):</p>
                  <div className="space-y-1.5">
                    {clients.filter(c => c.clientId && (c.config?.balance ?? 0) > 0).map(c => (
                      <div key={c.clientId} className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-mono">{c.name} — <span className="text-amber-400">${(c.config?.balance ?? 0).toFixed(2)}</span></span>
                        <button
                          onClick={() => handleResetBalance(c.clientId!)}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-rose-400 border border-rose-500/30 hover:bg-rose-500/10 transition-all"
                        >
                          Zerar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Balance Edit History */}
              <div className="bg-surface border border-border/60 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2 mb-4"><Clock className="w-4 h-4 text-slate-400" /><span>Histórico de Edições</span></h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {balanceEdits.length === 0 && <p className="text-sm text-slate-500 text-center py-8">Nenhuma edição registrada.</p>}
                  {balanceEdits.map(e => (
                    <div key={e.id} className={`p-3 rounded-lg border text-xs font-mono ${e.action === 'RESET' ? 'bg-rose-950/20 border-rose-500/20' : 'bg-surface-hover border-border/40'}`}>
                      <div className="flex justify-between mb-1">
                        <span className={`font-bold ${e.action === 'RESET' ? 'text-rose-400' : 'text-emerald-400'}`}>{e.action}</span>
                        <span className="text-slate-500">{new Date(e.timestamp).toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="text-slate-300">Cliente: <span className="text-white">{e.client_id}</span></div>
                      <div className="text-slate-400">
                        ${e.old_balance.toFixed(2)} → <span className={e.new_balance > e.old_balance ? 'text-emerald-400' : 'text-rose-400'}>${e.new_balance.toFixed(2)}</span>
                      </div>
                      {e.reason && <div className="text-slate-500 mt-1">{e.reason}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── RELATÓRIOS ── */}
        {activeTab === 'reports' && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-white">Relatórios de Performance</h2>

            {/* Filtros */}
            <div className="bg-surface border border-border/60 rounded-2xl p-5">
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="text-[11px] text-slate-400 font-mono block mb-1">Cliente (opcional)</label>
                  <select value={reportClientId} onChange={e => setReportClientId(e.target.value)} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent">
                    <option value="">Todos os clientes</option>
                    {clients.filter(c => c.clientId).map(c => (
                      <option key={c.clientId} value={c.clientId!}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 font-mono block mb-1">Data Inicial</label>
                  <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 font-mono block mb-1">Data Final</label>
                  <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" />
                </div>
                <div className="flex items-end space-x-2">
                  <button onClick={fetchReport} className="flex-1 py-2 rounded-xl bg-accent hover:bg-accent/80 text-white text-sm font-bold transition-all flex items-center justify-center space-x-1">
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>Filtrar</span>
                  </button>
                  <button onClick={() => handleDownloadReport('excel')} title="Baixar Planilha Excel (.xls)" className="p-2 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 transition-all flex items-center space-x-1 px-3">
                    <FileSpreadsheet className="w-4 h-4" />
                    <span className="text-xs font-bold font-mono">Excel</span>
                  </button>
                  <button onClick={() => handleDownloadReport('csv')} title="Baixar CSV" className="p-2 rounded-xl bg-surface text-slate-300 border border-border/60 hover:text-white transition-all">
                    <Download className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDownloadReport('json')} title="Baixar JSON" className="p-2 rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30 hover:bg-violet-600/30 transition-all">
                    <FileText className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            {report && (
              <>
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'Total Trades', value: report.summary.totalTrades, color: 'text-white' },
                    { label: 'P&L Total', value: `${report.summary.totalPnlUsd >= 0 ? '+' : ''}$${report.summary.totalPnlUsd.toFixed(2)}`, color: report.summary.totalPnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400' },
                    { label: 'Win Rate', value: `${report.summary.winRate}%`, color: Number(report.summary.winRate) >= 50 ? 'text-emerald-400' : 'text-amber-400' },
                    { label: 'Wins / Losses', value: `${report.summary.wins} / ${report.summary.losses}`, color: 'text-slate-300' }
                  ].map(card => (
                    <div key={card.label} className="bg-surface border border-border/60 rounded-2xl p-4 text-center">
                      <div className="text-xs text-slate-500 font-mono uppercase mb-1">{card.label}</div>
                      <div className={`text-xl font-black ${card.color}`}>{card.value}</div>
                    </div>
                  ))}
                </div>

                {/* Trades Table */}
                <div className="bg-surface border border-border/60 rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-border/40 flex items-center justify-between">
                    <span className="text-sm font-bold text-white">Histórico de Operações ({report.trades.length})</span>
                  </div>
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-xs font-mono">
                      <thead className="sticky top-0 bg-surface">
                        <tr className="border-b border-border/40 text-slate-500 uppercase tracking-wider text-[10px]">
                          <th className="text-left px-4 py-2">Cliente</th>
                          <th className="text-left px-4 py-2">Par</th>
                          <th className="text-center px-4 py-2">Lado</th>
                          <th className="text-right px-4 py-2">Entrada</th>
                          <th className="text-right px-4 py-2">Saída</th>
                          <th className="text-right px-4 py-2">P&L</th>
                          <th className="text-center px-4 py-2">Status</th>
                          <th className="text-right px-4 py-2">Data</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.trades.map((t: any) => (
                          <tr key={t.id} className="border-b border-border/20 hover:bg-surface-hover/20">
                            <td className="px-4 py-2 text-slate-400">{t.client_id}</td>
                            <td className="px-4 py-2 text-white font-semibold">{t.symbol}</td>
                            <td className={`px-4 py-2 text-center font-bold ${t.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>{t.side}</td>
                            <td className="px-4 py-2 text-right">${Number(t.entry_price).toFixed(2)}</td>
                            <td className="px-4 py-2 text-right">{t.close_price ? `$${Number(t.close_price).toFixed(2)}` : '—'}</td>
                            <td className={`px-4 py-2 text-right font-bold ${(t.pnl_usd ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {t.pnl_usd != null ? `${t.pnl_usd >= 0 ? '+' : ''}$${Number(t.pnl_usd).toFixed(2)}` : '—'}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.status === 'CLOSED' ? 'bg-slate-500/20 text-slate-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{t.status}</span>
                            </td>
                            <td className="px-4 py-2 text-right text-slate-500">{new Date(t.entry_time).toLocaleDateString('pt-BR')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {report.trades.length === 0 && (
                      <div className="py-12 text-center text-slate-500">Nenhuma operação encontrada com os filtros aplicados.</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
