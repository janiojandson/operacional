import React, { useState } from 'react';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import {
  Layers,
  Activity,
  Bot,
  Bell,
  ShieldAlert,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';

interface ResponsiveShellProps {
  header: React.ReactNode;
  governanceBar: React.ReactNode;
  chart: React.ReactNode;
  dom: React.ReactNode;
  tape: React.ReactNode;
  radar: React.ReactNode;
  operations: React.ReactNode;
}

export const ResponsiveShell: React.FC<ResponsiveShellProps> = ({
  header,
  governanceBar,
  chart,
  dom,
  tape,
  radar,
  operations
}) => {
  const { isWideDesktop, isLaptop, isTablet, isMobile, canExecuteOrders } = useBreakpoint();

  // Estados para 1280-1599px (Notebook): alternância de abas DOM | Tape
  const [notebookRightTab, setNotebookRightTab] = useState<'dom' | 'tape'>('dom');

  // Estados para >= 1600px (4K): opção de recolher o Tape
  const [wideTapeExpanded, setWideTapeExpanded] = useState<boolean>(true);

  // Estados para 768-1279px (Tablet): abas da Zona Inferior
  const [tabletBottomTab, setTabletBottomTab] = useState<'operations' | 'dom' | 'tape' | 'radar'>('operations');

  // Estados para < 768px (Mobile): abas do monitor
  const [mobileTab, setMobileTab] = useState<'chart' | 'positions' | 'dom' | 'tape' | 'radar'>('chart');

  return (
    <div className="flex flex-col h-screen w-screen bg-[#060913] text-text-primary font-sans overflow-hidden select-none">
      {/* ─── 1. CABEÇALHO GLOBAL ─── */}
      {header}

      {/* ─── 2. BARRA DE GOVERNANÇA OPERACIONAL ─── */}
      {governanceBar}

      {/* ─── 3. AVISO DE SEGURANÇA EM MODO MOBILE (< 768px) ─── */}
      {isMobile && (
        <div className="bg-rose-950/80 border-b border-rose-500/50 px-3 py-1 flex items-center justify-between text-[11px] font-mono text-rose-200 shrink-0">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0 animate-pulse" />
            <span className="font-bold">MODO SOMENTE LEITURA</span>
            <span className="hidden sm:inline">—</span>
            <span>Execução de ordens disponível apenas em telas &ge; 1280px</span>
          </div>
          <span className="text-[10px] bg-rose-900/60 px-2 py-0.2 rounded border border-rose-500/30 text-rose-300">
            Bloqueado por Segurança
          </span>
        </div>
      )}

      {/* ─── 4. ÁREA PRINCIPAL POR BREAKPOINT ─── */}

      {/* ────────────── A) TELAS LARGAS / 4K (>= 1600px) ────────────── */}
      {isWideDesktop && (
        <main className="flex-1 flex overflow-hidden p-2 gap-2 bg-[#060913]">
          {/* Coluna Esquerda: Gráfico (topo) + Radar/Operações (base) */}
          <section className="flex-[3] flex flex-col h-full overflow-hidden gap-2 min-w-0">
            <div className="flex-[3] min-h-[320px] bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col">
              {chart}
            </div>

            <div className="flex-[2] min-h-[220px] flex gap-2 overflow-hidden">
              <div className="flex-1 bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                {radar}
              </div>
              <div className="flex-1 bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                {operations}
              </div>
            </div>
          </section>

          {/* Coluna Direita: DOM Book L2 */}
          <section className="w-[340px] shrink-0 h-full bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col">
            {dom}
          </section>

          {/* Coluna Extrema Direita: Tape Colapsável */}
          <section className={`transition-all duration-300 h-full bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col ${
            wideTapeExpanded ? 'w-[320px] shrink-0' : 'w-10 shrink-0'
          }`}>
            <div className="px-2 py-1.5 bg-bg-panel border-b border-border-panel flex items-center justify-between shrink-0">
              {wideTapeExpanded && (
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                  Tape
                </span>
              )}
              <button
                onClick={() => setWideTapeExpanded(!wideTapeExpanded)}
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors ml-auto"
                title={wideTapeExpanded ? 'Recolher Tape em aba lateral' : 'Expandir Tape'}
              >
                {wideTapeExpanded ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
              </button>
            </div>
            {wideTapeExpanded ? (
              <div className="flex-1 overflow-hidden">
                {tape}
              </div>
            ) : (
              <div
                onClick={() => setWideTapeExpanded(true)}
                className="flex-1 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-900/60 transition-colors py-4 text-slate-500 hover:text-cyan-400"
              >
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest [writing-mode:vertical-rl] rotate-180">
                  TAPE (AGRESSORES)
                </span>
              </div>
            )}
          </section>
        </main>
      )}

      {/* ────────────── B) NOTEBOOKS 1366x768 (1280–1599px) ────────────── */}
      {isLaptop && (
        <main className="flex-1 flex overflow-hidden p-2 gap-2 bg-[#060913]">
          {/* Coluna Esquerda: Gráfico prioritário (>= 320px) + Operações/Radar em 2 colunas */}
          <section className="flex-[3] flex flex-col h-full overflow-hidden gap-2 min-w-0">
            <div className="flex-[3] min-h-[320px] bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col">
              {chart}
            </div>

            <div className="flex-[2] min-h-[200px] grid grid-cols-2 gap-2 overflow-hidden">
              <div className="h-full bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                {radar}
              </div>
              <div className="h-full bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                {operations}
              </div>
            </div>
          </section>

          {/* Coluna Direita Alternável: Abas [ DOM | Tape ] para preservar largura do gráfico */}
          <section className="w-[360px] shrink-0 h-full bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col">
            <div className="flex items-center justify-between p-1.5 bg-slate-900/90 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 w-full">
                <button
                  onClick={() => setNotebookRightTab('dom')}
                  className={`flex-1 py-1 px-2 rounded font-mono text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                    notebookRightTab === 'dom'
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  <span>DOM (Book L2)</span>
                </button>
                <button
                  onClick={() => setNotebookRightTab('tape')}
                  className={`flex-1 py-1 px-2 rounded font-mono text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                    notebookRightTab === 'tape'
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Activity className="w-3 h-3" />
                  <span>Tape (Agressores)</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              {notebookRightTab === 'dom' ? dom : tape}
            </div>
          </section>
        </main>
      )}

      {/* ────────────── C) TABLETS (768–1279px) ────────────── */}
      {isTablet && (
        <main className="flex-1 flex flex-col overflow-hidden p-2 gap-2 bg-[#060913]">
          {/* Zona A (Topo): Gráfico + Card de Posição com altura mínima garantida >= 320px */}
          <div className="flex-[3] min-h-[320px] bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col">
            {chart}
          </div>

          {/* Zona B (Base): Painéis em abas/acordeão */}
          <div className="flex-[2] min-h-[220px] bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col">
            <div className="flex items-center justify-between p-1.5 bg-slate-900/90 border-b border-slate-800 shrink-0 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                <button
                  onClick={() => setTabletBottomTab('operations')}
                  className={`py-1 px-3 rounded font-mono text-xs font-bold transition-all flex items-center gap-1.5 ${
                    tabletBottomTab === 'operations' ? 'bg-accent text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>Operações</span>
                </button>
                <button
                  onClick={() => setTabletBottomTab('dom')}
                  className={`py-1 px-3 rounded font-mono text-xs font-bold transition-all flex items-center gap-1.5 ${
                    tabletBottomTab === 'dom' ? 'bg-accent text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Book L2</span>
                </button>
                <button
                  onClick={() => setTabletBottomTab('tape')}
                  className={`py-1 px-3 rounded font-mono text-xs font-bold transition-all flex items-center gap-1.5 ${
                    tabletBottomTab === 'tape' ? 'bg-accent text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Tape</span>
                </button>
                <button
                  onClick={() => setTabletBottomTab('radar')}
                  className={`py-1 px-3 rounded font-mono text-xs font-bold transition-all flex items-center gap-1.5 ${
                    tabletBottomTab === 'radar' ? 'bg-accent text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>Radar de Fluxo</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden p-1">
              {tabletBottomTab === 'operations' && operations}
              {tabletBottomTab === 'dom' && dom}
              {tabletBottomTab === 'tape' && tape}
              {tabletBottomTab === 'radar' && radar}
            </div>
          </div>
        </main>
      )}

      {/* ────────────── D) MOBILE (< 768px, MODO SOMENTE LEITURA) ────────────── */}
      {isMobile && (
        <main className="flex-1 flex flex-col overflow-hidden bg-[#060913]">
          {/* Conteúdo com abas de monitoramento */}
          <div className="flex-1 overflow-hidden relative">
            {mobileTab === 'chart' && (
              <div className="h-full w-full min-h-[320px] flex flex-col">
                {chart}
              </div>
            )}
            {mobileTab === 'positions' && (
              <div className="h-full w-full overflow-y-auto p-2">
                {operations}
              </div>
            )}
            {mobileTab === 'dom' && (
              <div className="h-full w-full overflow-hidden p-2">
                {dom}
              </div>
            )}
            {mobileTab === 'tape' && (
              <div className="h-full w-full overflow-hidden p-2">
                {tape}
              </div>
            )}
            {mobileTab === 'radar' && (
              <div className="h-full w-full overflow-hidden p-2">
                {radar}
              </div>
            )}
          </div>

          {/* Barra de Navegação Inferior Mobile */}
          <nav className="h-12 bg-slate-950 border-t border-slate-800 flex items-center justify-around px-2 shrink-0 z-30 font-mono text-[10px]">
            <button
              onClick={() => setMobileTab('chart')}
              className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded transition-colors ${
                mobileTab === 'chart' ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Gráfico</span>
            </button>
            <button
              onClick={() => setMobileTab('positions')}
              className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded transition-colors ${
                mobileTab === 'positions' ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Bot className="w-4 h-4" />
              <span>Posições</span>
            </button>
            <button
              onClick={() => setMobileTab('dom')}
              className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded transition-colors ${
                mobileTab === 'dom' ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Book L2</span>
            </button>
            <button
              onClick={() => setMobileTab('tape')}
              className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded transition-colors ${
                mobileTab === 'tape' ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Tape</span>
            </button>
            <button
              onClick={() => setMobileTab('radar')}
              className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded transition-colors ${
                mobileTab === 'radar' ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span>Radar</span>
            </button>
          </nav>
        </main>
      )}
    </div>
  );
};
