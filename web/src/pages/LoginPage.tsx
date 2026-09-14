import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { TrendingUp, Lock, Eye, EyeOff, AlertCircle, Loader2, Shield, UserPlus, Sparkles, CheckCircle2 } from 'lucide-react';

export default function LoginPage() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  // Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (mode === 'signup') {
      if (!name.trim()) {
        setError('Por favor, informe seu nome.');
        setIsLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('As senhas digitadas não coincidem.');
        setIsLoading(false);
        return;
      }
      if (password.length < 6) {
        setError('A senha deve ter no mínimo 6 caracteres.');
        setIsLoading(false);
        return;
      }

      const result = await signup(name.trim(), email.trim(), password);
      if (!result.success) {
        setError(result.error || 'Erro ao realizar cadastro.');
      }
    } else {
      const result = await login(email.trim(), password);
      if (!result.success) {
        setError(result.error || 'Credenciais inválidas.');
      }
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen w-screen bg-background flex items-center justify-center relative overflow-hidden font-sans">

      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-accent/5 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-emerald-500/5 blur-[120px] animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-[40%] left-[60%] w-[300px] h-[300px] rounded-full bg-violet-500/5 blur-[80px] animate-pulse" style={{ animationDelay: '3s' }} />

        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `linear-gradient(rgba(99,102,241,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.5) 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md px-4 py-8">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-accent to-violet-500 flex items-center justify-center shadow-2xl shadow-accent/30 mb-4">
            <TrendingUp className="w-8 h-8 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">MarketFlow Pro</h1>
          <p className="text-sm text-slate-400 mt-1 font-mono">Institutional Trading & SMC Analytics</p>
        </div>

        {/* Card */}
        <div className="bg-surface/80 backdrop-blur-xl border border-border/60 rounded-2xl shadow-2xl p-8">
          
          {/* Top Switcher Tabs */}
          <div className="grid grid-cols-2 gap-2 bg-background/60 p-1.5 rounded-xl border border-border/60 mb-6">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              className={`py-2 text-xs font-bold font-mono rounded-lg transition-all flex items-center justify-center space-x-1.5 ${mode === 'login' ? 'bg-accent text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Entrar</span>
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(''); }}
              className={`py-2 text-xs font-bold font-mono rounded-lg transition-all flex items-center justify-center space-x-1.5 ${mode === 'signup' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Criar Conta Grátis</span>
            </button>
          </div>

          <div className="flex items-center space-x-2 mb-4">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Acesso Seguro — JWT + AES-256</span>
          </div>

          {mode === 'signup' ? (
            <div className="mb-6">
              <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm mb-1">
                <Sparkles className="w-4 h-4" />
                <span>14 Dias Grátis de Acesso Total</span>
              </div>
              <p className="text-xs text-slate-400">Cadastre-se para conectar sua Bybit e seguir as estratégias institucionais.</p>
            </div>
          ) : (
            <div className="mb-6">
              <h2 className="text-xl font-bold text-white mb-1">Entrar na Plataforma</h2>
              <p className="text-sm text-slate-400">Faça login com suas credenciais de acesso.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {mode === 'signup' && (
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Seu Nome Completo
                </label>
                <input
                  id="signup-name"
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Carlos Silva"
                  className="w-full bg-background/80 border border-border/80 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all text-sm font-mono"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full bg-background/80 border border-border/80 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all text-sm font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                Senha
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-background/80 border border-border/80 rounded-xl px-4 py-3 pr-12 text-white placeholder-slate-600 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Confirmar Senha
                </label>
                <input
                  id="signup-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-background/80 border border-border/80 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all text-sm font-mono"
                />
              </div>
            )}

            {error && (
              <div className="flex items-center space-x-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm animate-in fade-in duration-200">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {mode === 'signup' && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 space-y-1 font-mono">
                <div className="flex items-center space-x-1.5 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Benefícios da Entrada Grátis:</span>
                </div>
                <p className="text-[11px] text-slate-300 pl-5">• Conexão Bybit Testnet e Mainnet em Margem Isolada</p>
                <p className="text-[11px] text-slate-300 pl-5">• Gestão de Risco Automática com Proteção de Saldo</p>
              </div>
            )}

            <button
              id="login-submit"
              type="submit"
              disabled={isLoading}
              className={`w-full py-3 rounded-xl text-white font-bold text-sm shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center space-x-2 mt-2 ${mode === 'signup' ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/30' : 'bg-gradient-to-r from-accent to-violet-600 hover:from-accent hover:to-violet-500 shadow-accent/30'}`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{mode === 'signup' ? 'Criando sua conta...' : 'Autenticando...'}</span>
                </>
              ) : (
                <>
                  {mode === 'signup' ? <UserPlus className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  <span>{mode === 'signup' ? 'Criar Conta Gratuita' : 'Acessar Plataforma'}</span>
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6 font-mono">
          © 2026 MarketFlow Pro · Dados criptografados · Acesso monitorado
        </p>
      </div>
    </div>
  );
}
