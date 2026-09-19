import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  TrendingUp, 
  ShieldCheck, 
  Zap, 
  Lock, 
  BarChart3, 
  Activity, 
  ArrowRight, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  Cpu, 
  Layers, 
  Sparkles, 
  Coins, 
  Clock, 
  Shield, 
  Check, 
  X, 
  Target, 
  HelpCircle,
  MessageCircle,
  Play,
  Flame,
  Award
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function PresellPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const handleGoSignup = () => {
    if (user) {
      navigate(user.role === 'ADMIN' ? '/admin' : '/dashboard');
    } else {
      navigate('/login?mode=signup');
    }
  };

  const handleGoLogin = () => {
    if (user) {
      navigate(user.role === 'ADMIN' ? '/admin' : '/dashboard');
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-300 relative overflow-x-hidden">
      
      {/* ── Glows & Background Ambient Gradients ──────────────────────── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[20%] w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[140px]" />
        <div className="absolute top-[40%] right-[-5%] w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[160px]" />
        <div className="absolute bottom-[10%] left-[10%] w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[150px]" />
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-20" />
      </div>

      {/* ── Top Navigation Bar ────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#070a12]/80 border-b border-white/5 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-400 p-[1px] shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-[#0b0f19] rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <div>
              <div className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent flex items-center gap-2">
                MarketFlow <span className="text-emerald-400 font-mono text-sm px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">PRO</span>
              </div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Tecnologia Quant Bybit</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <a href="#como-funciona" className="hover:text-emerald-400 transition-colors">Como Funciona</a>
            <a href="#diferenciais" className="hover:text-emerald-400 transition-colors">Diferenciais</a>
            <a href="#seguranca" className="hover:text-emerald-400 transition-colors">Segurança Bybit</a>
            <a href="#passo-a-passo" className="hover:text-emerald-400 transition-colors">Passo a Passo</a>
            <a href="#faq" className="hover:text-emerald-400 transition-colors">Dúvidas (FAQ)</a>
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <button
                onClick={handleGoLogin}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/25 flex items-center gap-2"
              >
                <span>Acessar Painel</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button
                  onClick={handleGoLogin}
                  className="hidden sm:inline-flex px-4 py-2 rounded-xl text-slate-300 hover:text-white font-medium text-sm transition-colors"
                >
                  Entrar
                </button>
                <button
                  onClick={handleGoSignup}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5 flex items-center gap-2"
                >
                  <span>Criar Conta Grátis</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero Section ─────────────────────────────────────────────── */}
      <section className="relative z-10 pt-12 pb-20 md:pt-20 md:pb-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto">
          
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold tracking-wide uppercase mb-6 backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Copy Trading Quantitativo • 100% Automatizado na Bybit</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.15] mb-6">
            Replique Operações Institucionais no <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">Piloto Automático</span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg sm:text-xl text-slate-300 mb-10 leading-relaxed font-normal">
            Conecte sua conta Bybit à tecnologia quantitativa que lê o <strong className="text-white font-semibold">Book L2</strong> e a <strong className="text-white font-semibold">Pressão Institucional (CVD)</strong>. Seu dinheiro fica 100% na sua carteira, protegido por travas de risco milimétricas.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
            <button
              onClick={handleGoSignup}
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 bg-[length:200%_auto] hover:bg-right text-slate-950 font-extrabold text-base transition-all duration-300 shadow-xl shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.02] flex items-center justify-center gap-3 group"
            >
              <span>Ativar Meu Copy Trading Grátis</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>

            <a
              href="#como-funciona"
              className="w-full sm:w-auto px-7 py-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 text-slate-200 font-semibold text-base transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 text-emerald-400 fill-emerald-400" />
              <span>Ver Como Funciona</span>
            </a>
          </div>

          {/* Key Assurance Badges */}
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs sm:text-sm text-slate-400 border-t border-white/5 pt-8">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Sem Custódia (Zero Risco de Saque)</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <span>Execução Instantânea (&lt; 45ms)</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-400" />
              <span>Conexão Oficial API Bybit</span>
            </div>
          </div>
        </div>

        {/* ── Live Interactive Mockup Card ─────────────────────────── */}
        <div className="mt-14 relative max-w-5xl mx-auto">
          <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/30 via-teal-500/20 to-cyan-500/30 rounded-3xl blur-2xl opacity-50" />
          
          <div className="relative rounded-3xl bg-[#0b0f19]/90 border border-white/10 shadow-2xl overflow-hidden backdrop-blur-xl p-6 sm:p-8">
            {/* Header of Mockup */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-white/5 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-xs font-mono font-bold text-emerald-400 tracking-wider uppercase">Master Quant • Operando em Tempo Real</span>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">Bybit Linear Perpetuals</span>
                <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold">Spread Médio: 1.4 bps (Líquido)</span>
              </div>
            </div>

            {/* Grid of Simulated Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 my-6">
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                <div className="text-[11px] text-slate-400 uppercase font-semibold">Ativo Monitorado</div>
                <div className="text-xl font-bold text-white mt-1 flex items-center gap-2">
                  <span>SOL/USDT</span>
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">BUY 🟢</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">Book L2: Pressão 68% Compra</div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                <div className="text-[11px] text-slate-400 uppercase font-semibold">Filtro Shadow Mode</div>
                <div className="text-xl font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span>AUDITADO 🛡️</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">Spread &lt; 3 bps • Risco Aprovado</div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                <div className="text-[11px] text-slate-400 uppercase font-semibold">Latência de Cópia</div>
                <div className="text-xl font-bold text-cyan-400 mt-1 font-mono">
                  38 ms
                </div>
                <div className="text-xs text-slate-400 mt-1">Sincronização Direta CCXT</div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                <div className="text-[11px] text-slate-400 uppercase font-semibold">Custódia do Saldo</div>
                <div className="text-xl font-bold text-white mt-1 flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span>100% Bybit</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">Chaves sem poder de saque</div>
              </div>
            </div>

            {/* Simulated Live Order Stream */}
            <div className="p-4 rounded-2xl bg-[#080b12] border border-white/5 font-mono text-xs">
              <div className="flex items-center justify-between text-slate-400 border-b border-white/5 pb-2 mb-2 text-[11px]">
                <span>PAR</span>
                <span>TIPO</span>
                <span>ENTRADA</span>
                <span>STOP LOSS</span>
                <span>TAKE PROFIT</span>
                <span>RESULTADO</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-slate-200 py-1 border-b border-white/[0.02]">
                  <span className="font-bold text-white">BTC/USDT</span>
                  <span className="text-emerald-400 font-bold">LONG</span>
                  <span>$64,120.50</span>
                  <span className="text-rose-400">$63,850.00</span>
                  <span className="text-emerald-400">$64,950.00</span>
                  <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">+3.12% 🟢</span>
                </div>
                <div className="flex items-center justify-between text-slate-200 py-1 border-b border-white/[0.02]">
                  <span className="font-bold text-white">ETH/USDT</span>
                  <span className="text-emerald-400 font-bold">LONG</span>
                  <span>$3,485.20</span>
                  <span className="text-rose-400">$3,450.00</span>
                  <span className="text-emerald-400">$3,560.00</span>
                  <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">+2.45% 🟢</span>
                </div>
                <div className="flex items-center justify-between text-slate-200 py-1">
                  <span className="font-bold text-white">SOL/USDT</span>
                  <span className="text-rose-400 font-bold">SHORT</span>
                  <span>$152.80</span>
                  <span className="text-rose-400">$155.10</span>
                  <span className="text-emerald-400">$147.20</span>
                  <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">+3.80% 🟢</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Section: Why Quant Beats Manual Trading ─────────────────── */}
      <section id="diferenciais" className="py-20 bg-[#090d16] border-y border-white/5 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest mb-3">Vantagem Competitiva</h2>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-white">Por que 95% dos traders perdem e a matemática quantitativa vence?</h3>
            <p className="text-slate-400 mt-4 text-base">
              A maioria dos investidores perde no mercado cripto por operar com base em emoção, atraso de gráficos e spreads desfavoráveis. Veja a diferença:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            
            {/* Card: Amador / Manual */}
            <div className="p-8 rounded-3xl bg-rose-500/[0.03] border border-rose-500/20 relative overflow-hidden">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                  <X className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-white">Trader Manual / Amador</h4>
                  <p className="text-xs text-rose-400 font-medium">Ciclo vicioso de perdas e cansaço</p>
                </div>
              </div>

              <ul className="space-y-4 text-sm text-slate-300">
                <li className="flex items-start gap-3">
                  <X className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <span><strong>Decisões emocionais:</strong> Compra no topo por FOMO e vende no fundo por pânico.</span>
                </li>
                <li className="flex items-start gap-3">
                  <X className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <span><strong>Falta de gestão de risco:</strong> Não respeita stop loss e arrisca porcentagens absurdas da conta em uma única operação.</span>
                </li>
                <li className="flex items-start gap-3">
                  <X className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <span><strong>Cego para o fluxo real:</strong> Olha apenas gráficos passados (indicadores atrasados) sem enxergar ordens institucionais.</span>
                </li>
                <li className="flex items-start gap-3">
                  <X className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <span><strong>Preso na frente da tela:</strong> Horas e noites perdidas vigiando gráficos sem garantia de lucro.</span>
                </li>
              </ul>
            </div>

            {/* Card: Master Quant */}
            <div className="p-8 rounded-3xl bg-emerald-500/[0.05] border border-emerald-500/30 relative overflow-hidden shadow-xl shadow-emerald-500/10">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
              
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Check className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-white flex items-center gap-2">
                    <span>MarketFlow Master Quant</span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Superior</span>
                  </h4>
                  <p className="text-xs text-emerald-400 font-medium">Execução fria, matemática e automatizada</p>
                </div>
              </div>

              <ul className="space-y-4 text-sm text-slate-200">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Disciplina matemática absoluta:</strong> Zero interferência psicológica, ganância ou medo.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Filtro Shadow Mode:</strong> Antes de qualquer ordem, o algoritmo audita o spread e anula operações desvantajosas.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Book L2 + CVD em tempo real:</strong> Rastreia onde os grandes bancos e formadores de mercado estão posicionados na Bybit.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>100% no Piloto Automático:</strong> Você não precisa encostar no mouse. O sistema replica os lucros na sua conta 24 horas por dia.</span>
                </li>
              </ul>
            </div>

          </div>

        </div>
      </section>

      {/* ── Section: How it Works ────────────────────────────────────── */}
      <section id="como-funciona" className="py-24 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-20">
            <h2 className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-widest mb-3">Engenharia Algorítmica</h2>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-white">Como a Tecnologia Opera por Você</h3>
            <p className="text-slate-400 mt-4 text-base">
              Nosso sistema conecta sua conta à inteligência quantitativa em 4 etapas contínuas:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-emerald-500/30 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-5 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div className="text-xs font-mono text-emerald-400 font-semibold uppercase mb-1">01. Monitoramento</div>
              <h4 className="text-lg font-bold text-white mb-2">Book de Ofertas L2</h4>
              <p className="text-sm text-slate-400 leading-relaxed">
                Varredura contínua de liquidez e ordens passivas em perpétuos da Bybit para detectar muros institucionais.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-cyan-500/30 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-5 group-hover:scale-110 transition-transform">
                <Activity className="w-6 h-6" />
              </div>
              <div className="text-xs font-mono text-cyan-400 font-semibold uppercase mb-1">02. Fluxo Institucional</div>
              <h4 className="text-lg font-bold text-white mb-2">Pressão Delta (CVD)</h4>
              <p className="text-sm text-slate-400 leading-relaxed">
                Cálculo do volume agredido no mercado para entrar a favor da maré institucional e nunca contra os tubarões.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-indigo-500/30 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-5 group-hover:scale-110 transition-transform">
                <Shield className="w-6 h-6" />
              </div>
              <div className="text-xs font-mono text-indigo-400 font-semibold uppercase mb-1">03. Auditoria Pré-Trade</div>
              <h4 className="text-lg font-bold text-white mb-2">Shadow Mode Filter</h4>
              <p className="text-sm text-slate-400 leading-relaxed">
                Antes de disparar, o robô valida o spread real e a exposição máxima em risco. Se o risco for alto, a ordem é vetada.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-teal-500/30 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 mb-5 group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6" />
              </div>
              <div className="text-xs font-mono text-teal-400 font-semibold uppercase mb-1">04. Cópia Instantânea</div>
              <h4 className="text-lg font-bold text-white mb-2">Execução em &lt; 45ms</h4>
              <p className="text-sm text-slate-400 leading-relaxed">
                Aprovada a ordem no Master, o motor CCXT abre a mesma posição na sua conta Bybit proporcionalmente ao seu saldo.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* ── Section: Security & Custody ──────────────────────────────── */}
      <section id="seguranca" className="py-20 bg-gradient-to-b from-[#090d16] to-[#0b0f19] border-y border-white/5 relative z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="p-8 sm:p-12 rounded-3xl bg-white/[0.02] border border-emerald-500/30 relative overflow-hidden backdrop-blur-xl">
            <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="w-24 h-24 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-lg shadow-emerald-500/20">
                <Lock className="w-12 h-12" />
              </div>

              <div>
                <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest">Segurança Institucional</span>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white mt-1 mb-4">
                  Seu Dinheiro Fica 100% sob Sua Custódia na Bybit
                </h3>
                <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-6">
                  Nós <strong>NUNCA</strong> solicitamos que você transfira seu dinheiro para terceiros. A conexão é realizada exclusivamente através das <strong>chaves de API oficiais da Bybit</strong> configuradas estritamente com permissão de leitura e execução de trades.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Permissão de Saque Desativada</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Criptografia AES-256</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Desconecte Quando Quiser</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ── Section: 3-Step Onboarding ──────────────────────────────── */}
      <section id="passo-a-passo" className="py-24 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-20">
            <h2 className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest mb-3">Simplicidade</h2>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-white">Comece a Lucrar em Apenas 3 Passos</h3>
            <p className="text-slate-400 mt-4 text-base">
              Não precisa instalar nenhum programa nem ser especialista em gráficos. Em menos de 5 minutos você está conectado:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto relative">
            
            {/* Step 1 */}
            <div className="relative p-8 rounded-3xl bg-[#0b0f19] border border-white/10 hover:border-emerald-500/40 transition-all flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-lg font-mono mb-6">
                  1
                </div>
                <h4 className="text-xl font-bold text-white mb-3">Crie sua Conta Grátis</h4>
                <p className="text-sm text-slate-400 leading-relaxed mb-6">
                  Cadastre-se na nossa plataforma com seu nome, e-mail e WhatsApp para ter acesso ao seu painel exclusivo de investidor.
                </p>
              </div>
              <div className="text-xs font-mono text-emerald-400">⏱️ Leva menos de 1 minuto</div>
            </div>

            {/* Step 2 */}
            <div className="relative p-8 rounded-3xl bg-[#0b0f19] border border-white/10 hover:border-cyan-500/40 transition-all flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-lg font-mono mb-6">
                  2
                </div>
                <h4 className="text-xl font-bold text-white mb-3">Gere sua API na Bybit</h4>
                <p className="text-sm text-slate-400 leading-relaxed mb-6">
                  No painel da Bybit, crie sua Chave de API de perpétuos com permissão apenas de Ordens (sem permissão de transferência).
                </p>
              </div>
              <div className="text-xs font-mono text-cyan-400">🛡️ Saldo 100% protegido</div>
            </div>

            {/* Step 3 */}
            <div className="relative p-8 rounded-3xl bg-[#0b0f19] border border-white/10 hover:border-teal-500/40 transition-all flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 font-bold text-lg font-mono mb-6">
                  3
                </div>
                <h4 className="text-xl font-bold text-white mb-3">Ative o Copy Trading</h4>
                <p className="text-sm text-slate-400 leading-relaxed mb-6">
                  Insira sua chave no sistema e pronto! O Master Quant passará a replicar automaticamente todas as operações lucrativas.
                </p>
              </div>
              <div className="text-xs font-mono text-teal-400">🚀 Totalmente automático</div>
            </div>

          </div>

          <div className="text-center mt-12">
            <button
              onClick={handleGoSignup}
              className="px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-base transition-all shadow-xl shadow-emerald-500/25 hover:scale-105 inline-flex items-center gap-3"
            >
              <span>Quero Criar Minha Conta Agora</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

        </div>
      </section>

      {/* ── Section: Interactive FAQ ─────────────────────────────────── */}
      <section id="faq" className="py-20 bg-[#090d16] border-t border-white/5 relative z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center mb-16">
            <h2 className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest mb-3">Perguntas Frequentes</h2>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-white">Tire Todas as Suas Dúvidas</h3>
          </div>

          <div className="space-y-4">
            
            {[
              {
                q: "Vocês podem sacar ou transferir o meu dinheiro?",
                a: "Absolutamente NÃO. Ao criar a chave de API na Bybit, você seleciona exclusivamente a opção de 'Trade/Ordens'. A opção de Saques ('Withdraw') fica DESMARCADA por padrão. A Bybit bloqueia tecnicamente qualquer tentativa de saque via API, garantindo que somente você no seu dispositivo consiga movimentar seus fundos."
              },
              {
                q: "Preciso deixar o meu computador ou celular ligado?",
                a: "Não! O sistema MarketFlow Pro roda 24 horas por dia em servidores dedicados em nuvem de altíssima velocidade. Uma vez conectada sua conta Bybit, as operações acontecem de forma 100% autônoma, mesmo com seu aparelho desligado."
              },
              {
                q: "Qual o valor mínimo para começar?",
                a: "O valor é totalmente flexível. Como operamos contratos perpétuos fracionados na Bybit, você pode começar com valores a partir de $50 ou $100 dólares (em USDT) para testar e validar os resultados antes de escalar seu capital."
              },
              {
                q: "O que é o 'Filtro Shadow Mode' que protege as operações?",
                a: "O Shadow Mode é nosso algoritmo proprietário de auditoria em tempo real. Ele simula e audita a ordem milissegundos antes de executá-la. Se o spread da Bybit estiver alto ou se houver risco de liquidez desfavorável, o sistema bloqueia a entrada, salvando seu capital de falsos rompimentos."
              },
              {
                q: "Posso cancelar ou pausar a qualquer momento?",
                a: "Sim, instantaneamente com um clique no seu painel ou simplesmente excluindo a chave de API na sua Bybit. Você tem controle total e absoluto do seu dinheiro e das suas decisões a qualquer momento."
              }
            ].map((faq, idx) => (
              <div 
                key={idx}
                className="rounded-2xl bg-white/[0.02] border border-white/5 overflow-hidden transition-all"
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full p-6 text-left flex items-center justify-between gap-4 font-semibold text-white hover:text-emerald-400 transition-colors"
                >
                  <span className="text-base sm:text-lg">{faq.q}</span>
                  {openFaq === idx ? (
                    <ChevronUp className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
                  )}
                </button>
                {openFaq === idx && (
                  <div className="px-6 pb-6 text-slate-300 text-sm leading-relaxed border-t border-white/[0.02] pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}

          </div>

        </div>
      </section>

      {/* ── Final Call To Action ─────────────────────────────────────── */}
      <section className="py-24 relative z-10 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <div className="relative rounded-3xl bg-gradient-to-r from-emerald-600/20 via-teal-600/20 to-cyan-600/20 border border-emerald-500/30 p-10 sm:p-16 text-center overflow-hidden backdrop-blur-xl">
          <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/30 to-teal-500/30 blur-2xl opacity-40 -z-10" />

          <h3 className="text-3xl sm:text-5xl font-extrabold text-white mb-6 leading-tight">
            Pronto para colocar a matemática quantitativa para trabalhar por você?
          </h3>
          <p className="text-slate-300 text-base sm:text-lg max-w-2xl mx-auto mb-10">
            Junte-se aos investidores que já deixaram para trás o estresse do trade manual e operam com precisão institucional na Bybit.
          </p>

          <button
            onClick={handleGoSignup}
            className="px-10 py-5 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 text-slate-950 font-black text-lg transition-all shadow-2xl shadow-emerald-500/40 hover:scale-105 inline-flex items-center gap-3"
          >
            <span>Quero Começar no Piloto Automático</span>
            <ArrowRight className="w-6 h-6" />
          </button>
        </div>
      </section>

      {/* ── Floating WhatsApp Support Button ─────────────────────────── */}
      <a
        href="https://wa.me/5500000000000?text=Olá!%20Gostaria%20de%20tirar%20dúvidas%20sobre%20o%20Copy%20Trading%20do%20MarketFlow%20Pro"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 p-4 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-2xl shadow-emerald-500/50 hover:scale-110 transition-all flex items-center justify-center group"
        title="Falar com Suporte VIP no WhatsApp"
      >
        <MessageCircle className="w-6 h-6 fill-slate-950" />
        <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs transition-all duration-300 ease-in-out font-bold text-xs pl-0 group-hover:pl-2">
          Dúvidas no WhatsApp
        </span>
      </a>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="py-12 border-t border-white/5 bg-[#05070d] text-slate-500 text-xs relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-slate-300">MarketFlow Pro</span>
            <span>— Todos os direitos reservados.</span>
          </div>

          <div className="text-center sm:text-right max-w-md text-[11px] text-slate-400">
            Aviso de Risco: Negociar ativos digitais e contratos perpétuos envolve riscos. Ganhos passados não garantem rentabilidade futura. Opere com responsabilidade.
          </div>
        </div>
      </footer>

    </div>
  );
}
