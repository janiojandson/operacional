import React, { useState, useEffect } from 'react';
import { useAuth, authFetch } from '../contexts/AuthContext';
import {
  TrendingUp, Key, Wifi, WifiOff, DollarSign, BarChart2,
  AlertTriangle, CheckCircle, Loader2, RefreshCw, Download,
  Eye, EyeOff, LogOut, Shield, Activity, Settings, Clock,
  Target, TrendingDown, Zap
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

export default function ClientDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<ClientTab>('overview');
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // API Keys form
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [testnet, setTestnet] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string; accountInfo?: any } | null>(null);

  // Risk form
  const [riskPct, setRiskPct] = useState(1);
  const [leverage, setLeverage] = useState(10);
  const [maxDailyLoss, setMaxDailyLoss] = useState(50);
  const [maxDailyProfit, setMaxDailyProfit] = useState(150);

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
    const res = await authFetch('/api/client/positions');
    if (res.ok) setPositions(await res.json());
  };

  const fetchHistory = async () => {
    setLoading(true);
    const res = await authFetch('/api/client/history?limit=50');
    if (res.ok) setHistory(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    fetchAccount();
  }, []);

  useEffect(() => {
    if (activeTab === 'overview') { fetchAccount(); fetchPositions(); }
    if (activeTab === 'history') fetchHistory();
  }, [activeTab]);

  // Refresh account every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchAccount, 30000);
    return () => clearInterval(interval);
  }, []);

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
    if (res.ok) { notify('✅ Configuração de risco salva!'); fetchAccount(); }
    else notify('Erro ao salvar configuração.', 'error');
  };

  const handleDownloadHistory = async () => {
    const token = localStorage.getItem('mfp_token');
    const res = await fetch('/api/client/history/download', { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historico-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const totalPnl = history.filter(t => t.pnl_usd != null).reduce((s, t) => s + (t.pnl_usd ?? 0), 0);
  const wins = history.filter(t => (t.pnl_usd ?? 0) > 0).length;
  const closed = history.filter(t => t.status === 'CLOSED').length;
  const winRate = closed > 0 ? ((wins / closed) * 100).toFixed(1) : '0';

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
          </div>
        </div>

        <nav className="flex items-center space-x-1">
          {([
            { id: 'overview', icon: Activity, label: 'Visão Geral' },
            { id: 'api-keys', icon: Key, label: 'API Bybit' },
            { id: 'risk', icon: Shield, label: 'Risco' },
            { id: 'history', icon: Clock, label: 'Histórico' }
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

      <main className="flex-1 overflow-auto p-6">

        {/* ── VISÃO GERAL ── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Minha Conta — Bybit</h2>
              <button onClick={() => { fetchAccount(); fetchPositions(); }} className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white transition-colors">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Atualizar</span>
              </button>
            </div>

            {!account?.hasApiKeys && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start space-x-3 text-sm">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-400 mb-1">API Bybit não configurada</p>
                  <p className="text-amber-300/70">Vá em <strong>API Bybit</strong> para conectar sua conta à corretora e ativar o robô de copy trade.</p>
                </div>
              </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-surface border border-border/60 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-mono uppercase">Saldo</span>
                  <DollarSign className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-black text-amber-400">${(account?.balance ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                <div className="text-xs text-slate-500 mt-1">USDT na corretora</div>
              </div>

              <div className="bg-surface border border-border/60 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-mono uppercase">Disponível</span>
                  <Activity className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-black text-emerald-400">${(account?.availableBalance ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                <div className="text-xs text-slate-500 mt-1">Para novas posições</div>
              </div>

              <div className="bg-surface border border-border/60 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-mono uppercase">P&L Aberto</span>
                  {(account?.unrealisedPnl ?? 0) >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />}
                </div>
                <div className={`text-2xl font-black ${(account?.unrealisedPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {(account?.unrealisedPnl ?? 0) >= 0 ? '+' : ''}${(account?.unrealisedPnl ?? 0).toFixed(2)}
                </div>
                <div className="text-xs text-slate-500 mt-1">Posições abertas</div>
              </div>

              <div className="bg-surface border border-border/60 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-mono uppercase">Configuração</span>
                  <Zap className="w-4 h-4 text-accent" />
                </div>
                <div className="text-2xl font-black text-accent">{account?.riskPct ?? '—'}% / {account?.leverage ?? '—'}x</div>
                <div className="text-xs text-slate-500 mt-1">Risco por trade / Alavancagem</div>
              </div>
            </div>

            {/* Protection Limits */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface border border-border/60 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>Proteções Ativas</span>
                </h3>
                <div className="space-y-2 font-mono text-xs">
                  <div className="flex justify-between items-center py-2 border-b border-border/30">
                    <span className="text-slate-400">Stop Diário (Loss Máximo)</span>
                    <span className="text-rose-400 font-bold">-${account?.maxDailyLossUsd?.toFixed(2) ?? '—'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/30">
                    <span className="text-slate-400">Meta Diária (Gain Target)</span>
                    <span className="text-emerald-400 font-bold">+${account?.maxDailyProfitUsd?.toFixed(2) ?? '—'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-400">Status do Robô</span>
                    <span className={`font-bold ${account?.isActive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {account?.isActive ? '● ATIVO' : '⛔ BLOQUEADO'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Open Positions */}
              <div className="bg-surface border border-border/60 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center space-x-2">
                  <BarChart2 className="w-4 h-4 text-accent" />
                  <span>Posições Abertas ({positions.length})</span>
                </h3>
                {positions.length === 0 ? (
                  <div className="text-sm text-slate-500 text-center py-8">Nenhuma posição aberta no momento.</div>
                ) : (
                  <div className="space-y-2">
                    {positions.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-background/50 border border-border/40 font-mono text-xs">
                        <div>
                          <span className="font-bold text-white">{p.symbol}</span>
                          <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${p.side === 'Buy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>{p.side}</span>
                          <span className="ml-2 text-slate-500">{p.leverage}x</span>
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
          <div className="max-w-2xl space-y-5">
            <h2 className="text-xl font-bold text-white">Conectar API Bybit</h2>

            {/* Instruções */}
            <div className="p-4 rounded-2xl bg-accent/5 border border-accent/20 text-sm space-y-2">
              <p className="font-bold text-accent">📋 Como criar sua API Key na Bybit:</p>
              <ol className="list-decimal list-inside space-y-1 text-slate-400 text-xs font-mono">
                <li>Acesse bybit.com → Conta → Gerenciamento de API</li>
                <li>Clique em "Criar Nova Chave" → Tipo: "Chave de API"</li>
                <li>Nome: "MarketFlow Pro"</li>
                <li>Permissões necessárias: ✅ <strong className="text-white">Contrato — Pedidos</strong> (só isso)</li>
                <li>❌ Não habilite "Saques" — nunca necessário</li>
                <li>Salve a API Key e o Secret antes de fechar</li>
              </ol>
            </div>

            <form onSubmit={handleSaveApiKeys} className="bg-surface border border-border/60 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-white">Credenciais da API</h3>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <span className="text-xs font-mono text-slate-400">Testnet</span>
                  <div
                    onClick={() => setTestnet(!testnet)}
                    className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${testnet ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full m-0.5 transition-transform ${testnet ? '' : 'translate-x-5'}`} />
                  </div>
                  <span className={`text-xs font-bold font-mono ${testnet ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {testnet ? 'TESTNET' : 'MAINNET'}
                  </span>
                </label>
              </div>

              {testnet && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 font-mono">
                  ⚠️ Modo Testnet ativo — use as chaves do testnet.bybit.com. Nenhum dinheiro real será utilizado.
                </div>
              )}

              <div>
                <label className="text-[11px] text-slate-400 font-mono block mb-1">API Key</label>
                <input
                  type="text"
                  required
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="Ex: rG8xkLm..."
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

              <div className="flex space-x-2 pt-2">
                <button type="submit" className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent/80 text-white text-sm font-bold transition-all">
                  Salvar com Criptografia AES-256
                </button>
              </div>
            </form>

            {/* Test Connection */}
            {account?.hasApiKeys && (
              <div className="bg-surface border border-border/60 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-white mb-3">Testar Conexão com a Bybit</h3>
                <button
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-600/30 font-bold text-sm transition-all disabled:opacity-60"
                >
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                  <span>{testing ? 'Testando...' : 'Testar Conexão'}</span>
                </button>

                {testResult && (
                  <div className={`mt-3 p-3 rounded-xl border text-xs font-mono ${testResult.success ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300' : 'bg-rose-950/30 border-rose-500/30 text-rose-300'}`}>
                    {testResult.success ? (
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2"><CheckCircle className="w-3.5 h-3.5" /><span className="font-bold">{testResult.message}</span></div>
                        {testResult.accountInfo && (
                          <div className="text-slate-300">Saldo detectado: <span className="text-white font-bold">${Number(testResult.accountInfo.walletBalance).toFixed(2)} USDT</span></div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-start space-x-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <div><div className="font-bold">{testResult.error}</div><div className="text-rose-400/70 mt-1">{testResult.hint}</div></div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── RISCO ── */}
        {activeTab === 'risk' && (
          <div className="max-w-2xl space-y-5">
            <h2 className="text-xl font-bold text-white">Configuração de Risco</h2>

            <div className="p-4 rounded-2xl bg-surface border border-border/60 text-xs font-mono space-y-2">
              <p className="text-slate-400">📐 <strong className="text-white">Fórmula de Sizing:</strong></p>
              <p className="text-slate-300">Notional = (Banca × Risk%) / StopDist% | Margem = Notional / Alavancagem</p>
              <p className="text-slate-500">Ex: Banca $100, Risk 1%, Stop 1% → Notional $100, Alavancagem 10x → Margem $10 consumida</p>
            </div>

            <form onSubmit={handleSaveRisk} className="bg-surface border border-border/60 rounded-2xl p-6 space-y-5">
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Risk % por Trade</label>
                  <span className="text-sm font-black text-accent">{riskPct}%</span>
                </div>
                <input
                  type="range" min={0.1} max={5} step={0.1}
                  value={riskPct} onChange={e => setRiskPct(Number(e.target.value))}
                  className="w-full accent-accent"
                />
                <div className="flex justify-between text-[10px] text-slate-600 font-mono mt-1">
                  <span>0.1% (Conservador)</span><span>2.5% (Padrão)</span><span>5% (Agressivo)</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Alavancagem (Margem Isolada)</label>
                  <span className="text-sm font-black text-accent">{leverage}x</span>
                </div>
                <input
                  type="range" min={1} max={50} step={1}
                  value={leverage} onChange={e => setLeverage(Number(e.target.value))}
                  className="w-full accent-accent"
                />
                <div className="flex justify-between text-[10px] text-slate-600 font-mono mt-1">
                  <span>1x</span><span>10x (Padrão)</span><span>50x (Máx. SaaS)</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] text-rose-400 font-mono block mb-1">Stop Diário Máximo (Loss $)</label>
                  <input
                    type="number" min={1} step={0.5}
                    value={maxDailyLoss} onChange={e => setMaxDailyLoss(Number(e.target.value))}
                    className="w-full bg-background border border-rose-500/30 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-rose-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-emerald-400 font-mono block mb-1">Meta Diária (Gain Target $)</label>
                  <input
                    type="number" min={1} step={0.5}
                    value={maxDailyProfit} onChange={e => setMaxDailyProfit(Number(e.target.value))}
                    className="w-full bg-background border border-emerald-500/30 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <button type="submit" className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent/80 text-white text-sm font-bold transition-all">
                Salvar Configurações de Risco
              </button>
            </form>
          </div>
        )}

        {/* ── HISTÓRICO ── */}
        {activeTab === 'history' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Histórico de Operações</h2>
              <div className="flex space-x-2">
                <button onClick={fetchHistory} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover transition-all">
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={handleDownloadHistory} className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 text-xs font-bold transition-all">
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar CSV</span>
                </button>
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-surface border border-border/60 rounded-2xl p-4 text-center">
                <div className="text-xs text-slate-500 font-mono uppercase mb-1">P&L Total</div>
                <div className={`text-xl font-black ${totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
                </div>
              </div>
              <div className="bg-surface border border-border/60 rounded-2xl p-4 text-center">
                <div className="text-xs text-slate-500 font-mono uppercase mb-1">Win Rate</div>
                <div className={`text-xl font-black ${Number(winRate) >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>{winRate}%</div>
              </div>
              <div className="bg-surface border border-border/60 rounded-2xl p-4 text-center">
                <div className="text-xs text-slate-500 font-mono uppercase mb-1">Total de Trades</div>
                <div className="text-xl font-black text-white">{history.length}</div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-surface border border-border/60 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border/40 text-slate-500 uppercase tracking-wider text-[10px]">
                      <th className="text-left px-5 py-3">Par</th>
                      <th className="text-center px-5 py-3">Lado</th>
                      <th className="text-right px-5 py-3">Entrada</th>
                      <th className="text-right px-5 py-3">Saída</th>
                      <th className="text-right px-5 py-3">Quantidade</th>
                      <th className="text-right px-5 py-3">P&L</th>
                      <th className="text-center px-5 py-3">Status</th>
                      <th className="text-right px-5 py-3">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(t => (
                      <tr key={t.id} className="border-b border-border/20 hover:bg-surface-hover/20 transition-colors">
                        <td className="px-5 py-3 text-white font-semibold">{t.symbol}</td>
                        <td className={`px-5 py-3 text-center font-bold ${t.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>{t.side}</td>
                        <td className="px-5 py-3 text-right">${Number(t.entry_price).toLocaleString()}</td>
                        <td className="px-5 py-3 text-right">{t.close_price ? `$${Number(t.close_price).toLocaleString()}` : '—'}</td>
                        <td className="px-5 py-3 text-right text-slate-400">{t.qty}</td>
                        <td className={`px-5 py-3 text-right font-bold ${(t.pnl_usd ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {t.pnl_usd != null ? `${t.pnl_usd >= 0 ? '+' : ''}$${Number(t.pnl_usd).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.status === 'CLOSED' ? 'bg-slate-500/20 text-slate-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{t.status}</span>
                        </td>
                        <td className="px-5 py-3 text-right text-slate-500">{new Date(t.entry_time).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {history.length === 0 && !loading && (
                  <div className="py-12 text-center text-slate-500">Nenhuma operação registrada ainda.</div>
                )}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
