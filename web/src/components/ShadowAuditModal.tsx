import React, { useEffect, useState, useRef } from 'react';
import { authFetch } from '../contexts/AuthContext';
import { 
  X, 
  Terminal, 
  Activity, 
  RefreshCw, 
  Copy, 
  Check, 
  ShieldAlert, 
  ShieldCheck, 
  SlidersHorizontal,
  Download
} from 'lucide-react';

interface ShadowAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShadowAuditModal: React.FC<ShadowAuditModalProps> = ({ isOpen, onClose }) => {
  const [logsText, setLogsText] = useState<string>('Carregando logs de auditoria...');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const logsContainerRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      const res = await authFetch('/api/audit-logs');
      if (res.ok) {
        const data = await res.json();
        setLogsText(data.logs || 'Sem logs disponíveis no momento.');
        setLastUpdate(new Date());
      } else {
        setLogsText(`Falha ao carregar logs (Status HTTP ${res.status}).`);
      }
    } catch (err: any) {
      setLogsText(`Erro de conexão ao buscar logs: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);

    return () => clearInterval(interval);
  }, [isOpen]);

  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logsText, autoScroll]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(logsText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([logsText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_shadow_mode_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Cálculo de estatísticas rápidas baseadas no texto
  const logLines = logsText.split('\n').filter(l => l.trim().length > 0);
  const blockedCount = logLines.filter(l => l.includes('BLOQUEADO 🛑')).length;
  const permittedCount = logLines.filter(l => l.includes('PERMITIDO 🟢')).length;
  const totalAudits = blockedCount + permittedCount;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div 
        className="bg-slate-950 border border-cyan-500/30 rounded-xl shadow-2xl shadow-cyan-950/40 flex flex-col w-full max-w-5xl h-[85vh] max-h-[850px] overflow-hidden select-text"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-cyan-500/20">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-sm shadow-cyan-500/20">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm md:text-base font-bold text-white tracking-wide font-mono flex items-center gap-2">
                  <span>SHADOW MODE AUDITOR</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-sans font-semibold">
                    MODO FANTASMA
                  </span>
                </h2>
              </div>
              <p className="text-[11px] text-slate-400 font-sans">
                Auditoria de Risco Paralela: Filtro Anti-USD & Trava de Spread L2
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Status Live */}
            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-700/60 text-[11px] font-mono text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>POLL 5s</span>
            </div>

            {/* Ações */}
            <button
              onClick={fetchLogs}
              disabled={isLoading}
              title="Atualizar Agora"
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>

            <button
              onClick={handleCopy}
              title="Copiar Logs"
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            <button
              onClick={handleDownload}
              title="Baixar Arquivo de Log"
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              title="Fechar Modal (ESC)"
              className="p-1.5 rounded hover:bg-red-950/50 text-slate-400 hover:text-red-400 transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-slate-900/40 border-b border-slate-800 text-xs font-mono">
          <div className="bg-slate-900/80 border border-slate-800 rounded p-2 flex items-center justify-between">
            <span className="text-slate-400">Total Auditado:</span>
            <span className="font-bold text-white text-sm">{totalAudits}</span>
          </div>
          <div className="bg-emerald-950/20 border border-emerald-500/30 rounded p-2 flex items-center justify-between">
            <span className="text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Permitidos:
            </span>
            <span className="font-bold text-emerald-300 text-sm">{permittedCount}</span>
          </div>
          <div className="bg-red-950/20 border border-red-500/30 rounded p-2 flex items-center justify-between">
            <span className="text-red-400 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" /> Bloqueados:
            </span>
            <span className="font-bold text-red-300 text-sm">{blockedCount}</span>
          </div>
          <div className="bg-cyan-950/20 border border-cyan-500/30 rounded p-2 flex items-center justify-between">
            <span className="text-cyan-400 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5" /> Modo Real:
            </span>
            <span className="font-bold text-cyan-300 text-xs">INTOCADO 🟢</span>
          </div>
        </div>

        {/* Terminal Log Console */}
        <div 
          ref={logsContainerRef}
          className="flex-1 overflow-y-auto p-4 bg-black/90 font-mono text-xs md:text-[13px] leading-relaxed text-slate-200 select-text"
        >
          {logLines.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-2">
              <Activity className="w-8 h-8 animate-pulse text-cyan-500/40" />
              <p>{logsText}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {logLines.map((line, index) => {
                const isBlocked = line.includes('BLOQUEADO 🛑');
                const isPermitted = line.includes('PERMITIDO 🟢');

                return (
                  <div 
                    key={index} 
                    className={`p-2 rounded border font-mono transition-colors ${
                      isBlocked 
                        ? 'bg-red-950/20 border-red-900/40 text-red-200' 
                        : isPermitted 
                        ? 'bg-emerald-950/15 border-emerald-900/40 text-emerald-200' 
                        : 'bg-slate-900/40 border-slate-800 text-slate-300'
                    }`}
                  >
                    <span className="text-cyan-400/90 font-semibold">{line}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Terminal Footer */}
        <div className="px-4 py-2 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <div className="flex items-center space-x-2">
            <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            <span className="text-cyan-300 font-semibold">
              Isolamento Não-Bloqueante: 0ms de impacto na execução da Bybit
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-1.5 cursor-pointer text-slate-300 hover:text-white">
              <input 
                type="checkbox" 
                checked={autoScroll} 
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
              />
              <span>Auto-Scroll</span>
            </label>
            <span>Última atualização: {lastUpdate.toLocaleTimeString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
