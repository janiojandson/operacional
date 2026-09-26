# Plano de Implementação — Laya ↔ Mercado Financeiro v3.0
**Event Store no PostgreSQL + Dashboard dos 10 Blocos + Otimização de Performance (Alívio de Requisições & Google Sheets)**

---

## 🎯 1. Diagnóstico do Peso & Gargalos Atuais

1. **Erro HTTP 429 (`Muitas requisições. Aguarde alguns minutos.`):**
   - O Express possui um `globalLimiter` em `server/src/index.ts` travado em **200 requisições por 15 minutos**.
   - O frontend dispara chamadas paralelas (mercado, book, tape, balance, Laya governance a cada 3s). Em menos de 2 minutos de navegação, o limite é estourado e o IP do operador é bloqueado.
2. **Sobrecarga de Polling no Frontend:**
   - Cada componente do painel busca dados de forma descentralizada. 
   - Solução v3.0: Consolidar as métricas de saúde, governança e sessão em **um único endpoint agregado** (`/api/dashboard/overview`) com cache server-side em memória (TTL: 3s).
3. **Sobrecarga no Google Sheets Webhook:**
   - Chamadas a `GoogleSheetsService.syncOpenPositions` a cada 60s iteram todas as posições e fazem requisições `fetch` individuais para o Apps Script do Google.
   - Solução v3.0: Envio estritamente em **lote único (batch)** e **fire-and-forget assíncrono** com debounce, evitando travar o event loop do Node.js.
4. **Persistência em Memória RAM vs PostgreSQL:**
   - Atualmente históricos e contrafactuais ficam acumulados na memória do processo Node.
   - Solução v3.0: Gravação em append-only particionado no PostgreSQL oficial (`DATABASE_URL`), garantindo que o Node.js permaneça **100% stateless** e com uso de memória mínimo.

---

## 📋 2. Fases do Plano de Execução

### 🚀 FASE 0: Desengasgo Emergencial e Alívio de Carga (Safe-Dev)
- [ ] **Ajuste de Rate Limit em `server/src/index.ts`:**
  - Aumentar o `globalLimiter` para 1.500 req/15min e ignorar rotas de telemetria/dashboard interno (`/api/admin/*`, `/api/dashboard/*`).
- [ ] **Alívio de Polling no Frontend:**
  - Ajustar o polling de `LayaGovernanceControl.tsx` de 3s para 5s–8s quando a janela estiver ativa, e pausar se a aba estiver em segundo plano (`document.hidden`).
- [ ] **Debounce e Batch no Google Sheets:**
  - Otimizar `GoogleSheetsService` para agrupar posições em um único payload HTTP POST em vez de múltiplos `fetch` sequenciais.

### 🗄️ FASE 1: Event Store v3.0 no PostgreSQL Principal
- [ ] **Script de Migração SQL (`server/src/db/migrations/001_event_store_v3.sql`):**
  - Tabela `trade_events` (particionada mensalmente por `entry_ts`).
  - Tabela `decision_events` (particionada semanalmente por `issued_at`) com a trigger `trg_decision_immutable` que bloqueia UPDATEs em campos que não sejam contrafactuais (`delta_r`, `attributed_r`, `counterfactual_r`).
  - Tabela `session_snapshots` (particionada por `date`) e tabela agregada `session_snapshots_monthly`.
  - Índices para os 10 blocos: `idx_te_entry_ts`, `idx_te_exit_type`, `idx_te_cluster_entry`, `idx_de_type_issued`, `idx_de_latency`, etc.
- [ ] **Service Layer de Eventos (`server/src/services/eventStoreService.ts`):**
  - Métodos assíncronos não-bloqueantes (`fire-and-forget`): `recordTradeEvent()`, `recordDecisionEvent()`, `updateCounterfactual()`, `upsertSessionSnapshot()`.

### ⚡ FASE 2: API do Dashboard dos 10 Blocos com Cache Server-Side
- [ ] **Criação de Rotas Agregadas (`server/src/routes/dashboardRoutes.ts`):**
  - `GET /api/dashboard/overview`: Retorna latência p50/p95, overrides usados/teto, atribuição $\Delta R$, última decisão e breaker. Cache em memória de 3 segundos para responder em < 5ms sem consultar o banco a cada requisição.
  - `GET /api/dashboard/blocks`: Executa as queries analíticas dos 10 Blocos (Expectância $E[R]$, Assimetria MFE/MAE, Fator de Lucro, Risco de Ruína, $N_{eff}$, Exposição/Beta, Eficiência por Ativo, Atribuição Laya, Integridade Operacional, Calibração Brier) com cache de 30 segundos.
  - `GET /api/dashboard/attribution`: Tabela discriminada por poder com status de gate.
  - `GET /api/dashboard/feed`: Histórico dos últimos 50 eventos com paginação.
- [ ] **Montagem de Rotas em `server/src/index.ts`:**
  - Montar `/api/dashboard` com bypass no rate limiter.

### 📊 FASE 3: Interface Web — Terminal Web & Dashboard dos 10 Blocos
- [ ] **Componente `MasterHealthDashboard.tsx`:**
  - `DashboardHeader`: Toggle 3 estados (OFF / SHADOW / ACTIVE), badge de latência e circuit breaker.
  - `CoreMetricsRow`: 4 cards principais (Latência p50/p95, Overrides 2/3, $\Delta R$ Atribuição, Última Decisão).
  - `TenBlocksGrid`: Grid 2x5 interativa com os 10 Blocos e semáforos 🟢🟡🔴.
  - `BottomPanels`: Painel de atribuição de poderes à esquerda e Feed em tempo real à direita.
  - `SessionSummaryBar`: Barra de rodapé com Drawdown, Beta e Margem.
- [ ] **Integração no Menu do `TradingTerminal.tsx`:**
  - Adicionar botão de alternância/modal para acesso instantâneo ao Dashboard dos 10 Blocos sem poluição visual.

---

## 🛡️ 3. Regras de Ouro Safe-Dev Garantidas

1. **Porta Estrita:** Permanece porta `4000` (sem invadir portas 3000-3003 ou 8000).
2. **Dono Único do Stop:** O motor (`paperTradingEngine.ts`) continua como único escritor de ordens e posições.
3. **Diffs Cirúrgicos:** Nenhuma reescrita de arquivos grandes; código modular em novos arquivos de serviço e rotas dedicadas.
4. **Economia de Recursos:** PostgreSQL principal já existente reutilizado sem custos de novos containers.
