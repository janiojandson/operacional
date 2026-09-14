import React, { useState, useEffect } from 'react';
import { useAuth, authFetch } from '../contexts/AuthContext';
import {
  TrendingUp, Key, Wifi, WifiOff, DollarSign, BarChart2,
  AlertTriangle, CheckCircle, Loader2, RefreshCw, Download,
  Eye, EyeOff, LogOut, Shield, Activity, Clock,
  TrendingDown, Zap, FileSpreadsheet, Sparkles, Check,
  HelpCircle, Info, Bell, ExternalLink, Sliders
} from 'lucide-react';

type ClientTab = 'overview' | 'api-keys' | 'risk' | 'history';

interface AccountInfo {
  balance: number;
  availableBalance: number;
  equity: number;
  unrealisedPnl: number;
  riskPct: number;
  leverage: number;
  maxDailyLossUsd: number;
  maxDailyProfitUsd: number;
  isActive: boolean;
  apiConnected: boolean;
  bybitTestnet: boolean;
  hasApiKeys: boolean;
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

export default function ClientDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<ClientTab>('overview');
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<TradeRecord[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // API Keys form
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [testnet, setTestnet] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string; hint?: string; accountInfo?: any } | null>(null);

  // Risk form
  const [riskPct, setRiskPct] = useState(1.0);
  const [leverage, setLeverage] = useState(10);
  const [maxDailyLoss, setMaxDailyLoss] = useState(50);
  const [maxDailyProfit, setMaxDailyProfit] = useState(150);
  const [selectedPreset, setSelectedPreset] = useState<'conservative' | 'moderate' | 'aggressive' | 'custom'>('moderate');

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
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

  useEffect(() => {
    fetchAccount();
    fetchAnnouncements();
  }, []);

  useEffect(() => {
    if (activeTab === 'overview') { fetchAccount(); fetchPositions(); fetchAnnouncements(); }
    if (activeTab === 'history') fetchHistory();
  }, [activeTab]);

  // Refresh account every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchAccount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Presets inteligentes baseados na banca real
  const applyPreset = (type: 'conservative' | 'moderate' | 'aggressive') => {
    setSelectedPreset(type);
    const balance = account?.balance && account.balance > 0 ? account.balance : 100;

    if (type === 'conservative') {
      setRiskPct(0.5);
      setLeverage(5);
      setMaxDailyLoss(Number(Math.max(10, balance * 0.015).toFixed(2))); // 1.5% stop
      setMaxDailyProfit(Number(Math.max(20, balance * 0.03).toFixed(2))); // 3% meta
    } else if (type === 'moderate') {
      setRiskPct(1.0);
      setLeverage(10);
      setMaxDailyLoss(Number(Math.max(20, balance * 0.03).toFixed(2))); // 3% stop
      setMaxDailyProfit(Number(Math.max(50, balance * 0.06).toFixed(2))); // 6% meta
    } else if (type === 'aggressive') {
      setRiskPct(2.0);
      setLeverage(15);
      setMaxDailyLoss(Number(Math.max(30, balance * 0.05).toFixed(2))); // 5% stop
      setMaxDailyProfit(Number(Math.max(80, balance * 0.10).toFixed(2))); // 10% meta
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

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const res = await authFetch('/api/client/api-keys/test', { method: 'POST' });
    const data = await res.json();
    setTestResult(data);
    if (data.success) { notify('✅ Conexão com Bybit estabelecida!'); fetchAccount(); }
    else notify(data.error || 'Falha na conexão.', 'error');
    setTesting(false);
  };

  const handleSaveRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await authFetch('/api/client/risk', {
      method: 'POST',
      body: JSON.stringify({ riskPct, leverage, maxDailyLossUsd: maxDailyLoss, maxDailyProfitUsd: maxDailyProfit })
    });
    if (res.ok) { notify('✅ Configuração de risco salva com sucesso!'); fetchAccount(); }
    else notify('Erro ao salvar configuração.', 'error');
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

  // Projeção didática de risco em tempo real
  const currentBalance = account?.balance && account.balance > 0 ? account.balance : 100;
  const simulatedRiskUsd = (currentBalance * (riskPct / 100)).toFixed(2);
  const simulatedStopDist = 1.0; // 1% stop hipotético
  const simulatedNotional = (Number(simulatedRiskUsd) / (simulatedStopDist / 100)).toFixed(2);
  const simulatedMargin = (Number(simulatedNotional) / leverage).toFixed(2);

  // Dias restantes do plano
  const daysRemaining = account?.planExpiresAt
    ? Math.max(0, Math.ceil((account.planExpiresAt - Date.now()) / (1000 * 60 * 60 * 24)))
    : 14;

  return (
    <div className="min-h-screen bg-background text-slate-100 font-sans flex flex-col">

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
      <header className="h-14 bg-surface/95 border-b border-border/60 backdrop-blur-md flex items-center px-6 shrink-0">
        <div className="flex items-center space-x-3 flex-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-accent to-violet-500 flex items-center justify-center shadow-lg shadow-accent/30">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-sm font-black text-white">MarketFlow Pro</span>
            <span className="ml-2 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              {account?.bybitTestnet ? 'TESTNET' : 'MAINNET'}
            </span>
            <span className="ml-1.5 text-[10px] font-mono px-2 py-0.5 rounded bg-accent/20 text-accent border border-accent/30">
              {account?.planType === 'FREE_TRIAL' ? `TRIAL: ${daysRemaining}d restantes` : account?.planType || 'PRO'}
            </span>
          </div>
        </div>

        <nav className="flex items-center space-x-1">
          {([
            { id: 'overview', icon: Activity, label: 'Visão Geral' },
            { id: 'api-keys', icon: Key, label: 'API Bybit' },
            { id: 'risk', icon: Shield, label: 'Gerenciar Risco' },
            { id: 'history', icon: Clock, label: 'Histórico & Planilhas' }
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
          <div className="flex items-center space-x-1.5">
            {account?.apiConnected
              ? <><Wifi className="w-3.5 h-3.5 text-emerald-400" /><span className="text-xs text-emerald-400 font-mono">Bybit OK</span></>
              : <><WifiOff className="w-3.5 h-3.5 text-rose-400" /><span className="text-xs text-rose-400 font-mono">Sem API</span></>
            }
          </div>
          <span className="text-slate-600">|</span>
          <span className="text-xs text-slate-400 font-mono">{user?.name || user?.email}</span>
          <button onClick={logout} className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 transition-all">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6 max-w-6xl mx-auto w-full">

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
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Minha Conta — Bybit</h2>
                <p className="text-xs text-slate-400 mt-0.5">Visão consolidada do saldo, posições abertas e réplica do Master Quant.</p>
              </div>
              <button onClick={() => { fetchAccount(); fetchPositions(); }} className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white transition-colors bg-surface px-3 py-1.5 rounded-xl border border-border/60">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Atualizar Saldo</span>
              </button>
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

            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-surface border border-border/60 rounded-2xl p-5 shadow-lg shadow-black/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-mono uppercase">Saldo Total</span>
                  <DollarSign className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-black text-amber-400">${(account?.balance ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                <div className="text-xs text-slate-500 mt-1">USDT na carteira unificada</div>
              </div>

              <div className="bg-surface border border-border/60 rounded-2xl p-5 shadow-lg shadow-black/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-mono uppercase">Disponível</span>
                  <Activity className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-black text-emerald-400">${(account?.availableBalance ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
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
                  <span className="text-xs text-slate-400 font-mono uppercase">Risco & Alavancagem</span>
                  <Zap className="w-4 h-4 text-accent" />
                </div>
                <div className="text-2xl font-black text-accent">{account?.riskPct ?? '—'}% / {account?.leverage ?? '—'}x</div>
                <div className="text-xs text-slate-500 mt-1">Margem Isolada ativa</div>
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
                    <span className="text-slate-400">Trava de Stop Diário (Loss Máximo)</span>
                    <span className="text-rose-400 font-bold">-${account?.maxDailyLossUsd?.toFixed(2) ?? '—'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/30">
                    <span className="text-slate-400">Meta Diária (Gain Preservado)</span>
                    <span className="text-emerald-400 font-bold">+${account?.maxDailyProfitUsd?.toFixed(2) ?? '—'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-400">Status do Robô Copy AI</span>
                    <span className={`font-bold ${account?.isActive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {account?.isActive ? '● ATIVO & SINCRONIZADO' : '⛔ PAUSADO'}
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

            {/* Test Connection */}
            {account?.hasApiKeys && (
              <div className="bg-surface border border-border/60 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">Validar Conexão com a Bybit</h3>
                    <p className="text-xs text-slate-400">Testa se a Bybit aceita a chave e busca seu saldo real.</p>
                  </div>
                  <button
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-600/30 font-bold text-sm transition-all disabled:opacity-60 shrink-0"
                  >
                    {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                    <span>{testing ? 'Verificando...' : 'Testar Conexão'}</span>
                  </button>
                </div>

                {testResult && (
                  <div className={`p-4 rounded-xl border text-xs font-mono ${testResult.success ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300' : 'bg-rose-950/30 border-rose-500/30 text-rose-300'}`}>
                    {testResult.success ? (
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2"><CheckCircle className="w-4 h-4" /><span className="font-bold">{testResult.message}</span></div>
                        {testResult.accountInfo && (
                          <div className="text-slate-300">Saldo na Bybit: <span className="text-white font-bold">${Number(testResult.accountInfo.walletBalance).toFixed(2)} USDT</span></div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-start space-x-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div><div className="font-bold">{testResult.error}</div><div className="text-rose-400/70 mt-1">{testResult.hint}</div></div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── GERENCIAR RISCO ── */}
        {activeTab === 'risk' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white">Gerenciamento de Risco & Alavancagem</h2>
              <p className="text-xs text-slate-400 mt-0.5">Escolha um perfil quant pronto ou personalize seus limites de perda e ganho.</p>
            </div>

            {/* Presets Inteligentes de 1-Clique */}
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
                  {selectedPreset === 'conservative' && <Check className="w-4 h-4 text-emerald-400" />}
                </div>
                <div className="text-lg font-black text-white">0.5% / 5x</div>
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
                  {selectedPreset === 'moderate' && <Check className="w-4 h-4 text-accent" />}
                </div>
                <div className="text-lg font-black text-white">1.0% / 10x</div>
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
                  {selectedPreset === 'aggressive' && <Check className="w-4 h-4 text-purple-400" />}
                </div>
                <div className="text-lg font-black text-white">2.0% / 15x</div>
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
                  <span className="text-slate-400">Exemplo com sua banca atual (${currentBalance.toFixed(2)}):</span>
                  <div className="text-white font-bold mt-0.5">
                    Risco Máximo por Trade = <span className="text-emerald-400">${simulatedRiskUsd}</span> | Volume = ${simulatedNotional} | Margem Usada = <span className="text-amber-400">${simulatedMargin}</span>
                  </div>
                </div>
                <span className="px-2 py-1 rounded bg-accent/20 text-accent font-bold text-[10px]">CÁLCULO ATIVO</span>
              </div>
            </div>

            <form onSubmit={handleSaveRisk} className="bg-surface border border-border/60 rounded-2xl p-6 space-y-6">
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Risk % por Trade (Perda Máxima por Operação)</label>
                  <span className="text-sm font-black text-accent">{riskPct}%</span>
                </div>
                <input
                  type="range" min={0.1} max={5} step={0.1}
                  value={riskPct} onChange={e => { setRiskPct(Number(e.target.value)); setSelectedPreset('custom'); }}
                  className="w-full accent-accent cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                  <span>0.1% (Conservador)</span><span>1.0% (Recomendado)</span><span>5.0% (Máx. Permitido)</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Alavancagem em Margem Isolada</label>
                  <span className="text-sm font-black text-accent">{leverage}x</span>
                </div>
                <input
                  type="range" min={1} max={50} step={1}
                  value={leverage} onChange={e => { setLeverage(Number(e.target.value)); setSelectedPreset('custom'); }}
                  className="w-full accent-accent cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                  <span>1x (Sem alavancar)</span><span>10x (Padrão Bybit)</span><span>50x (Máximo)</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] text-rose-400 font-mono block mb-1">Stop Diário Máximo (Trava de Perda $)</label>
                  <input
                    type="number" min={1} step={0.5}
                    value={maxDailyLoss} onChange={e => { setMaxDailyLoss(Number(e.target.value)); setSelectedPreset('custom'); }}
                    className="w-full bg-background border border-rose-500/40 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-rose-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">O robô pausa se as perdas do dia atingirem esse valor.</span>
                </div>
                <div>
                  <label className="text-[11px] text-emerald-400 font-mono block mb-1">Meta Diária (Stop Gain $)</label>
                  <input
                    type="number" min={1} step={0.5}
                    value={maxDailyProfit} onChange={e => { setMaxDailyProfit(Number(e.target.value)); setSelectedPreset('custom'); }}
                    className="w-full bg-background border border-emerald-500/40 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Preserva o lucro do dia e suspende novas entradas.</span>
                </div>
              </div>

              <button type="submit" className="w-full py-3 rounded-xl bg-accent hover:bg-accent/80 text-white text-sm font-bold transition-all shadow-lg shadow-accent/20">
                Salvar Configurações de Risco
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
