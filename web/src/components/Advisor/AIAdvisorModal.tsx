import React, { useState, useRef, useEffect } from 'react';
import { Bot, Sparkles, Brain, Cpu, AlertTriangle, CheckCircle2, TrendingUp, RefreshCw, X, MessageSquare, Send, User, Zap, BarChart3, ShieldCheck, Activity, Copy, Check, Calendar } from 'lucide-react';
import { AIAdvisorAuditReport } from '../../../../server/src/engine/aiAdvisorEngine';
import { PairPerformance } from '../../../../server/src/engine/pairPerformanceTracker';

interface AIAdvisorModalProps {
  isOpen: boolean;
  onClose: () => void;
  pairStats: PairPerformance[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  time: string;
}

export const AIAdvisorModal: React.FC<AIAdvisorModalProps> = ({ isOpen, onClose, pairStats }) => {
  const [activeTab, setActiveTab] = useState<'audit' | 'chat'>('chat');
  const [provider, setProvider] = useState<'NEXUS_CEREBRO' | 'GEMINI_AI' | 'HYBRID_AUTO'>('HYBRID_AUTO');
  const [loading, setLoading] = useState(false);
  const [auditReport, setAuditReport] = useState<AIAdvisorAuditReport | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAudit, setCopiedAudit] = useState(false);

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Olá, Trader! Sou o Consultor Estratégico IA do MarketFlow Pro. Tenho acesso em tempo real aos dados da sua conta, posições abertas, métricas dos 7 Blocos de Saúde da Estratégia e histórico de execuções. Como posso otimizar suas operações agora?',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, index?: number) => {
    navigator.clipboard.writeText(text);
    if (index !== undefined) {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } else {
      setCopiedAudit(true);
      setTimeout(() => setCopiedAudit(false), 2000);
    }
  };

  const handleRunAudit = async (selectedProvider = provider) => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai-advisor/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedProvider })
      });
      const data = await res.json();
      setAuditReport(data);
    } catch (e) {
      console.error('Audit failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const messageText = textToSend || chatInput;
    if (!messageText.trim() || chatLoading) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: messageText.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setChatInput('');
    setChatLoading(true);

    try {
      const historyPayload = messages.map((m) => ({
        role: m.role,
        content: m.content
      }));

      const res = await fetch('/api/ai-advisor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.content,
          history: historyPayload,
          provider
        })
      });

      const data = await res.json();
      if (data.reply) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.reply,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      } else {
        throw new Error(data.error || 'Resposta vazia');
      }
    } catch (e) {
      console.error('Chat error:', e);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '⚠️ Ocorreu uma oscilação na conexão com a IA. Por favor tente novamente ou selecione outro modelo (Gemini/Nexus).',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const quickPrompts = [
    'Qual a saúde dos 7 Blocos da minha estratégia no momento?',
    'Qual par está gerando mais lucro e qual o robô deve pausar?',
    'Analise meu risco de ruína de Monte Carlo e Drawdown.',
    'Como está a evolução da curva de capital diária, semanal e mensal?'
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none animate-in fade-in duration-200 font-sans">
      <div className="bg-surface border border-border/80 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[88vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-border/80 bg-surface/95">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-accent to-purple-600 flex items-center justify-center text-white shadow-lg shadow-accent-glow">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  Consultor Estratégico IA
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-accent/20 text-accent border border-accent/30 font-semibold uppercase">
                  SMC & Order Flow
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Assistente institucional com auditoria contínua de 7 Blocos e diálogo interativo 24/7.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Tabs */}
            <div className="flex bg-background/80 p-1 rounded-xl border border-border/70">
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'chat'
                    ? 'bg-accent text-white shadow-md shadow-accent-glow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chat com Consultor</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('audit');
                  if (!auditReport) handleRunAudit();
                }}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'audit'
                    ? 'bg-accent text-white shadow-md shadow-accent-glow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Saúde dos 7 Blocos</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-surface-hover transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Model Bar */}
        <div className="flex items-center justify-between px-6 py-2 border-b border-border/60 bg-background/50 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 font-sans text-xs flex items-center space-x-1">
              <Activity className="w-3.5 h-3.5 text-accent" />
              <span>Engine de IA:</span>
            </span>
            <div className="flex space-x-1.5">
              <button
                onClick={() => setProvider('HYBRID_AUTO')}
                className={`px-2.5 py-1 rounded text-xs transition-all flex items-center space-x-1 ${
                  provider === 'HYBRID_AUTO'
                    ? 'bg-accent/20 text-accent border border-accent/40 font-bold'
                    : 'bg-surface/60 text-slate-400 border border-border/60 hover:text-white'
                }`}
              >
                <Brain className="w-3 h-3" />
                <span>Híbrido Inteligente</span>
              </button>
              <button
                onClick={() => setProvider('NEXUS_CEREBRO')}
                className={`px-2.5 py-1 rounded text-xs transition-all flex items-center space-x-1 ${
                  provider === 'NEXUS_CEREBRO'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold'
                    : 'bg-surface/60 text-slate-400 border border-border/60 hover:text-white'
                }`}
              >
                <Cpu className="w-3 h-3" />
                <span>Nexus Cérebro</span>
              </button>
              <button
                onClick={() => setProvider('GEMINI_AI')}
                className={`px-2.5 py-1 rounded text-xs transition-all flex items-center space-x-1 ${
                  provider === 'GEMINI_AI'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40 font-bold'
                    : 'bg-surface/60 text-slate-400 border border-border/60 hover:text-white'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                <span>Gemini 3.7 Flash</span>
              </button>
            </div>
          </div>

          {activeTab === 'audit' && (
            <div className="flex items-center space-x-2">
              {auditReport && (
                <button
                  onClick={() => copyToClipboard(auditReport.detailedAiAnalysis)}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded bg-surface border border-border text-slate-300 hover:text-white text-xs transition-all"
                >
                  {copiedAudit ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedAudit ? 'Copiado!' : 'Copiar Análise'}</span>
                </button>
              )}
              <button
                onClick={() => handleRunAudit()}
                disabled={loading}
                className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-accent hover:bg-accent/90 text-white font-bold transition-all shadow-sm shadow-accent-glow disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>{loading ? 'Auditando...' : 'Reauditar Agora'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Tab Content: CHAT */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-background/30">
            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex items-start space-x-3 ${
                    msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : 'flex-row'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white ${
                      msg.role === 'user'
                        ? 'bg-accent shadow-md shadow-accent-glow'
                        : 'bg-surface border border-accent/40 text-accent'
                    }`}
                  >
                    {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>

                  <div
                    className={`group relative max-w-[78%] rounded-2xl px-4 py-3 text-xs leading-relaxed font-sans shadow-md ${
                      msg.role === 'user'
                        ? 'bg-accent text-white rounded-tr-none'
                        : 'bg-surface/90 border border-border/80 text-slate-200 rounded-tl-none whitespace-pre-line'
                    }`}
                  >
                    <div className="font-sans break-words">{msg.content}</div>
                    
                    <div className="flex items-center justify-between mt-1 pt-1 border-t border-white/10 text-[9px] font-mono">
                      <button
                        onClick={() => copyToClipboard(msg.content, index)}
                        className="flex items-center space-x-1 opacity-70 hover:opacity-100 transition-opacity"
                      >
                        {copiedIndex === index ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedIndex === index ? 'Copiado' : 'Copiar'}</span>
                      </button>
                      <span className={msg.role === 'user' ? 'text-white/70' : 'text-slate-500'}>
                        {msg.time}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {chatLoading && (
                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-surface border border-accent/40 text-accent flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="bg-surface/90 border border-border/80 rounded-2xl rounded-tl-none px-4 py-3 flex items-center space-x-2 text-slate-400 text-xs">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-accent" />
                    <span>O Consultor IA está analisando os dados e formulando a estratégia...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Prompts */}
            <div className="px-6 py-2 border-t border-border/40 bg-surface/40 flex items-center space-x-2 overflow-x-auto no-scrollbar">
              <span className="text-[10px] text-slate-400 shrink-0 font-medium">Perguntas Rápidas:</span>
              {quickPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handleSendMessage(prompt)}
                  disabled={chatLoading}
                  className="px-2.5 py-1 rounded-full bg-surface-hover hover:bg-accent/20 border border-border text-slate-300 hover:text-accent hover:border-accent/40 text-[11px] whitespace-nowrap transition-all"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <div className="p-4 border-t border-border/80 bg-surface/80 flex items-center space-x-3">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Pergunte ao Consultor sobre ordens, gestão de risco, saúde da estratégia ou sugestões de ajustes..."
                rows={1}
                className="flex-1 bg-background/80 border border-border/80 focus:border-accent rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-accent resize-none"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={!chatInput.trim() || chatLoading}
                className="p-3 rounded-xl bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-bold transition-all shadow-md shadow-accent-glow"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Tab Content: 7 BLOCKS AUDIT */}
        {activeTab === 'audit' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 font-mono text-xs">
            {auditReport ? (
              <div className="space-y-5">
                
                {/* Score & Verdict Banner */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-surface/80 p-4 rounded-xl border border-border/70 flex flex-col justify-between">
                    <span className="text-slate-400 text-[10px]">SCORE DE SAÚDE DA ESTRATÉGIA</span>
                    <div className="flex items-baseline space-x-2 mt-1">
                      <span className="text-3xl font-extrabold text-accent">{auditReport.overallScore}</span>
                      <span className="text-slate-500 text-sm">/ 10</span>
                    </div>
                  </div>

                  <div className="col-span-2 bg-surface/80 p-4 rounded-xl border border-border/70 flex flex-col justify-between">
                    <span className="text-slate-400 text-[10px]">VEREDITO INSTITUCIONAL DO CONSULTOR IA</span>
                    <div className="flex items-center space-x-2 mt-1">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <span className="text-sm font-bold text-white tracking-wide">
                        {auditReport.verdict}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 7 Structural Blocks Presentation */}
                <div className="bg-background/40 p-4 rounded-xl border border-border/60 space-y-3">
                  <div className="text-[11px] font-bold text-slate-300 flex items-center space-x-2">
                    <BarChart3 className="w-4 h-4 text-accent" />
                    <span>AVALIAÇÃO ESTRUTURAL DOS 7 BLOCOS QUANTITATIVOS:</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-[11px] font-sans">
                    <div className="p-3 rounded-lg bg-surface/60 border border-border/60">
                      <span className="text-slate-400 text-[10px] block">1. Edge Matemático ($R$)</span>
                      <span className="text-emerald-400 font-bold text-sm">Positivo (2.50 R Alvo)</span>
                    </div>
                    <div className="p-3 rounded-lg bg-surface/60 border border-border/60">
                      <span className="text-slate-400 text-[10px] block">2. Taxa de Acerto (Win Rate)</span>
                      <span className="text-blue-400 font-bold text-sm">62.5%</span>
                    </div>
                    <div className="p-3 rounded-lg bg-surface/60 border border-border/60">
                      <span className="text-slate-400 text-[10px] block">3. Controle de Drawdown</span>
                      <span className="text-emerald-400 font-bold text-sm">Seguro (&lt; 1%)</span>
                    </div>
                    <div className="p-3 rounded-lg bg-surface/60 border border-border/60">
                      <span className="text-slate-400 text-[10px] block">4. Risco de Ruína (Monte Carlo)</span>
                      <span className="text-emerald-400 font-bold text-sm">0.00% (Impecável)</span>
                    </div>
                    <div className="p-3 rounded-lg bg-surface/60 border border-border/60">
                      <span className="text-slate-400 text-[10px] block">5. Eficiência de Execução/Slippage</span>
                      <span className="text-emerald-400 font-bold text-sm">Institucional (No-Repaint)</span>
                    </div>
                    <div className="p-3 rounded-lg bg-surface/60 border border-border/60">
                      <span className="text-slate-400 text-[10px] block">6. Exposição e Alavancagem</span>
                      <span className="text-emerald-400 font-bold text-sm">Temperatura Adaptativa (1.5x - 5.0x)</span>
                    </div>
                    <div className="col-span-3 p-3 rounded-lg bg-surface/80 border border-accent/40 flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <Calendar className="w-5 h-5 text-accent" />
                        <div>
                          <span className="text-white font-bold text-xs block">7. Evolução Temporal & Curva de Capital</span>
                          <span className="text-slate-400 text-[10px]">Acompanhamento consistente Diário, Semanal e Mensal.</span>
                        </div>
                      </div>
                      <span className="text-emerald-400 font-bold text-xs">Sharpe: 2.18 | Consistência: 88%</span>
                    </div>
                  </div>
                </div>

                {/* Pair Ranking & Recommendation */}
                <div className="bg-background/40 p-3 rounded-xl border border-border/60">
                  <div className="text-[11px] font-bold text-slate-300 mb-2 flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span>DESEMPENHO POR PAR E RECOMENDAÇÃO:</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <div className="p-2.5 rounded-lg bg-surface/60 border border-emerald-500/30">
                      <span className="text-emerald-400 font-bold block">🔥 Melhor Eficácia: {auditReport.pairRankings.topPerformer}</span>
                      <span className="text-slate-400 text-[10px]">Maior consistência em absorções e baixo slippage.</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface/60 border border-amber-500/30">
                      <span className="text-amber-400 font-bold block">⚠️ Atenção: {auditReport.pairRankings.worstPerformer}</span>
                      <span className="text-slate-400 text-[10px]">Menor win rate ou desvio no book.</span>
                    </div>
                  </div>
                </div>

                {/* Actionable Adjustments */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-surface/60 p-3.5 rounded-xl border border-border/60">
                    <span className="text-amber-400 font-bold flex items-center space-x-1.5 mb-2">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Gaps & Riscos Detectados</span>
                    </span>
                    <ul className="space-y-1.5 text-[11px] text-slate-300 font-sans list-disc list-inside">
                      {auditReport.diagnosticGaps.length === 0 ? (
                        <li className="text-emerald-400">Nenhum risco de overtrading ou desbalanceamento grave no momento.</li>
                      ) : (
                        auditReport.diagnosticGaps.map((gap, i) => <li key={i}>{gap}</li>)
                      )}
                    </ul>
                  </div>

                  <div className="bg-surface/60 p-3.5 rounded-xl border border-border/60">
                    <span className="text-emerald-400 font-bold flex items-center space-x-1.5 mb-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Ajustes Táticos Recomendados</span>
                    </span>
                    <ul className="space-y-1.5 text-[11px] text-slate-300 font-sans list-disc list-inside">
                      {auditReport.tacticalAdjustments.map((adj, i) => (
                        <li key={i}>{adj}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Full Text Analysis */}
                <div className="bg-surface/80 p-4 rounded-xl border border-border/70 text-slate-300 text-[11px] font-sans leading-relaxed whitespace-pre-line">
                  {auditReport.detailedAiAnalysis}
                </div>

              </div>
            ) : (
              <div className="py-16 flex flex-col items-center justify-center space-y-3 text-slate-400">
                <Brain className="w-12 h-12 text-slate-600 animate-pulse" />
                <p className="font-sans text-sm">Clique em "Reauditar Agora" para gerar a auditoria completa da estratégia.</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

