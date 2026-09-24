import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { TrendingUp, Lock, Eye, EyeOff, AlertCircle, Loader2, Shield, UserPlus, Phone, KeyRound, ArrowLeft, CheckCircle2 } from 'lucide-react';

export default function LoginPage() {
  const { login, signup } = useAuth();
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : 'login';
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot_password'>(initialMode);

  useEffect(() => {
    const urlMode = searchParams.get('mode');
    if (urlMode === 'signup') {
      setMode('signup');
    } else if (urlMode === 'login') {
      setMode('login');
    }
  }, [searchParams]);

  // Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Forgot password OTP states
  const [forgotStep, setForgotStep] = useState<'request_otp' | 'verify_otp'>('request_otp');
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Máscara de telefone WhatsApp (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);

    if (value.length <= 2) {
      setWhatsapp(value.length > 0 ? `(${value}` : '');
    } else if (value.length <= 7) {
      setWhatsapp(`(${value.slice(0, 2)}) ${value.slice(2)}`);
    } else {
      setWhatsapp(`(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsLoading(true);

    if (mode === 'signup') {
      if (!name.trim()) {
        setError('Por favor, informe seu nome completo.');
        setIsLoading(false);
        return;
      }
      const digitsPhone = whatsapp.replace(/\D/g, '');
      if (digitsPhone.length < 10) {
        setError('Por favor, informe um número de WhatsApp válido com DDD.');
        setIsLoading(false);
        return;
      }
      const formattedPhone = whatsapp.trim().startsWith('+') ? `+${digitsPhone}` : `+55${digitsPhone}`;
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

      const result = await signup(name.trim(), email.trim(), password, formattedPhone, confirmPassword);
      if (!result.success) {
        setError(result.error || 'Erro ao realizar cadastro.');
      }
    } else if (mode === 'login') {
      const result = await login(email.trim(), password);
      if (!result.success) {
        setError(result.error || 'Credenciais inválidas.');
      }
    }

    setIsLoading(false);
  };

  // Solicitar envio do OTP via WhatsApp
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: forgotIdentifier })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erro ao solicitar código de recuperação.');
      } else {
        setSuccessMsg(data.message || 'Código enviado para seu WhatsApp!');
        setForgotStep('verify_otp');
      }
    } catch {
      setError('Erro de conexão com o servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  // Validar OTP e redefinir senha
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (newPassword.length < 6) {
      setError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otp: otpCode.trim(),
          newPassword,
          identifier: forgotIdentifier
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Código OTP inválido ou expirado.');
      } else {
        setSuccessMsg('Senha alterada com sucesso! Você já pode entrar.');
        setTimeout(() => {
          setMode('login');
          setForgotStep('request_otp');
          setOtpCode('');
          setNewPassword('');
          setConfirmNewPassword('');
          setError('');
          setSuccessMsg('');
        }, 2000);
      }
    } catch {
      setError('Erro de conexão ao redefinir senha.');
    } finally {
      setIsLoading(false);
    }
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

        {/* Back to Presell / Home */}
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 transition-colors font-medium group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            <span>Voltar para apresentação do projeto</span>
          </Link>
        </div>

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-accent to-violet-500 flex items-center justify-center shadow-2xl shadow-accent/30 mb-4">
            <TrendingUp className="w-8 h-8 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">MarketFlow Pro</h1>
          <p className="text-sm text-slate-400 mt-1 font-mono">Institutional Trading & Bybit Copy Engine</p>
        </div>

        {/* Card */}
        <div className="bg-surface/80 backdrop-blur-xl border border-border/60 rounded-2xl shadow-2xl p-8">
          
          {mode !== 'forgot_password' ? (
            <>
              {/* Top Switcher Tabs */}
              <div className="grid grid-cols-2 gap-2 bg-background/60 p-1.5 rounded-xl border border-border/60 mb-6">
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
                  className={`py-2 text-xs font-bold font-mono rounded-lg transition-all flex items-center justify-center space-x-1.5 ${mode === 'login' ? 'bg-accent text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Entrar</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('signup'); setError(''); setSuccessMsg(''); }}
                  className={`py-2 text-xs font-bold font-mono rounded-lg transition-all flex items-center justify-center space-x-1.5 ${mode === 'signup' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Criar Conta</span>
                </button>
              </div>

              <div className="flex items-center space-x-2 mb-4">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Acesso Seguro — JWT + AES-256</span>
              </div>

              <div className="mb-6">
                <h2 className="text-xl font-bold text-white mb-1">
                  {mode === 'signup' ? 'Cadastre sua Conta' : 'Entrar na Plataforma'}
                </h2>
                <p className="text-sm text-slate-400">
                  {mode === 'signup' 
                    ? 'Informe seus dados para iniciar a sincronização com a Bybit.' 
                    : 'Faça login com suas credenciais de acesso.'}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                
                {mode === 'signup' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Nome Completo *
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
                    E-mail *
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

                {mode === 'signup' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                      <span className="flex items-center space-x-1.5">
                        <Phone className="w-3.5 h-3.5 text-emerald-400" />
                        <span>WhatsApp (com DDD) *</span>
                      </span>
                    </label>
                    <input
                      id="signup-whatsapp"
                      type="text"
                      required
                      value={whatsapp}
                      onChange={handlePhoneChange}
                      placeholder="(11) 99999-9999"
                      maxLength={15}
                      className="w-full bg-background/80 border border-border/80 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all text-sm font-mono"
                    />
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                      Senha *
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => { setMode('forgot_password'); setError(''); setSuccessMsg(''); }}
                        className="text-xs text-accent hover:underline font-mono"
                      >
                        Esqueci a senha
                      </button>
                    )}
                  </div>
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
                      Confirmar Senha *
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
                      <span>{mode === 'signup' ? 'Concluir Cadastro' : 'Acessar Plataforma'}</span>
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            /* Fluxo Esqueci a Senha via OTP WhatsApp */
            <div>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); setForgotStep('request_otp'); }}
                className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-4 font-mono"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar ao Login</span>
              </button>

              <div className="flex items-center space-x-2 mb-2">
                <KeyRound className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-bold text-white">Recuperação de Senha</h2>
              </div>
              <p className="text-xs text-slate-400 mb-6">
                {forgotStep === 'request_otp' 
                  ? 'Informe seu e-mail ou WhatsApp cadastrado para enviarmos um código OTP de 6 dígitos.'
                  : 'Digite o código de 6 dígitos recebido no seu WhatsApp e crie uma nova senha.'}
              </p>

              {successMsg && (
                <div className="flex items-center space-x-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs mb-4">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {error && (
                <div className="flex items-center space-x-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs mb-4">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {forgotStep === 'request_otp' ? (
                <form onSubmit={handleRequestOtp} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                      E-mail ou WhatsApp Cadastrado
                    </label>
                    <input
                      type="text"
                      required
                      value={forgotIdentifier}
                      onChange={e => setForgotIdentifier(e.target.value)}
                      placeholder="seu@email.com ou (11) 99999-9999"
                      className="w-full bg-background/80 border border-border/80 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all text-sm font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 rounded-xl text-white font-bold text-sm bg-gradient-to-r from-accent to-violet-600 hover:from-accent hover:to-violet-500 shadow-accent/30 transition-all flex items-center justify-center space-x-2"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                    <span>Enviar Código por WhatsApp</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Código de 6 Dígitos (OTP)
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={otpCode}
                      onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-full bg-background/80 border border-border/80 rounded-xl px-4 py-3 text-white text-center tracking-[8px] font-mono text-lg font-bold placeholder-slate-600 focus:outline-none focus:border-accent"
                    />
                    <p className="text-[11px] text-slate-500 mt-1 font-mono">Válido por 10 minutos.</p>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Nova Senha
                    </label>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-background/80 border border-border/80 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-accent text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Confirmar Nova Senha
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmNewPassword}
                      onChange={e => setConfirmNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-background/80 border border-border/80 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-accent text-sm font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 rounded-xl text-white font-bold text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 shadow-emerald-500/30 transition-all flex items-center justify-center space-x-2"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>Redefinir Senha</span>
                  </button>
                </form>
              )}
            </div>
          )}

        </div>

        <p className="text-center text-xs text-slate-600 mt-6 font-mono">
          © 2026 MarketFlow Pro · Dados criptografados · Acesso monitorado
        </p>
      </div>
    </div>
  );
}

