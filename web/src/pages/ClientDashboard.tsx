import React, { useState, useEffect } from 'react';
import { useAuth, authFetch } from '../contexts/AuthContext';
import {
  TrendingUp, Key, Wifi, WifiOff, DollarSign, BarChart2,
  AlertTriangle, CheckCircle, Loader2, RefreshCw, Download,
  Eye, EyeOff, LogOut, Shield, Activity, Clock,
  TrendingDown, Zap, FileSpreadsheet, Lock,
  HelpCircle, Info, Bell, ExternalLink, Sliders, Power, AlertOctagon, ShieldAlert, Trash2, ArrowRightLeft
} from 'lucide-react';

type ClientTab = 'overview' | 'api-keys' | 'risk' | 'history';

interface AccountInfo {
  balance: number;
  availableBalance: number;
  equity: number;
  unrealisedPnl: number;
  fundingUsdt?: number;
  fundingBrl?: number;
  unifiedBrl?: number;
  brlBalance?: number;
  totalEquityUsd?: number;
  riskPct: number;
  leverage: number;
  maxDailyLossUsd: number;
  maxDailyProfitUsd: number;
  isActive: boolean;
  maskedKey?: string;
  planActive?: boolean;
  isVitalicio?: boolean;
  isVitrine?: boolean;
  isExpired?: boolean;
  syncEnabled: boolean;
  apiConnected: boolean;
  bybitTestnet: boolean;
  hasApiKeys: boolean;
  hasRealKeys?: boolean;
  realMaskedKey?: string;
  realConnected?: boolean;
  hasTestKeys?: boolean;
  testMaskedKey?: string;
  testConnected?: boolean;
  notificationPhone?: string;
  planType?: string;
  planExpiresAt?: number | null;
}

interface Position {
  symbol: string;
  side: 'Buy' | 'Sell';
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealisedPnl: number;
  leverage: number;
}

interface TradeRecord {
  id: string;
  symbol: string;
  side: string;
  entry_price: number;
  close_price: number | null;
  qty: number;
  notional_usd: number;
  pnl_usd: number | null;
  leverage: number | null;
  status: string;
  signal_reason: string | null;
  entry_time: number;
  close_time: number | null;
}

interface Announcement {
  id: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'PLAN_UPGRADE' | 'URGENT';
  action_url?: string;
  action_label?: string;
}

interface MasterFeedData {
  masterOnline: boolean;
  trackedCryptoPairs: Array<{ symbol: string; price: number; change24h: number }>;
  masterOpenPositions: Array<{
    id: string;
    symbol: string;
    type: string;
    entryPrice: number;
    currentPrice: number;
    pnl: number;
    pnlPct: number;
    entryTime: number;
    stopLoss: number;
    takeProfit: number;
    signalReason: string;
  }>;
  recentLogs: Array<{
    id: string;
    symbol: string;
    side: string;
    price: number;
    status: string;
    executedAt: number;
    reason: string;
  }>;
}

export default function ClientDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<ClientTab>('overview');
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<TradeRecord[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [masterFeed, setMasterFeed] = useState<MasterFeedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [panicLoading, setPanicLoading] = useState(false);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // API Keys form
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [testnet, setTestnet] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string; hint?: string; accountInfo?: any } | null>(null);

  // Risk form & Simulator
  const [simulatedBank, setSimulatedBank] = useState<number>(1000);
  const [riskPct, setRiskPct] = useState(1.0);
  const [leverage, setLeverage] = useState(10);
  const [maxDailyLoss, setMaxDailyLoss] = useState(50);
  const [maxDailyProfit, setMaxDailyProfit] = useState(150);
  const [autoConfig, setAutoConfig] = useState(true);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<'conservative' | 'moderate' | 'aggressive' | 'custom'>('moderate');

  const isPlanActive = account ? account.planActive !== false : user?.planActive !== false;

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const [transferringFunding, setTransferringFunding] = useState(false);

  const handleRefreshBalance = async () => {
    setRefreshingBalance(true);
    try {
      const res = await authFetch('/api/client/account/refresh', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        notify('✅ Saldo atualizado com a Bybit!');
        fetchAccount();
      } else {
        notify(data.error || 'Erro ao sincronizar com a Bybit.', 'error');
      }
    } catch {
      notify('Erro de conexão ao atualizar saldo.', 'error');
    } finally {
      setRefreshingBalance(false);
    }
  };

  const handleTransferFunding = async () => {
    setTransferringFunding(true);
    try {
      const res = await authFetch('/api/client/account/transfer-funding', {
        method: 'POST',
        body: JSON.stringify({ coin: 'USDT' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify(data.message || '✅ Saldo transferido com sucesso para a Conta Unificada (UTA)!');
        fetchAccount();
      } else {
        notify(data.message || data.error || 'Não foi possível transferir automaticamente.', 'error');
      }
    } catch {
      notify('Erro de conexão ao tentar transferir.', 'error');
    } finally {
      setTransferringFunding(false);
    }
  };

  const fetchAccount = async () => {
    try {
      const res = await authFetch('/api/client/account');
      if (res.ok) {
        const data = await res.json();
        setAccount(data);
        setRiskPct(data.riskPct);
        setLeverage(data.leverage);
        setMaxDailyLoss(data.maxDailyLossUsd);
        setMaxDailyProfit(data.maxDailyProfitUsd);
        if (data.autoConfigEnabled !== undefined) {
          setAutoConfig(data.autoConfigEnabled);
        }
        if (data.balance > 0 && simulatedBank === 1000) {
          setSimulatedBank(data.balance);
        }
      }
    } catch { }
  };

  const fetchPositions = async () => {
    try {
      const res = await authFetch('/api/client/positions');
      if (res.ok) setPositions(await res.json());
    } catch { }
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/client/history?limit=50');
      if (res.ok) setHistory(await res.json());
    } catch { }
    setLoading(false);
  };

  const fetchAnnouncements = async () => {
    try {
      const res = await authFetch('/api/client/announcements');
      if (res.ok) setAnnouncements(await res.json());
    } catch { }
  };

  const fetchMasterFeed = async () => {
    try {
      const res = await authFetch('/api/client/master-feed');
      if (res.ok) setMasterFeed(await res.json());
    } catch { }
  };

  useEffect(() => {
    fetchAccount();
    fetchAnnouncements();
    fetchMasterFeed();
  }, []);

  useEffect(() => {
    if (activeTab === 'overview') { 
      fetchAccount(); 
      fetchPositions(); 
      fetchAnnouncements(); 
      fetchMasterFeed();
    }
    if (activeTab === 'history') fetchHistory();
  }, [activeTab]);

  // Refresh account and master feed every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAccount();
      fetchMasterFeed();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Presets inteligentes baseados no simulador de banca
  const applyPreset = (type: 'conservative' | 'moderate' | 'aggressive') => {
    setSelectedPreset(type);
    const bank = simulatedBank > 0 ? simulatedBank : 100;

    if (type === 'conservative') {
      setRiskPct(0.5);
      setLeverage(5);
      setMaxDailyLoss(Number(Math.max(10, bank * 0.015).toFixed(2))); // 1.5% stop
      setMaxDailyProfit(Number(Math.max(20, bank * 0.03).toFixed(2))); // 3% meta
    } else if (type === 'moderate') {
      setRiskPct(1.0);
      setLeverage(10);
      setMaxDailyLoss(Number(Math.max(20, bank * 0.03).toFixed(2))); // 3% stop
      setMaxDailyProfit(Number(Math.max(50, bank * 0.06).toFixed(2))); // 6% meta
    } else if (type === 'aggressive') {
      setRiskPct(2.0);
      setLeverage(15);
      setMaxDailyLoss(Number(Math.max(30, bank * 0.05).toFixed(2))); // 5% stop
      setMaxDailyProfit(Number(Math.max(80, bank * 0.10).toFixed(2))); // 10% meta
    }
  };

  // Toggle Sincronização (Com Pânico ao desligar)
  const handleToggleSync = async () => {
    if (!isPlanActive) {
      notify('Seu plano está inativo. Assine para ativar a sincronização automatizada.', 'error');
      return;
    }

    setSyncLoading(true);
    const targetState = !account?.syncEnabled;
    try {
      const res = await authFetch('/api/client/sync-toggle', {
        method: 'POST',
        body: JSON.stringify({ enabled: targetState })
      });
      const data = await res.json();
      if (res.ok) {
        notify(data.message || (targetState ? 'Sincronização ativada!' : 'Sincronização desligada.'));
        fetchAccount();
        fetchPositions();
      } else {
        notify(data.error || 'Erro ao alterar sincronização.', 'error');
      }
    } catch {
      notify('Erro de conexão com o servidor.', 'error');
    } finally {
      setSyncLoading(false);
    }
  };

  // Botão de Pânico explícito
  const handlePanicClose = async () => {
    if (!window.confirm('⚠️ ATENÇÃO: Deseja realmente acionar o Protocolo de Pânico? Isso irá desligar a sincronização, cancelar todas as ordens e fechar a mercado todas as posições na Bybit.')) {
      return;
    }

    setPanicLoading(true);
    try {
      const res = await authFetch('/api/client/panic', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        notify(data.message || 'Protocolo de pânico executado na Bybit!');
        fetchAccount();
        fetchPositions();
      } else {
        notify(data.error || 'Erro ao acionar pânico.', 'error');
      }
    } catch {
      notify('Erro ao comunicar com a Bybit.', 'error');
    } finally {
      setPanicLoading(false);
    }
  };

  const handleSaveApiKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await authFetch('/api/client/api-keys', {
      method: 'POST',
      body: JSON.stringify({ apiKey, apiSecret, testnet })
    });
    const data = await res.json();
    if (res.ok) {
      notify('✅ Chaves salvas com criptografia AES-256!');
      setApiKey(''); setApiSecret('');
      fetchAccount();
    } else {
      notify(data.error || 'Erro ao salvar chaves.', 'error');
    }
  };

  const handleDeleteApiKeys = async (env?: 'REAL' | 'TESTNET') => {
    const label = env ? (env === 'REAL' ? 'Conta Real' : 'Testnet') : 'todas as contas';
    if (!window.confirm(`Tem certeza que deseja remover suas chaves de API da Bybit (${label})?`)) {
      return;
    }
    try {
      const url = env ? `/api/client/api-keys?env=${env}` : '/api/client/api-keys';
      const res = await authFetch(url, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        notify(`Chaves de API (${label}) removidas com sucesso.`);
        fetchAccount();
      } else {
        notify(data.error || 'Erro ao remover chaves.', 'error');
      }
    } catch {
      notify('Erro de conexão ao remover chaves.', 'error');
    }
  };

  const handleTestConnection = async (env?: 'REAL' | 'TESTNET') => {
    setTesting(true);
    setTestResult(null);
    const res = await authFetch('/api/client/api-keys/test', { 
      method: 'POST',
      body: JSON.stringify({ env })
    });
    const data = await res.json();
    setTestResult(data);
    if (data.success) { notify(`✅ Conexão com Bybit ${env || ''} estabelecida!`); fetchAccount(); }
    else notify(data.error || 'Falha na conexão.', 'error');
    setTesting(false);
  };

  const handleSaveRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await authFetch('/api/client/risk', {
      method: 'POST',
      body: JSON.stringify({ 
        riskPct, 
        leverage, 
        maxDailyLossUsd: autoConfig ? 0 : maxDailyLoss, 
        maxDailyProfitUsd: autoConfig ? 0 : maxDailyProfit,
        autoConfigEnabled: autoConfig
      })
    });
    if (res.ok) { notify('✅ Gestão de risco do projeto salva com sucesso!'); fetchAccount(); }
    else { const d = await res.json(); notify(d.error || 'Erro ao salvar risco.', 'error'); }
  };

  const handleDownloadHistory = async (format: 'excel' | 'csv') => {
    const token = localStorage.getItem('mfp_token');
    const res = await fetch(`/api/client/history/download?format=${format}`, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historico-operacoes-${Date.now()}.${format === 'excel' ? 'xls' : 'csv'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify(`✅ Planilha ${format.toUpperCase()} gerada e baixada!`);
  };

  const totalPnl = history.filter(t => t.pnl_usd != null).reduce((s, t) => s + (t.pnl_usd ?? 0), 0);
  const wins = history.filter(t => (t.pnl_usd ?? 0) > 0).length;
  const closed = history.filter(t => t.status === 'CLOSED').length;
  const winRate = closed > 0 ? ((wins / closed) * 100).toFixed(1) : '0';

  // Cálculos do Simulador de Risco Dinâmico
  const activeBank = simulatedBank > 0 ? simulatedBank : 100;
  const simulatedRiskUsd = (activeBank * (riskPct / 100)).toFixed(2);
  const simulatedStopDist = 1.0; // 1% stop hipotético
  const simulatedNotional = (Number(simulatedRiskUsd) / (simulatedStopDist / 100)).toFixed(2);
  const simulatedMargin = (Number(simulatedNotional) / leverage).toFixed(2);

  // Tamanhos calculados para cada preset
  const conservativeNotional = ((activeBank * 0.005) / 0.01).toFixed(2);
  const conservativeMargin = (Number(conservativeNotional) / 5).toFixed(2);

  const moderateNotional = ((activeBank * 0.01) / 0.01).toFixed(2);
  const moderateMargin = (Number(moderateNotional) / 10).toFixed(2);

  const aggressiveNotional = ((activeBank * 0.02) / 0.01).toFixed(2);
  const aggressiveMargin = (Number(aggressiveNotional) / 15).toFixed(2);

  const checkoutUrl = 'https://wa.me/?text=' + encodeURIComponent('Olá! Gostaria de ativar meu plano no Copy Trading Bybit.');

  return (
    <div className="min-h-screen w-full bg-background text-slate-100 font-sans flex flex-col">

      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl font-mono text-sm flex items-center space-x-2 animate-in fade-in slide-in-from-top-2 duration-300 ${
          notification.type === 'success' ? 'bg-emerald-900/90 border border-emerald-500/50 text-emerald-300' : 'bg-rose-900/90 border border-rose-500/50 text-rose-300'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span>{notification.msg}</span>
        </div>
      )}

      {/* Header */}
      <header className="h-auto md:h-14 bg-surface/95 border-b border-border/60 backdrop-blur-md flex flex-wrap items-center px-4 md:px-6 py-2 md:py-0 shrink-0 gap-2 md:gap-0 z-30">
        <div className="flex items-center space-x-3 flex-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-accent to-violet-500 flex items-center justify-center shadow-lg shadow-accent/30 shrink-0">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-sm font-black text-white">MarketFlow Pro</span>
            <span className="ml-2 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              {account?.bybitTestnet ? 'TESTNET' : 'MAINNET'}
            </span>
            <span className={`ml-1.5 text-[10px] font-mono px-2 py-0.5 rounded border ${isPlanActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'}`}>
              {isPlanActive ? 'PLANO ATIVO' : 'MODO VITRINE (LEITURA)'}
            </span>
          </div>
        </div>

        <nav className="flex items-center space-x-1 overflow-x-auto w-full md:w-auto py-1 md:py-0">
          {([
            { id: 'overview', icon: Activity, label: 'Visão Geral' },
            { id: 'api-keys', icon: Key, label: 'API Bybit' },
            { id: 'risk', icon: Shield, label: 'Simulador & Risco' },
            { id: 'history', icon: Clock, label: 'Histórico & Planilhas' }
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
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

        <div className="flex items-center space-x-3 ml-auto md:ml-4">
          <div className="flex items-center space-x-1.5">
            {account?.apiConnected
              ? <><Wifi className="w-3.5 h-3.5 text-emerald-400" /><span className="text-xs text-emerald-400 font-mono hidden sm:inline">Bybit OK</span></>
              : <><WifiOff className="w-3.5 h-3.5 text-rose-400" /><span className="text-xs text-rose-400 font-mono hidden sm:inline">Sem API</span></>
            }
          </div>
          <span className="text-slate-600 hidden sm:inline">|</span>
          <span className="text-xs text-slate-400 font-mono truncate max-w-[120px]">{user?.name || user?.email}</span>
          <button onClick={logout} className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 transition-all">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Banner de Modo Vitrine (Inativos) */}
      {!isPlanActive && (
        <div className="bg-gradient-to-r from-amber-950/80 via-surface to-amber-950/80 border-b border-amber-500/40 px-4 md:px-6 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
          <div className="flex items-center space-x-2 text-xs font-mono text-amber-300">
            <Lock className="w-4 h-4 text-amber-400 shrink-0" />
            <span><strong>Modo Vitrine Ativo:</strong> Seu painel está em modo Somente Leitura. O Simulador de Risco e a visualização de resultados estão liberados.</span>
          </div>
          <a
            href={checkoutUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold font-mono hover:bg-amber-400 transition-all flex items-center space-x-1 shrink-0"
          >
            <span>Assinar Plano via WhatsApp</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-4 md:p-6 max-w-6xl mx-auto w-full pb-24">

        {/* 📢 Avisos em Tela / Banners do Administrador */}
        {announcements.length > 0 && (
          <div className="space-y-3 mb-6">
            {announcements.map(ann => (
              <div
                key={ann.id}
                className={`p-4 rounded-2xl border flex items-start justify-between space-x-3 ${
                  ann.type === 'URGENT'
                    ? 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                    : ann.type === 'PLAN_UPGRADE'
                    ? 'bg-gradient-to-r from-violet-950/50 to-accent/20 border-accent/40 text-violet-100'
                    : ann.type === 'WARNING'
                    ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                    : 'bg-surface border-border/70 text-slate-200'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <Bell className="w-4 h-4 shrink-0 mt-0.5 text-accent" />
                  <div>
                    <h4 className="font-bold text-sm text-white mb-0.5">{ann.title}</h4>
                    <p className="text-xs text-slate-300">{ann.message}</p>
                  </div>
                </div>
                {ann.action_url && (
                  <a
                    href={ann.action_url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-bold hover:bg-accent/80 transition-all flex items-center space-x-1"
                  >
                    <span>{ann.action_label || 'Ver Mais'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── VISÃO GERAL ── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Minha Conta — Bybit</h2>
                <p className="text-xs text-slate-400 mt-0.5">Visão consolidada do saldo, posições abertas e réplica do Master Quant.</p>
              </div>

              {/* Botões de Controle: Sincronização & Pânico */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleToggleSync}
                  disabled={syncLoading}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                    !isPlanActive
                      ? 'bg-surface text-slate-400 border-border/60 hover:border-amber-500/50 cursor-pointer'
                      : account?.syncEnabled
                      ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-600/30'
                      : 'bg-rose-600/20 text-rose-400 border-rose-500/40 hover:bg-rose-600/30'
                  }`}
                >
                  {!isPlanActive ? (
                    <>
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span>Sincronização (Bloqueado)</span>
                    </>
                  ) : syncLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Power className="w-3.5 h-3.5" />
                      <span>{account?.syncEnabled ? 'Sincronização LIGADA' : 'Sincronização DESLIGADA'}</span>
                    </>
                  )}
                </button>

                {/* Botão de Pânico */}
                <button
                  onClick={handlePanicClose}
                  disabled={panicLoading}
                  className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 hover:bg-rose-900 font-bold text-xs transition-all"
                  title="Cancela todas as ordens e fecha todas as posições abertas na Bybit a mercado"
                >
                  {panicLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />}
                  <span>Pânico (Zerar Bybit)</span>
                </button>

                {/* Botão de Atualizar Saldo ao vivo com a Bybit */}
                <button
                  onClick={handleRefreshBalance}
                  disabled={refreshingBalance}
                  className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-surface border border-border/60 hover:border-amber-500/50 text-slate-300 hover:text-white font-bold text-xs transition-all cursor-pointer"
                  title="Consulta saldo e posições em tempo real diretamente na Bybit"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${refreshingBalance ? 'animate-spin' : ''}`} />
                  <span>{refreshingBalance ? 'Atualizando...' : 'Atualizar Saldo Bybit'}</span>
                </button>
              </div>
            </div>


            {!account?.hasApiKeys && (
              <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start space-x-4 text-sm">
                <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="font-bold text-amber-400 text-base">API Bybit não conectada</p>
                  <p className="text-amber-300/80 text-xs">Para que as ordens do Master sejam executadas automaticamente na sua conta com a alocação proporcional calibrada, conecte suas chaves na aba <strong>API Bybit</strong>.</p>
                  <button
                    onClick={() => setActiveTab('api-keys')}
                    className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 transition-all"
                  >
                    Conectar Minha Bybit Agora
                  </button>
                </div>
              </div>
            )}

            {/* 💡 Banner Assistente: Saldo em BRL (Reais) detectado na Bybit */}
            {((account?.brlBalance ?? 0) > 0 || (account?.fundingBrl ?? 0) > 0) && (
              <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex items-start space-x-4 text-sm shadow-xl shadow-amber-500/5">
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
                  <ArrowRightLeft className="w-6 h-6" />
                </div>
                <div className="space-y-2 flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <p className="font-bold text-white text-base">
                      Saldo em Reais Identificado: <span className="text-amber-400 font-mono">R$ {((account?.brlBalance ?? 0) > 0 ? account?.brlBalance : account?.fundingBrl)?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> <span className="text-xs text-slate-400 font-normal">(~${(((account?.brlBalance ?? 0) > 0 ? account?.brlBalance : account?.fundingBrl) ?? 0 / 5.15).toFixed(2)} USD)</span>
                    </p>
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold border border-amber-500/30 self-start sm:self-auto">
                      CONVERSÃO NECESSÁRIA PARA FUTUROS
                    </span>
                  </div>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    Identificamos seu saldo em Reais na Bybit! Como o robô opera contratos futuros em paridade com o dólar cripto, esse valor precisa ser convertido para <strong>USDT</strong>. Na sua tela da Bybit (em Trading Unificado), clique no botão <strong>"Converter"</strong> (no topo) para converter BRL em USDT instantaneamente com <strong>taxa zero</strong>.
                  </p>
                  <div className="pt-2 flex flex-wrap gap-2.5 items-center">
                    <a
                      href="https://www.bybit.com/trade/spot/USDT/BRL"
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all flex items-center space-x-1.5 shadow-lg shadow-amber-500/20 cursor-pointer"
                    >
                      <span>Abrir Conversor Bybit (BRL ➡️ USDT)</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={handleRefreshBalance}
                      disabled={refreshingBalance}
                      className="px-4 py-2 rounded-xl bg-surface border border-border/60 hover:bg-white/10 text-white font-bold text-xs transition-all flex items-center space-x-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${refreshingBalance ? 'animate-spin' : ''}`} />
                      <span>{refreshingBalance ? 'Sincronizando...' : 'Já converti na Bybit, Atualizar Saldo'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ⚡ Banner Assistente: Saldo USDT na Conta de Financiamento pronto para mover */}
            {(account?.fundingUsdt ?? 0) > 0 && (
              <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start space-x-4 text-sm">
                <Zap className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <p className="font-bold text-emerald-300 text-base">
                      ${account?.fundingUsdt?.toFixed(2)} USDT Disponível na Conta de Financiamento
                    </p>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold self-start sm:self-auto">
                      PRONTO PARA MOVER
                    </span>
                  </div>
                  <p className="text-emerald-200/80 text-xs">
                    Você possui USDT na Conta de Financiamento da Bybit. Transfira para a Conta de Trading Unificada (UTA) para que o robô utilize esse valor como margem operacional.
                  </p>
                  <div className="pt-2 flex flex-wrap gap-2 items-center">
                    <button
                      onClick={handleTransferFunding}
                      disabled={transferringFunding}
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all flex items-center space-x-1.5 shadow-lg shadow-emerald-500/20 cursor-pointer"
                    >
                      {transferringFunding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRightLeft className="w-3.5 h-3.5" />}
                      <span>Mover para Conta Unificada Agora (1 Clique)</span>
                    </button>
                    <button
                      onClick={handleRefreshBalance}
                      disabled={refreshingBalance}
                      className="px-3.5 py-2 rounded-xl bg-surface border border-border/60 hover:bg-white/10 text-white font-bold text-xs transition-all"
                    >
                      Atualizar Saldo
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-surface border border-border/60 rounded-2xl p-5 shadow-lg shadow-black/20 relative group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-mono uppercase">Saldo Total</span>
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={handleRefreshBalance}
                      disabled={refreshingBalance}
                      title="Sincronizar saldo ao vivo na Bybit"
                      className="p-1 rounded-md hover:bg-white/10 text-amber-400 transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${refreshingBalance ? 'animate-spin' : ''}`} />
                    </button>
                    <DollarSign className="w-4 h-4 text-amber-400" />
                  </div>
                </div>
                <div className="text-2xl font-black text-amber-400">
                  ${(account?.balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                  <span>USDT margem futuros</span>
                  {((account?.brlBalance ?? 0) > 0 || (account?.fundingBrl ?? 0) > 0) && (
                    <span className="text-[10px] text-amber-400 font-mono font-bold">
                      + R$ {((account?.brlBalance ?? 0) > 0 ? account?.brlBalance : account?.fundingBrl)?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} BRL
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-surface border border-border/60 rounded-2xl p-5 shadow-lg shadow-black/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-mono uppercase">Disponível</span>
                  <Activity className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-black text-emerald-400">${(account?.availableBalance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div className="text-xs text-slate-500 mt-1">Margem livre para trades</div>
              </div>

              <div className="bg-surface border border-border/60 rounded-2xl p-5 shadow-lg shadow-black/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-mono uppercase">P&L Aberto</span>
                  {(account?.unrealisedPnl ?? 0) >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />}
                </div>
                <div className={`text-2xl font-black ${(account?.unrealisedPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {(account?.unrealisedPnl ?? 0) >= 0 ? '+' : ''}${(account?.unrealisedPnl ?? 0).toFixed(2)}
                </div>
                <div className="text-xs text-slate-500 mt-1">Lucro/Prejuízo flutuante</div>
              </div>

              <div className="bg-surface border border-border/60 rounded-2xl p-5 shadow-lg shadow-black/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-mono uppercase">Sincronização Copy</span>
                  <Zap className="w-4 h-4 text-accent" />
                </div>
                <div className={`text-xl font-black ${account?.syncEnabled ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {account?.syncEnabled ? 'SINCRONIZADO' : 'DESLIGADO'}
                </div>
                <div className="text-xs text-slate-500 mt-1">{account?.riskPct ?? '1.0'}% / {account?.leverage ?? '10'}x Isolada</div>
              </div>
            </div>

            {/* Protections and Positions */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface border border-border/60 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <span>Proteções & Automação</span>
                  </h3>
                  <button onClick={() => setActiveTab('risk')} className="text-xs text-accent hover:underline flex items-center space-x-1 font-mono">
                    <Sliders className="w-3 h-3" />
                    <span>Ajustar</span>
                  </button>
                </div>
                <div className="space-y-2 font-mono text-xs">
                  <div className="flex justify-between items-center py-2 border-b border-border/30">
                    <span className="text-slate-400">Regime Operacional</span>
                    <span className="text-emerald-400 font-bold">24/7 Contínuo (Ininterrupto)</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/30">
                    <span className="text-slate-400">Stop Loss Técnico por Ordem</span>
                    <span className="text-rose-400 font-bold">{account?.riskPct ?? 1.0}% (${((account?.balance ?? 0) * ((account?.riskPct ?? 1.0) / 100)).toFixed(2)} USDT)</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/30">
                    <span className="text-slate-400">Alvo da Operação (Take Profit)</span>
                    <span className="text-emerald-400 font-bold">Estratégia Quant (Direto na Bybit)</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-400">Status da Sincronização Bybit</span>
                    <span className={`font-bold ${account?.syncEnabled ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {account?.syncEnabled ? '● LIGADA & SINCRONIZADA' : '⛔ DESLIGADA'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Open Positions */}
              <div className="bg-surface border border-border/60 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center space-x-2">
                  <BarChart2 className="w-4 h-4 text-accent" />
                  <span>Posições Ativas na Bybit ({positions.length})</span>
                </h3>
                {positions.length === 0 ? (
                  <div className="text-sm text-slate-500 text-center py-8">Nenhuma posição aberta no momento. O robô entrará automaticamente no próximo sinal do Master.</div>
                ) : (
                  <div className="space-y-2">
                    {positions.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-background/50 border border-border/40 font-mono text-xs">
                        <div>
                          <span className="font-bold text-white">{p.symbol}</span>
                          <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${p.side === 'Buy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>{p.side}</span>
                          <span className="ml-2 text-slate-500">{p.leverage}x (Isolada)</span>
                        </div>
                        <span className={`font-bold ${p.unrealisedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {p.unrealisedPnl >= 0 ? '+' : ''}${p.unrealisedPnl.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── PAINEL DE ACOMPANHAMENTO DO MASTER QUANT & RADAR DE REPLICAÇÃO ── */}
            <div className="bg-surface border border-border/60 rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/40">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                    <h3 className="text-base font-bold text-white flex items-center space-x-2">
                      <span>Radar Master Quant & Feed de Operações</span>
                    </h3>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold border border-emerald-500/30">
                      MASTER AO VIVO
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Acompanhe em tempo real o que a estratégia quantitativa principal está analisando e como as ordens são sincronizadas com a sua Bybit.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-xs font-mono text-slate-400">Sincronização com o Master:</span>
                  <span className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold border ${
                    account?.syncEnabled 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}>
                    {account?.syncEnabled ? '● PRONTO PARA DISPARO' : 'DESLIGADO'}
                  </span>
                </div>
              </div>

              {/* Pares Cripto Rastreados pelo Robô na Bybit */}
              <div>
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-2">Pares Cripto Monitorados na Bybit</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono">
                  {(masterFeed?.trackedCryptoPairs && masterFeed.trackedCryptoPairs.length > 0 ? masterFeed.trackedCryptoPairs : [
                    { symbol: 'BTC/USDT', price: 95333, change24h: 1.4 },
                    { symbol: 'ETH/USDT', price: 2985, change24h: 2.1 },
                    { symbol: 'SOL/USDT', price: 318, change24h: 0.7 }
                  ]).map((cp, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-background/60 border border-border/40 flex items-center justify-between">
                      <div>
                        <span className="text-white font-bold text-xs block">{cp.symbol}</span>
                        <span className="text-slate-400 text-[11px]">${Number(cp.price).toLocaleString()}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cp.change24h >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
                        {cp.change24h >= 0 ? '+' : ''}{cp.change24h}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Posições Atuais do Master vs Conta do Cliente */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                    Posições em Andamento no Master ({masterFeed?.masterOpenPositions?.length ?? 0})
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Atualização em tempo real
                  </span>
                </div>

                {(!masterFeed?.masterOpenPositions || masterFeed.masterOpenPositions.length === 0) ? (
                  <div className="p-4 rounded-xl bg-background/40 border border-border/30 text-center text-xs text-slate-400 font-mono">
                    O Master está atualmente líquido (sem posições abertas). Aguardando próximo padrão de fluxo institucional.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {masterFeed.masterOpenPositions.map((mp, i) => {
                      // Verifica se o cliente já tem essa posição aberta na Bybit
                      const clientHasPos = positions.some(p => p.symbol === mp.symbol);
                      return (
                        <div key={i} className="p-3.5 rounded-xl bg-background/60 border border-border/40 font-mono text-xs flex flex-col md:flex-row md:items-center justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-white text-sm">{mp.symbol}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${mp.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                {mp.type}
                              </span>
                              <span className="text-slate-400 text-[11px]">Entrada: ${mp.entryPrice?.toLocaleString()}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center space-x-3">
                              <span>Alvo (TP): <strong className="text-emerald-400">${mp.takeProfit?.toLocaleString()}</strong></span>
                              <span>Stop (SL): <strong className="text-rose-400">${mp.stopLoss?.toLocaleString()}</strong></span>
                            </div>
                          </div>

                          <div className="flex items-center space-x-3 self-end md:self-auto">
                            {clientHasPos ? (
                              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold flex items-center space-x-1">
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>REPLICADA NA SUA BYBIT</span>
                              </span>
                            ) : (
                              <div className="text-right">
                                <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-bold block">
                                  ⏳ ABERTA ANTES DA SUA SINCRONIZAÇÃO
                                </span>
                                <span className="text-[9px] text-slate-400 block mt-0.5">
                                  Para sua proteção, o robô entrará no próximo disparo novo
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Feed de Auditoria e Log de Sincronização do Cliente */}
              <div>
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-2">
                  Registro de Atividades do Copy Trader (Tempo Real)
                </span>
                <div className="p-3 rounded-xl bg-background/80 border border-border/40 font-mono text-[11px] space-y-1.5 max-h-44 overflow-y-auto">
                  <div className="text-emerald-400 flex items-center space-x-2">
                    <span className="text-slate-500">[{new Date().toLocaleTimeString('pt-BR')}]</span>
                    <span>🟢 Sincronização institucional 24/7 ATIVA na nuvem. Conta Bybit conectada com ${account?.balance?.toFixed(2)} USDT.</span>
                  </div>
                  <div className="text-slate-400 flex items-center space-x-2">
                    <span className="text-slate-500">[{new Date().toLocaleTimeString('pt-BR')}]</span>
                    <span>📡 Monitorando canais de liquidez institucional e order flow (BTC, ETH, SOL).</span>
                  </div>
                  {masterFeed?.recentLogs && masterFeed.recentLogs.length > 0 && masterFeed.recentLogs.map((lg, idx) => (
                    <div key={idx} className="text-slate-300 flex items-center space-x-2 border-t border-border/20 pt-1">
                      <span className="text-slate-500">[{new Date(lg.executedAt).toLocaleTimeString('pt-BR')}]</span>
                      <span className={lg.status === 'EXECUTED' ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                        {lg.reason}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── API BYBIT ── */}
        {activeTab === 'api-keys' && (
          <div className="max-w-2xl mx-auto space-y-5">
            <div>
              <h2 className="text-xl font-bold text-white">Conectar API Bybit</h2>
              <p className="text-xs text-slate-400 mt-1">Suas chaves são criptografadas com AES-256 no banco de dados e nunca são expostas.</p>
            </div>

            {/* Instruções */}
            <div className="p-5 rounded-2xl bg-accent/5 border border-accent/20 text-sm space-y-3">
              <p className="font-bold text-accent flex items-center space-x-1.5">
                <HelpCircle className="w-4 h-4" />
                <span>Passo a Passo Rápido na Bybit:</span>
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-300 text-xs font-mono">
                <li>Acesse sua conta em <strong className="text-white">Bybit.com → Perfil → Gerenciamento de API</strong></li>
                <li>Clique em <strong className="text-white">Criar Nova Chave</strong> → Escolha <em>"Chave de API gerada pelo sistema"</em></li>
                <li>Habilite as permissões: ✅ <strong className="text-emerald-400">Contrato (Contract - Order / Leitura e Escrita)</strong></li>
                <li>⚠️ <strong>NÃO</strong> marque Saques (Withdrawals). Nossa plataforma nunca solicita acesso a saques.</li>
                <li>Cole a API Key e o Secret abaixo e salve.</li>
              </ol>
            </div>

            {/* Dica de Banca Mínima */}
            <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs font-mono text-indigo-300">
              <span className="font-bold text-indigo-400 flex items-center space-x-1.5 mb-1">
                <ShieldAlert className="w-4 h-4" />
                <span>Gestão Inteligente de Lotes:</span>
              </span>
              O MarketFlow Pro lê automaticamente seu saldo real em USDT na Bybit a cada sinal e calcula o tamanho dos lotes dinamicamente. <br/><br/>
              Recomendamos uma banca mínima de <strong className="text-white">100 a 200 USDT</strong> para garantir margem suficiente para os lotes mínimos das corretoras sem risco de liquidação por spread.
            </div>

            <form onSubmit={handleSaveApiKeys} className="bg-surface border border-border/60 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-white">Credenciais da Corretora</h3>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <span className="text-xs font-mono text-slate-400">Ambiente:</span>
                  <div
                    onClick={() => setTestnet(!testnet)}
                    className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${testnet ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full m-0.5 transition-transform ${testnet ? '' : 'translate-x-5'}`} />
                  </div>
                  <span className={`text-xs font-bold font-mono ${testnet ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {testnet ? 'TESTNET (Sem Risco)' : 'CONTA REAL (Mainnet)'}
                  </span>
                </label>
              </div>

              {testnet && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 font-mono">
                  ⚠️ Modo Testnet ativo — use as chaves do testnet.bybit.com para testar sem dinheiro real.
                </div>
              )}

              <div>
                <label className="text-[11px] text-slate-400 font-mono block mb-1">API Key</label>
                <input
                  type="text"
                  required
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="Ex: rG8xkLm4920..."
                  className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-accent transition-all"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 font-mono block mb-1">API Secret</label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    required
                    value={apiSecret}
                    onChange={e => setApiSecret(e.target.value)}
                    placeholder="••••••••••••••••"
                    className="w-full bg-background border border-border rounded-xl px-4 py-2.5 pr-12 text-white font-mono text-sm focus:outline-none focus:border-accent transition-all"
                  />
                  <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button type="submit" className="w-full py-3 rounded-xl bg-accent hover:bg-accent/80 text-white text-sm font-bold transition-all shadow-lg shadow-accent/20">
                  Salvar Chaves Criptografadas
                </button>
              </div>
            </form>

            {/* Chaves Cadastradas & Gerenciamento Multi-Ambiente */}
            {account?.hasApiKeys && (
              <div className="space-y-4 mt-6">
                {/* Card de Conta Real */}
                {(account.hasRealKeys || (!account.bybitTestnet && account.hasApiKeys)) && (
                  <div className="bg-surface border border-emerald-500/30 rounded-2xl p-6 space-y-4 shadow-lg shadow-emerald-950/10">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center space-x-2">
                          <Lock className="w-4 h-4 text-emerald-400" />
                          <h3 className="text-sm font-bold text-white">Chave Bybit — CONTA REAL</h3>
                          <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            MAINNET ATIVA
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Conexão oficial para operações com saldo real na Bybit.</p>
                      </div>
                      
                      {/* Status & Toggle */}
                      <div className="flex items-center space-x-4 bg-background p-3 rounded-xl border border-border/50">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1">Status Real</span>
                          <div className="flex items-center space-x-1.5">
                            <div className={`w-2 h-2 rounded-full ${account.realConnected ?? account.apiConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                            <span className={`text-xs font-bold ${account.realConnected ?? account.apiConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {account.realConnected ?? account.apiConnected ? '🟢 Pronta para uso' : '🔴 Pendente / Erro'}
                            </span>
                          </div>
                        </div>
                        
                        <div className="w-px h-8 bg-border/50" />
                        
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1">Copy Trade</span>
                          <button
                            onClick={handleToggleSync}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${account.syncEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}
                            title={account.syncEnabled ? 'Desligar sincronização' : 'Ligar sincronização'}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${account.syncEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
                      <div className="flex items-center space-x-3">
                        <span className="text-xs text-emerald-400 font-mono bg-emerald-500/10 px-2 py-1 rounded">API KEY REAL</span>
                        <code className="text-sm font-mono text-white tracking-widest">{account.realMaskedKey || account.maskedKey || '••••••••'}****************</code>
                        <span className="text-[10px] text-slate-400 border border-border px-2 py-1 rounded-md">AES-256</span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => handleTestConnection('REAL')}
                          disabled={testing}
                          className="px-3 py-1.5 rounded-lg bg-surface border border-emerald-500/30 text-xs text-emerald-300 hover:text-white hover:border-emerald-400 flex items-center space-x-1.5 transition-all"
                        >
                          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          <span>Testar Real</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteApiKeys('REAL')}
                          className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-all"
                          title="Excluir Chave de Conta Real"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Card de Testnet */}
                {(account.hasTestKeys || (account.bybitTestnet && account.hasApiKeys)) && (
                  <div className="bg-surface border border-amber-500/30 rounded-2xl p-6 space-y-4 shadow-lg shadow-amber-950/10">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center space-x-2">
                          <Lock className="w-4 h-4 text-amber-400" />
                          <h3 className="text-sm font-bold text-white">Chave Bybit — TESTNET (Sem Risco)</h3>
                          <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            TESTNET
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Ambiente de simulação e testes com saldo fictício.</p>
                      </div>
                      
                      {/* Status */}
                      <div className="flex items-center space-x-4 bg-background p-3 rounded-xl border border-border/50">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1">Status Testnet</span>
                          <div className="flex items-center space-x-1.5">
                            <div className={`w-2 h-2 rounded-full ${account.testConnected ?? account.apiConnected ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'}`} />
                            <span className={`text-xs font-bold ${account.testConnected ?? account.apiConnected ? 'text-amber-400' : 'text-rose-400'}`}>
                              {account.testConnected ?? account.apiConnected ? '🟡 Pronta para teste' : '🔴 Pendente / Erro'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-amber-500/5 rounded-xl border border-amber-500/10">
                      <div className="flex items-center space-x-3">
                        <span className="text-xs text-amber-400 font-mono bg-amber-500/10 px-2 py-1 rounded">API KEY TESTNET</span>
                        <code className="text-sm font-mono text-white tracking-widest">{account.testMaskedKey || account.maskedKey || '••••••••'}****************</code>
                        <span className="text-[10px] text-slate-400 border border-border px-2 py-1 rounded-md">AES-256</span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => handleTestConnection('TESTNET')}
                          disabled={testing}
                          className="px-3 py-1.5 rounded-lg bg-surface border border-amber-500/30 text-xs text-amber-300 hover:text-white hover:border-amber-400 flex items-center space-x-1.5 transition-all"
                        >
                          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          <span>Testar Testnet</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteApiKeys('TESTNET')}
                          className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-all"
                          title="Excluir Chave Testnet"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {testResult && (
                  <div className={`p-3 rounded-xl text-xs font-mono border ${testResult.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
                    {testResult.message || testResult.error}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── GERENCIAR RISCO & SIMULADOR ── */}
        {activeTab === 'risk' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Simulador de Risco & Alavancagem</h2>
                <p className="text-xs text-slate-400 mt-0.5">Calcule o peso das operações e dimensione o tamanho exato dos lotes na Bybit.</p>
              </div>
            </div>

            {/* Input do Simulador de Banca */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-surface to-accent/10 border border-accent/30 flex items-center justify-between">
              <div className="space-y-1">
                <label className="text-xs font-bold text-accent uppercase tracking-wider block">
                  Simulador de Banca (Valor em USD)
                </label>
                <p className="text-xs text-slate-400">Insira o saldo hipotético ou real para calcular o peso das ordens:</p>
              </div>
              <div className="relative w-48">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                <input
                  type="number"
                  min={10}
                  step={50}
                  value={simulatedBank}
                  onChange={e => setSimulatedBank(Number(e.target.value) || 0)}
                  className="w-full bg-background border border-accent/50 rounded-xl pl-8 pr-4 py-2.5 text-white font-mono font-bold text-base focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            {/* Presets Inteligentes com Cálculo Dinâmico de Peso/Lote */}
            <div className="grid grid-cols-3 gap-4">
              <button
                type="button"
                onClick={() => applyPreset('conservative')}
                className={`p-4 rounded-2xl border text-left transition-all ${
                  selectedPreset === 'conservative'
                    ? 'bg-emerald-950/40 border-emerald-500/60 shadow-lg shadow-emerald-500/10'
                    : 'bg-surface border-border/60 hover:border-border'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">🟢 Conservador</span>
                  {selectedPreset === 'conservative' && <CheckCircle className="w-4 h-4 text-emerald-400" />}
                </div>
                <div className="text-lg font-black text-white">0.5% / 5x</div>
                <div className="text-xs font-mono text-emerald-300 mt-1 font-bold">
                  Margem: ${conservativeMargin} | Vol: ${conservativeNotional}
                </div>
                <p className="text-[11px] text-slate-400 mt-1 font-mono">Foco em preservação de capital. Stop diário em 1.5%.</p>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('moderate')}
                className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden ${
                  selectedPreset === 'moderate'
                    ? 'bg-accent/15 border-accent shadow-lg shadow-accent/20'
                    : 'bg-surface border-border/60 hover:border-border'
                }`}
              >
                <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-accent text-[9px] font-black text-white">RECOMENDADO</div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-accent uppercase tracking-wider">🟡 Moderado</span>
                  {selectedPreset === 'moderate' && <CheckCircle className="w-4 h-4 text-accent" />}
                </div>
                <div className="text-lg font-black text-white">1.0% / 10x</div>
                <div className="text-xs font-mono text-accent mt-1 font-bold">
                  Margem: ${moderateMargin} | Vol: ${moderateNotional}
                </div>
                <p className="text-[11px] text-slate-400 mt-1 font-mono">Equilíbrio quant ideal. Stop diário em 3.0%.</p>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('aggressive')}
                className={`p-4 rounded-2xl border text-left transition-all ${
                  selectedPreset === 'aggressive'
                    ? 'bg-purple-950/40 border-purple-500/60 shadow-lg shadow-purple-500/10'
                    : 'bg-surface border-border/60 hover:border-border'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">🔴 Arrojado</span>
                  {selectedPreset === 'aggressive' && <CheckCircle className="w-4 h-4 text-purple-400" />}
                </div>
                <div className="text-lg font-black text-white">2.0% / 15x</div>
                <div className="text-xs font-mono text-purple-300 mt-1 font-bold">
                  Margem: ${aggressiveMargin} | Vol: ${aggressiveNotional}
                </div>
                <p className="text-[11px] text-slate-400 mt-1 font-mono">Trader Pro experiente. Stop diário em 5.0%.</p>
              </button>
            </div>

            {/* Explicação Didática e Exemplo Prático */}
            <div className="p-5 rounded-2xl bg-surface border border-border/60 text-xs font-mono space-y-3">
              <div className="flex items-center space-x-2 text-white font-bold text-sm">
                <Info className="w-4 h-4 text-accent" />
                <span>Como funciona o cálculo de alocação na Bybit:</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-slate-300">
                <div className="p-3 rounded-xl bg-background/50 border border-border/40 space-y-1">
                  <span className="text-accent font-bold">1. Margem Isolada (Isolated):</span>
                  <p className="text-[11px] text-slate-400">Apenas a margem alocada no trade fica em risco. O resto da sua banca não pode ser liquidado.</p>
                </div>
                <div className="p-3 rounded-xl bg-background/50 border border-border/40 space-y-1">
                  <span className="text-emerald-400 font-bold">2. Risk % por Trade:</span>
                  <p className="text-[11px] text-slate-400">Se o Stop Loss for acionado, você perde estritamente os {riskPct}% configurados.</p>
                </div>
              </div>

              {/* Simulação em tempo real */}
              <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-between">
                <div>
                  <span className="text-slate-400">Simulação para Banca de ${activeBank.toFixed(2)}:</span>
                  <div className="text-white font-bold mt-0.5">
                    Risco Máximo por Trade = <span className="text-emerald-400">${simulatedRiskUsd}</span> | Volume da Posição = ${simulatedNotional} | Margem Usada = <span className="text-amber-400">${simulatedMargin}</span>
                  </div>
                </div>
                <span className="px-2 py-1 rounded bg-accent/20 text-accent font-bold text-[10px]">CÁLCULO ATIVO</span>
              </div>
            </div>

            {/* Card de Modo Automático Oficial do Projeto */}
            {/* Card de Modo Automático Oficial do Projeto */}
            <div className={`p-6 rounded-2xl border transition-all ${
              autoConfig 
                ? 'bg-gradient-to-r from-emerald-950/40 via-surface to-emerald-950/30 border-emerald-500/50 shadow-xl shadow-emerald-500/10' 
                : 'bg-surface border-border/60'
            }`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <Shield className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-base font-bold text-white">Configuração Oficial do Projeto (Execução Contínua 24/7)</h3>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono text-[10px] font-black border border-emerald-500/30">
                      PADRÃO INSTITUCIONAL
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    O robô opera de forma ininterrupta 24 horas por dia, 7 dias por semana, pelo tempo que você desejar (sem limite de prazo ou pausas forçadas). O controle de risco é 100% individual por ordem com Stop Loss técnico e dimensionamento matemático de 1.0% da banca (${activeBank.toFixed(2)} USDT).
                  </p>
                </div>

                <div className="flex items-center space-x-3 bg-background/80 px-4 py-3 rounded-xl border border-border/50">
                  <span className="text-xs font-mono font-bold text-slate-300">
                    {autoConfig ? 'PADRÃO PROJETO (ATIVO)' : 'PERSONALIZADO (MANUAL)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !autoConfig;
                      setAutoConfig(next);
                      if (next) {
                        setRiskPct(1.0);
                        setLeverage(10);
                        setMaxDailyLoss(0);
                        setMaxDailyProfit(0);
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${autoConfig ? 'bg-emerald-500' : 'bg-slate-700'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoConfig ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>

              {autoConfig && (
                <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-border/40 font-mono text-xs">
                  <div className="p-2.5 rounded-xl bg-background/60 border border-border/40">
                    <span className="text-slate-400 text-[10px] block">Regime de Operação</span>
                    <span className="text-emerald-400 font-bold text-sm">24/7 Contínuo (Ininterrupto)</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-background/60 border border-border/40">
                    <span className="text-slate-400 text-[10px] block">Risco Máximo por Trade</span>
                    <span className="text-emerald-400 font-bold text-sm">1.0% (${(activeBank * 0.01).toFixed(2)})</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-background/60 border border-border/40">
                    <span className="text-slate-400 text-[10px] block">Alavancagem</span>
                    <span className="text-accent font-bold text-sm">10x Isolada</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-background/60 border border-border/40">
                    <span className="text-slate-400 text-[10px] block">Proteção Stop Loss</span>
                    <span className="text-rose-400 font-bold text-sm">Técnico na Bybit</span>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleSaveRisk} className="bg-surface border border-border/60 rounded-2xl p-6 space-y-6">
              <div className="flex items-center justify-between pb-2 border-b border-border/40">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  {autoConfig ? 'Parâmetros Travados pelo Projeto Oficial' : 'Ajuste Manual Personalizado'}
                </span>
                {autoConfig && (
                  <span className="text-[11px] text-emerald-400 font-mono font-bold flex items-center space-x-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Blindagem Institucional Ativa — Execução Contínua</span>
                  </span>
                )}
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Risk % por Trade (Perda Máxima por Operação)</label>
                  <span className="text-sm font-black text-accent">{riskPct}%</span>
                </div>
                <input
                  type="range" min={0.1} max={5} step={0.1}
                  disabled={autoConfig}
                  value={riskPct} onChange={e => { setRiskPct(Number(e.target.value)); setSelectedPreset('custom'); }}
                  className={`w-full accent-accent ${autoConfig ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                  <span>0.1% (Conservador)</span><span>1.0% (Padrão Institucional do Projeto)</span><span>5.0% (Máx. Permitido)</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Alavancagem em Margem Isolada</label>
                  <span className="text-sm font-black text-accent">{leverage}x</span>
                </div>
                <input
                  type="range" min={1} max={50} step={1}
                  disabled={autoConfig}
                  value={leverage} onChange={e => { setLeverage(Number(e.target.value)); setSelectedPreset('custom'); }}
                  className={`w-full accent-accent ${autoConfig ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                  <span>1x (Sem alavancar)</span><span>10x (Padrão Bybit / Projeto)</span><span>50x (Máximo)</span>
                </div>
              </div>

              {autoConfig ? (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 space-y-1">
                  <p className="font-bold flex items-center space-x-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>Regime Operacional Contínuo 24/7 (Ininterrupto)</span>
                  </p>
                  <p className="text-[11px] text-emerald-300/80">
                    No padrão institucional do projeto, o robô opera continuamente 24/7 pelo tempo que você desejar (30, 60, 90 dias ou mais). Travas de stop ou meta diária arbitrárias ficam desativadas para que o robô não perca operações subsequentes por oscilações normais intraday. A proteção patrimonial é estritamente garantida pelo Stop Loss técnico enviado em cada ordem e pela margem isolada 10x.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-rose-400 font-mono block mb-1">Stop Diário Manual (Opcional $)</label>
                    <input
                      type="number" min={0} step={0.5}
                      value={maxDailyLoss} onChange={e => { setMaxDailyLoss(Number(e.target.value)); setSelectedPreset('custom'); }}
                      className="w-full bg-background border border-rose-500/40 rounded-xl px-4 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-rose-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">Deixe 0 para desativar e operar contínuo 24/7.</span>
                  </div>
                  <div>
                    <label className="text-[11px] text-emerald-400 font-mono block mb-1">Meta Diária Manual (Opcional $)</label>
                    <input
                      type="number" min={0} step={0.5}
                      value={maxDailyProfit} onChange={e => { setMaxDailyProfit(Number(e.target.value)); setSelectedPreset('custom'); }}
                      className="w-full bg-background border border-emerald-500/40 rounded-xl px-4 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">Deixe 0 para deixar os lucros correrem sem corte diário.</span>
                  </div>
                </div>
              )}

              <button type="submit" className="w-full py-3 rounded-xl bg-accent hover:bg-accent/80 text-white text-sm font-bold transition-all shadow-lg shadow-accent/20">
                {autoConfig ? 'Confirmar Padrão Oficial do Projeto (Execução Contínua 24/7)' : 'Salvar Configurações Manuais'}
              </button>
            </form>
          </div>
        )}

        {/* ── HISTÓRICO & PLANILHAS ── */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Histórico de Operações</h2>
                <p className="text-xs text-slate-400 mt-0.5">Acompanhe todos os trades executados na sua conta e baixe a planilha formatada.</p>
              </div>
              <div className="flex items-center space-x-2">
                <button onClick={fetchHistory} className="p-2 rounded-xl text-slate-400 hover:text-white bg-surface border border-border/60 transition-all">
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => handleDownloadHistory('excel')}
                  className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-600/30 text-xs font-bold transition-all"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Baixar Planilha Excel (.xls)</span>
                </button>
                <button
                  onClick={() => handleDownloadHistory('csv')}
                  className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-surface text-slate-300 border border-border/60 hover:text-white text-xs font-bold transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </button>
              </div>
            </div>

            {/* Summary KPI Cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-surface border border-border/60 rounded-2xl p-5 text-center">
                <div className="text-xs text-slate-400 font-mono uppercase mb-1">P&L Líquido Realizado</div>
                <div className={`text-2xl font-black ${totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
                </div>
              </div>
              <div className="bg-surface border border-border/60 rounded-2xl p-5 text-center">
                <div className="text-xs text-slate-400 font-mono uppercase mb-1">Assertividade (Win Rate)</div>
                <div className={`text-2xl font-black ${Number(winRate) >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>{winRate}%</div>
              </div>
              <div className="bg-surface border border-border/60 rounded-2xl p-5 text-center">
                <div className="text-xs text-slate-400 font-mono uppercase mb-1">Total de Trades Registrados</div>
                <div className="text-2xl font-black text-white">{history.length}</div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-surface border border-border/60 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border/40 text-slate-400 uppercase tracking-wider text-[10px] bg-background/40">
                      <th className="text-left px-5 py-3.5">Par / Ativo</th>
                      <th className="text-center px-5 py-3.5">Lado</th>
                      <th className="text-right px-5 py-3.5">Preço Entrada</th>
                      <th className="text-right px-5 py-3.5">Preço Saída</th>
                      <th className="text-right px-5 py-3.5">Quantidade</th>
                      <th className="text-right px-5 py-3.5">P&L ($)</th>
                      <th className="text-center px-5 py-3.5">Status</th>
                      <th className="text-right px-5 py-3.5">Data/Hora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(t => (
                      <tr key={t.id} className="border-b border-border/20 hover:bg-surface-hover/30 transition-colors">
                        <td className="px-5 py-3 text-white font-semibold">{t.symbol}</td>
                        <td className={`px-5 py-3 text-center font-bold ${t.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>{t.side}</td>
                        <td className="px-5 py-3 text-right">${Number(t.entry_price).toLocaleString()}</td>
                        <td className="px-5 py-3 text-right">{t.close_price ? `$${Number(t.close_price).toLocaleString()}` : '—'}</td>
                        <td className="px-5 py-3 text-right text-slate-400">{t.qty}</td>
                        <td className={`px-5 py-3 text-right font-bold ${(t.pnl_usd ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {t.pnl_usd != null ? `${t.pnl_usd >= 0 ? '+' : ''}$${Number(t.pnl_usd).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${t.status === 'CLOSED' ? 'bg-slate-500/20 text-slate-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{t.status}</span>
                        </td>
                        <td className="px-5 py-3 text-right text-slate-400">{new Date(t.entry_time).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {history.length === 0 && !loading && (
                  <div className="py-12 text-center text-slate-500 font-mono text-xs">Nenhuma operação realizada ainda. O robô registrará seus trades aqui.</div>
                )}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

