import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, authFetch } from '../contexts/AuthContext';
import {
  Users, BarChart2, TrendingUp, Activity, Shield,
  Download, Plus, Trash2, Power, PowerOff, RefreshCw, Edit3,
  CheckCircle, XCircle, AlertTriangle, LogOut, ChevronRight,
  FileText, Terminal, Zap, Clock, Key, FileSpreadsheet, Bell,
  AlertOctagon, CheckCircle2, Phone
} from 'lucide-react';
import TradingTerminal from './TradingTerminal';

type AdminTab = 'dashboard' | 'clients' | 'reports' | 'trading';

interface ClientRow {
  userId: string;
  email: string;
  name: string | null;
  whatsapp?: string | null;
  whatsappValidado?: boolean;
  clientId: string | null;
  isActive: boolean;
  planActive: boolean;
  createdAt: number;
  config: {
    riskPct: number;
    leverage: number;
    maxDailyLossUsd: number;
    maxDailyProfitUsd: number;
    balance: number;
    isActive: boolean;
    syncEnabled: boolean;
    apiConnected: boolean;
    bybitTestnet: boolean;
    hasApiKeys: boolean;
    maskedApiKey: string | null;
    planType?: string;
    planExpiresAt?: number | null;
  } | null;
}

interface OverviewData {
  totalClients: number;
  activePlanClients: number;
  inactivePlanClients: number;
  connectedApis: number;
  syncActiveCount: number;
  bybitHealth: {
    status: string;
    connectedClients: number;
    totalConfigs: number;
  };
  performanceToday: {
    totalTrades: number;
    closedTrades: number;
    openTrades: number;
    totalPnlUsd: number;
    winRate: number;
    wins: number;
    losses: number;
  };
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

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Novo cliente
  const [showNewClient, setShowNewClient] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newWhatsApp, setNewWhatsApp] = useState('');

  // Edição de cliente
  const [editingClient, setEditingClient] = useState<ClientRow | null>(null);
  const [editDaysToAdd, setEditDaysToAdd] = useState<number>(30);
  const [editPlanActive, setEditPlanActive] = useState<boolean>(true);

  // Filtros de relatório
  const [reportClientId, setReportClientId] = useState('');
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchOverview = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/overview');
      if (res.ok) {
        setOverview(await res.json());
      }
    } catch { }
  }, []);

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

  useEffect(() => {
    if (activeTab === 'dashboard') { fetchOverview(); fetchClients(); }
    if (activeTab === 'clients') fetchClients();
    if (activeTab === 'reports') fetchReport();
  }, [activeTab]);

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await authFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: newEmail, password: newPassword, name: newName, whatsapp: newWhatsApp, role: 'CLIENT' })
    });
    const data = await res.json();
    if (res.ok) {
      notify(`✅ Cliente ${newName} criado! ID: ${data.clientId}`);
      setShowNewClient(false); setNewEmail(''); setNewPassword(''); setNewName(''); setNewWhatsApp('');
      fetchClients();
    } else {
      notify(data.error || 'Erro ao criar cliente.', 'error');
    }
  };

  // Forçar Desconexão (Pânico na Bybit)
  const handleForceDisconnect = async (clientId: string, clientName: string) => {
    if (!confirm(`⚠️ FORÇAR DESCONEXÃO: Deseja zerar imediatamente todas as posições abertas e cancelar ordens na Bybit do cliente ${clientName}?`)) {
      return;
    }

    try {
      const res = await authFetch(`/api/admin/clients/${clientId}/force-disconnect`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        notify(`🛑 Desconexão forçada com sucesso! ${data.details.closedCount} posições encerradas.`);
        fetchClients();
      } else {
        notify(data.error || 'Erro ao forçar desconexão.', 'error');
      }
    } catch {
      notify('Erro de comunicação com o servidor.', 'error');
    }
  };

  const handleKillSwitch = async (clientId: string, active: boolean) => {
    const res = await authFetch(`/api/admin/clients/${clientId}/kill-switch`, {
      method: 'POST',
      body: JSON.stringify({ active })
    });
    if (res.ok) { notify(active ? '✅ Cliente desbloqueado.' : '⛔ Cliente bloqueado.'); fetchClients(); }
    else notify('Erro ao alterar status.', 'error');
  };

  const handleSaveClientPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient?.clientId) return;

    const res = await authFetch(`/api/admin/clients/${editingClient.clientId}/plan`, {
      method: 'POST',
      body: JSON.stringify({
        daysToAdd: editDaysToAdd,
        planActive: editPlanActive
      })
    });
    if (res.ok) {
      notify('✅ Plano e validade do cliente atualizados com sucesso!');
      setEditingClient(null);
      fetchClients();
    } else {
      notify('Erro ao atualizar plano.', 'error');
    }
  };

  const handleDownloadReport = async (format: 'excel' | 'csv' | 'json') => {
    const params = new URLSearchParams({ format });
    if (reportClientId) params.set('clientId', reportClientId);
    if (reportFrom) params.set('from', String(new Date(reportFrom).getTime()));
    if (reportTo) params.set('to', String(new Date(reportTo).getTime()));
    const token = localStorage.getItem('mfp_token');
    const url = `/api/admin/reports/download?${params}`;
    
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `relatorio-admin-${Date.now()}.${format === 'excel' ? 'xls' : format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  };

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
      <main className="flex-1 overflow-auto p-6 max-w-7xl mx-auto w-full">

        {/* ── DASHBOARD ── */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Visão Executiva & Saúde do SaaS</h2>
              <button onClick={() => { fetchOverview(); fetchClients(); }} className="p-2 rounded-xl text-slate-400 hover:text-white bg-surface border border-border/60">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* KPI Cards Reestruturados */}
            <div className="grid grid-cols-4 gap-4">
              {/* Clientes Ativos vs Inativos */}
              <div className="bg-surface border border-border/60 rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-mono uppercase">Clientes (Ativos / Inativos)</span>
                  <Users className="w-4 h-4 text-accent" />
                </div>
                <div className="text-2xl font-black text-white">
                  <span className="text-emerald-400">{overview?.activePlanClients ?? clients.filter(c => c.planActive).length}</span>
                  <span className="text-slate-600 text-lg mx-1.5">/</span>
                  <span className="text-rose-400">{overview?.inactivePlanClients ?? clients.filter(c => !c.planActive).length}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">Total de contas: {clients.length}</div>
              </div>

              {/* Status Bybit API (Health Check) */}
              <div className="bg-surface border border-border/60 rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-mono uppercase">API Bybit Health Check</span>
                  <Zap className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-black text-emerald-400 flex items-center space-x-2">
                  <span>ONLINE</span>
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {overview?.connectedApis ?? clients.filter(c => c.config?.apiConnected).length} conexões ativas com a Bybit
                </div>
              </div>

              {/* Sincronizações Ligadas */}
              <div className="bg-surface border border-border/60 rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-mono uppercase">Sincronização Copy Trading</span>
                  <Activity className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl font-black text-cyan-400">
                  {overview?.syncActiveCount ?? clients.filter(c => c.config?.syncEnabled).length}
                </div>
                <div className="text-xs text-slate-500 mt-1">Robôs replicando operações em tempo real</div>
              </div>

              {/* Performance Global do Dia */}
              <div className="bg-surface border border-border/60 rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-mono uppercase">Performance Global do Dia</span>
                  <TrendingUp className="w-4 h-4 text-amber-400" />
                </div>
                <div className={`text-2xl font-black ${(overview?.performanceToday?.totalPnlUsd ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {(overview?.performanceToday?.totalPnlUsd ?? 0) >= 0 ? '+' : ''}${overview?.performanceToday?.totalPnlUsd?.toFixed(2) ?? '0.00'}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Win Rate Hoje: {overview?.performanceToday?.winRate ?? 0}% ({overview?.performanceToday?.totalTrades ?? 0} trades)
                </div>
              </div>
            </div>

            {/* Clients Quick Table */}
            <div className="bg-surface border border-border/60 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
                <span className="text-sm font-bold text-white">Status Operacional dos Clientes</span>
                <button onClick={fetchClients} className="text-slate-400 hover:text-white"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border/40 text-slate-500 uppercase tracking-wider text-[10px]">
                      <th className="text-left px-5 py-3">Nome / WhatsApp</th>
                      <th className="text-left px-5 py-3">Email</th>
                      <th className="text-center px-5 py-3">Sincronização</th>
                      <th className="text-center px-5 py-3">Status Bybit</th>
                      <th className="text-center px-5 py-3">Plano</th>
                      <th className="text-center px-5 py-3">Ações Rápidas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map(c => (
                      <tr key={c.userId} className="border-b border-border/20 hover:bg-surface-hover/30 transition-colors">
                        <td className="px-5 py-3">
                          <div className="text-white font-semibold">{c.name || '—'}</div>
                          {c.whatsapp && (
                            <div className="text-[11px] text-slate-400 flex items-center space-x-1">
                              <Phone className="w-3 h-3 text-emerald-400" />
                              <span>{c.whatsapp}</span>
                              {c.whatsappValidado && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-400">{c.email}</td>
                        <td className="px-5 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.config?.syncEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                            {c.config?.syncEnabled ? '● LIGADO' : '○ DESLIGADO'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          {c.config?.apiConnected
                            ? <span className="text-emerald-400 font-bold">● Conectado</span>
                            : c.config?.hasApiKeys
                            ? <span className="text-amber-400">○ Erro / Offline</span>
                            : <span className="text-slate-600">– Sem Chave</span>
                          }
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.planActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                            {c.planActive ? 'ATIVO' : 'INATIVO'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <div className="flex items-center justify-center space-x-2">
                            {c.clientId && (
                              <button
                                onClick={() => handleForceDisconnect(c.clientId!, c.name || c.email)}
                                title="Forçar Desconexão (Pânico Bybit)"
                                className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/20 transition-all"
                              >
                                <AlertOctagon className="w-4 h-4" />
                              </button>
                            )}
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

        {/* ── CLIENTES ── */}
        {activeTab === 'clients' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Gestão e Monitoramento de Clientes</h2>
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
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="text-[11px] text-slate-400 font-mono block mb-1">Nome Completo</label>
                    <input required value={newName} onChange={e => setNewName(e.target.value)} placeholder="João Silva" className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 font-mono block mb-1">WhatsApp (com DDD)</label>
                    <input required value={newWhatsApp} onChange={e => setNewWhatsApp(e.target.value)} placeholder="(11) 99999-9999" className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 font-mono block mb-1">Email</label>
                    <input type="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="cliente@email.com" className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 font-mono block mb-1">Senha Inicial</label>
                    <input type="password" required minLength={6} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" />
                  </div>
                </div>
                <div className="flex justify-end space-x-2">
                  <button type="button" onClick={() => setShowNewClient(false)} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white">Cancelar</button>
                  <button type="submit" className="px-5 py-2 rounded-xl bg-accent hover:bg-accent/80 text-white text-sm font-bold">Criar Cliente</button>
                </div>
              </form>
            )}

            {/* Modal de Edição de Plano / Vencimento */}
            {editingClient && (
              <form onSubmit={handleSaveClientPlan} className="bg-surface border border-accent/40 rounded-2xl p-5 space-y-4 mb-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-accent flex items-center space-x-2">
                    <Edit3 className="w-4 h-4" />
                    <span>Editar Cliente: {editingClient.name} ({editingClient.email})</span>
                  </h3>
                  <button type="button" onClick={() => setEditingClient(null)} className="text-xs text-slate-400 hover:text-white">Fechar</button>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-[11px] text-slate-400 font-mono block mb-1">Status do Plano</label>
                    <select
                      value={editPlanActive ? 'ACTIVE' : 'INACTIVE'}
                      onChange={e => setEditPlanActive(e.target.value === 'ACTIVE')}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
                    >
                      <option value="ACTIVE">Plano Ativo (Acesso Completo)</option>
                      <option value="INACTIVE">Plano Inativo (Modo Vitrine)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 font-mono block mb-1">Adicionar Dias de Validade</label>
                    <input
                      type="number"
                      value={editDaysToAdd}
                      onChange={e => setEditDaysToAdd(Number(e.target.value))}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent font-mono"
                    />
                  </div>
                  <div className="flex items-end">
                    <button type="submit" className="w-full py-2 rounded-xl bg-accent text-white font-bold text-sm">
                      Salvar Alterações
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Clients Table com Colunas de Sincronização, Bybit e Vencimento */}
            <div className="bg-surface border border-border/60 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border/40 text-slate-500 uppercase tracking-wider text-[10px] bg-background/40">
                      <th className="text-left px-5 py-3.5">Cliente</th>
                      <th className="text-left px-5 py-3.5">WhatsApp</th>
                      <th className="text-center px-5 py-3.5">Sincronização</th>
                      <th className="text-center px-5 py-3.5">Status Bybit</th>
                      <th className="text-center px-5 py-3.5">Data Vencimento</th>
                      <th className="text-center px-5 py-3.5">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map(c => {
                      const expiresFormatted = c.config?.planExpiresAt
                        ? new Date(c.config.planExpiresAt).toLocaleDateString('pt-BR')
                        : 'Vitalício';

                      return (
                        <tr key={c.userId} className="border-b border-border/20 hover:bg-surface-hover/20 transition-colors">
                          <td className="px-5 py-4">
                            <div className="font-semibold text-white">{c.name || '—'}</div>
                            <div className="text-slate-500 text-[11px]">{c.email}</div>
                          </td>
                          <td className="px-5 py-4 text-slate-300">
                            {c.whatsapp ? (
                              <div className="flex items-center space-x-1.5">
                                <span>{c.whatsapp}</span>
                                {c.whatsappValidado ? (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold">Validado</span>
                                ) : (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-500/20 text-slate-400">Pendente</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.config?.syncEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                              {c.config?.syncEnabled ? '● LIGADO' : '○ DESLIGADO'}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-center">
                            {c.config?.apiConnected ? (
                              <span className="text-emerald-400 font-bold flex items-center justify-center space-x-1">
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Conectado</span>
                              </span>
                            ) : c.config?.hasApiKeys ? (
                              <span className="text-amber-400 flex items-center justify-center space-x-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Erro / Offline</span>
                              </span>
                            ) : (
                              <span className="text-slate-600">Sem Chave</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-center text-slate-300">
                            {expiresFormatted}
                          </td>
                          <td className="px-5 py-4 text-center">
                            <div className="flex items-center justify-center space-x-2">
                              {/* Botão Editar */}
                              <button
                                onClick={() => {
                                  setEditingClient(c);
                                  setEditPlanActive(c.planActive);
                                }}
                                title="Editar Cliente & Plano"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover transition-all"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>

                              {/* Botão Ativar / Desativar Cliente (Verde ativa / Vermelho desativa) */}
                              <button
                                onClick={() => handleKillSwitch(c.clientId!, !(c.isActive && c.planActive))}
                                title={c.isActive && c.planActive ? 'Cliente Ativo — Clique para Desativar' : 'Cliente Inativo — Clique para Ativar'}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-all flex items-center space-x-1 ${
                                  c.isActive && c.planActive
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/40'
                                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-emerald-500/20 hover:text-emerald-400 hover:border-emerald-500/40'
                                }`}
                              >
                                {c.isActive && c.planActive ? (
                                  <>
                                    <Power className="w-3.5 h-3.5" />
                                    <span>Ativo</span>
                                  </>
                                ) : (
                                  <>
                                    <PowerOff className="w-3.5 h-3.5" />
                                    <span>Desativado</span>
                                  </>
                                )}
                              </button>

                              {/* Botão Forçar Desconexão (Pânico Bybit) */}
                              {c.clientId && (
                                <button
                                  onClick={() => handleForceDisconnect(c.clientId!, c.name || c.email)}
                                  title="Forçar Desconexão (Zerar Posições na Bybit)"
                                  className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 transition-all"
                                >
                                  <AlertOctagon className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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

