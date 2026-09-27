# Plano de Implementação: Correção e Unificação Holística de PnL, WinRate e Parciais (MarketFlow Pro)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar o tratamento e a exibição de saídas parciais (Wave Harvest), PnL líquido consolidado e taxa de acerto (WinRate) em todo o ecossistema do MarketFlow Pro: Motor Quantitativo, Aba de Operações (Autonomia, Posições e Histórico), Dashboard dos 7 Blocos de Saúde, Dashboard dos 10 Blocos Laya v3.0, Central do Cliente e Sincronização Google Sheets.

**Architecture:** 
1. Estender o modelo de dados de ordens (`SimulatedTrade`, `paper_master_orders` e `paper_mirror_orders`) para registrar formalmente eventos de realização parcial (`partialTaken`, `partialPnlUsd`, `totalNetPnl`).
2. Recalibrar a regra de classificação de status: operações que realizaram lucro parcial a +0.6R e encerraram a segunda metade no Breakeven/Micro-Stop devem ser classificadas como vitória ou vitória parcial (`CLOSED_PARTIAL_TP` ou contabilizadas como Win no cálculo de WinRate quando `totalNetPnl > 0`).
3. Refatorar os agregadores analíticos (`QuantStrategyEngine`, `PairPerformanceTracker`, `dashboardRoutes.ts`, `PaperTradingPanel.tsx`, `ClientDashboard.tsx` e `googleSheetsService.ts`) para consumirem o PnL total real (`totalNetPnl = partialPnlUsd + netPnl`), garantindo reconciliação matemática de 100% com o saldo da banca ($10,053.57).

**Tech Stack:** Node.js 22, Express, TypeScript, PostgreSQL (Railway), React 19, TailwindCSS, Socket.IO.

---

## 🔍 Raio-X das Discrepâncias Diagnosticadas

1. **Aba "OPERAÇÕES" (Terminal do Trader)**:
   - **Histórico**: Mostra apenas a 2ª perna estancada (`netPnl: -$3.30`), omitindo o lucro da parcial (`+$17.01`). O usuário só vê vermelho mesmo em trades lucrativos.
   - **WinRate (WIN)**: O cálculo faz `winning = history.filter(t => t.status === 'CLOSED_TP').length`. Como a 2ª perna fecha com status `CLOSED_SL`, o trade inteiro é computado como derrota, derrubando o WinRate artificialmente para **5.6%** em vez de considerar a parcial ganha.
   - **PNL do Topo**: Exibe o `realizedPnl` da conta acumulado no Postgres (**+$53.57**), gerando estranheza imediata contra a lista de trades que soma `-$80.99`.

2. **Dashboard dos 7 Blocos (`/api/strategy/health-report`)**:
   - `QuantStrategyEngine` faz a soma estrita dos `t.pnlUsd` finais. Por não somar `partialPnlUsd`, calcula `netProfit: -$80.99`, derrubando o Score Geral para **35/100 (Vulnerável)**, distorcendo o Monte Carlo e a expectativa matemática.

3. **Dashboard dos 10 Blocos (`/api/dashboard/blocks`)**:
   - Faz query SQL na tabela `trade_events` que ainda não possuía o espelhamento das parciais v3.0, exibindo `Expectância E[R]: +0.000R` e `N=0`.

4. **Central do Cliente (`ClientDashboard.tsx`)**:
   - O card de **Taxa de Acerto (WIN)** exibe `5.6%` ou fallback fixo `75%`, desbalanceado em relação ao resultado real positivo da banca Master.
   - Posições abertas parciais na BingX não explicitavam redução de lote a 0.6R.

5. **Planilha Google (`googleSheetsService.ts`)**:
   - O payload do webhook não enviava a coluna de parcial realizada nem o PnL consolidado round-trip.

---

## 🛠️ Tarefas de Implementação

### Tarefa 1: Modelagem e Persistência do PnL Total Consolidado
**Arquivos:**
- Modificar: `d:/Programas/Desenvolvendo/Mercado Financeiro/shared/paperTypes.ts`
- Modificar: `d:/Programas/Desenvolvendo/Mercado Financeiro/server/src/database/paperStorage.ts`
- Testar: `d:/Programas/Desenvolvendo/Mercado Financeiro/server/src/engine/paperStorage.test.ts`

- [ ] **Passo 1: Escrever teste de unidade para cálculo de PnL consolidado e mapeamento de parciais**
- [ ] **Passo 2: Rodar teste e validar falha**
- [ ] **Passo 3: Atualizar interface `SimulatedTrade` em `shared/paperTypes.ts`**
  - Adicionar campos: `partialTaken?: boolean; partialPnlUsd?: number; totalNetPnl?: number; isNetPositive?: boolean;`
  - Adicionar status de encerramento estendido: `'CLOSED_TP' | 'CLOSED_SL' | 'CLOSED_PARTIAL_TP'`.
- [ ] **Passo 4: Atualizar tabelas e queries de persistência em `paperStorage.ts`**
  - Adicionar colunas `partial_taken`, `partial_pnl_usd`, `total_net_pnl` via migração não-destrutiva (`ALTER TABLE ADD COLUMN IF NOT EXISTS`).
  - Mapear os campos no `hydrateMasterAccount` e `upsertMasterOrder`.
- [ ] **Passo 5: Rodar testes e verificar aprovação**

---

### Tarefa 2: Ajuste no Motor de Execução (`paperTradingEngine.ts`)
**Arquivos:**
- Modificar: `d:/Programas/Desenvolvendo/Mercado Financeiro/server/src/engine/paperTradingEngine.ts`
- Testar: `d:/Programas/Desenvolvendo/Mercado Financeiro/server/src/engine/paperTradingEngine.test.ts`

- [ ] **Passo 1: Escrever teste para o evento `Wave Harvest (+0.6R)` e liquidação final**
  - O teste deve simular: entrada -> atingimento de +0.6R -> colheita parcial -> recuo até Breakeven/SL -> verificar `totalNetPnl > 0` e classificação correta no histórico.
- [ ] **Passo 2: Implementar ajuste no método `updatePositions` e `closePosition`**
  - No `updatePositions`, ao executar a parcial: gravar `trade.partialTaken = true`, `trade.partialPnlUsd = partialGainUsd`.
  - No encerramento final (seja por SL no BE ou TP estendido):
    ```typescript
    const totalNetPnl = Number(((trade.partialPnlUsd || 0) + netPnl).toFixed(4));
    trade.totalNetPnl = totalNetPnl;
    trade.isNetPositive = totalNetPnl > 0;
    if (trade.partialTaken && totalNetPnl > 0) {
      trade.status = 'CLOSED_PARTIAL_TP';
    }
    ```
  - No cálculo de WinRate em `getAccountState`:
    ```typescript
    const winning = this.history.filter(t => t.status === 'CLOSED_TP' || t.status === 'CLOSED_PARTIAL_TP' || (t.totalNetPnl ?? t.netPnl ?? t.pnlUsd) > 0).length;
    ```
- [ ] **Passo 3: Rodar os testes e verificar se o WinRate reflete os trades lucrativos reais**

---

### Tarefa 3: Reconciliação dos Agregadores de Métricas (7 Blocos, 10 Blocos e Pares)
**Arquivos:**
- Modificar: `d:/Programas/Desenvolvendo/Mercado Financeiro/server/src/engine/quantStrategyEngine.ts`
- Modificar: `d:/Programas/Desenvolvendo/Mercado Financeiro/server/src/engine/pairPerformanceTracker.ts`
- Modificar: `d:/Programas/Desenvolvendo/Mercado Financeiro/server/src/routes/dashboardRoutes.ts`
- Testar: `d:/Programas/Desenvolvendo/Mercado Financeiro/server/src/engine/quantStrategyEngine.test.ts`

- [ ] **Passo 1: Escrever teste de regressão para `QuantStrategyEngine` com trades de saída parcial**
- [ ] **Passo 2: Atualizar `quantStrategyEngine.ts`**
  - Ajustar para que `trade.pnlUsd` nas métricas financeiras considere `trade.totalNetPnl ?? (trade.partialPnlUsd || 0) + (trade.netPnl ?? trade.pnlUsd)`.
  - Recalcular `mathExpectationR`, `profitFactor` e Curva de Capital considerando os ganhos das parciais.
- [ ] **Passo 3: Atualizar `PairPerformanceTracker.ts`**
  - Considerar `totalNetPnl > 0` como trade vencedor por par de ativo, ajustando os cards do `SOL/USDT`, `XRP/USDT` e `BTC/USDT`.
- [ ] **Passo 4: Atualizar `dashboardRoutes.ts` (/api/dashboard/blocks)**
  - Unificar a consulta dos 10 blocos para ler tanto `trade_events` quanto `paper_master_orders` de forma combinada.

---

### Tarefa 4: Atualização da Interface do Trader (`PaperTradingPanel.tsx`)
**Arquivos:**
- Modificar: `d:/Programas/Desenvolvendo/Mercado Financeiro/web/src/components/PaperTrading/PaperTradingPanel.tsx`
- Testar: Componente renderiza tags de parcial e totais corretamente

- [ ] **Passo 1: Na aba `HISTÓRICO`**:
  - Exibir badge destacado quando houver parcial colhida: `🌊 Parcial: +$XX.XX (0.6R)`.
  - Exibir o resultado consolidado da operação: `Total Líquido: +$XX.XX` em verde quando o trade fechou positivo no balanço final.
  - Substituir ícone de erro por ícone de vitória parcial quando `trade.totalNetPnl > 0`.
- [ ] **Passo 2: Na aba `POSIÇÕES`**:
  - Exibir indicador visual de posição que já colheu parcial (`50% Realizado | Stop no Breakeven`).
- [ ] **Passo 3: Na aba `AUTONOMIA IA`**:
  - Exibir o WinRate corrigido por par na listagem de ativos dinâmicos.

---

### Tarefa 5: Atualização da Central do Cliente e Sincronização Google Sheets
**Arquivos:**
- Modificar: `d:/Programas/Desenvolvendo/Mercado Financeiro/web/src/pages/ClientDashboard.tsx`
- Modificar: `d:/Programas/Desenvolvendo/Mercado Financeiro/server/src/services/googleSheetsService.ts`

- [ ] **Passo 1: Na Central Master Quant (`ClientDashboard.tsx`)**:
  - Card **Taxa de Acerto (WIN)**: exibir o WinRate real sincronizado que computa parciais vitoriosas, com barra de progresso condizente.
  - Card **Histórico Master**: detalhar `X vitórias (incluindo saídas parciais a 0.6R)`.
- [ ] **Passo 2: Em `googleSheetsService.ts`**:
  - Adicionar campos `partialPnlUsd`, `totalNetPnl`, `isPartialTaken` no payload de sincronização de histórico e de posições abertas.

---

### Tarefa 6: Verificação de Build, Testes e Deploy no Railway
- [ ] **Passo 1: Executar suite de testes completa (`npm test` no backend)**
- [ ] **Passo 2: Executar build do frontend web (`npm run build:web`)**
- [ ] **Passo 3: Sincronizar com GitHub e monitorar deploy no Railway via membro-github**
- [ ] **Passo 4: Validar endpoints de produção com curl e verificar se o saldo, winRate e blocos estão 100% harmônicos**
