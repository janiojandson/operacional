# Refatoração Ledger de Produção e Laya Ofensiva Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o simulador em um ambiente de produção real com banca real (sem banca teórica de 500), histórico (ledger) preciso com parciais e taxas, funcionalidade de zerar sessão com versionamento auditável (`sessionId`) e ativar o poder ofensivo/defensivo completo do Macro Sentinel através da Laya com blindagens de risco e fallback resiliente.

**Architecture:** Modificaremos a Engine para aceitar o saldo real da corretora e respeitar lotes mínimos (`minNotional` e `stepSize`) calculados sobre a margem disponível (`availableMargin`), emitindo eventos estruturados (`SIGNAL_SKIPPED_MIN_LOT`) caso o lote não seja atendido. A `LayaGovernanceService` receberá regras condicionais baseadas no `predictiveScore` do Sentinel para modular a potência com teto estrito de risco (`MAX_ALLOWED_RISK_CAP`) e fallback neutro (`1.0x`) em caso de falha do microserviço. Para a gestão de sessão, o endpoint de reset arquivará o histórico sob um novo `sessionId` e bloqueará resets destrutivos caso haja posições abertas (`HTTP 409`). No frontend, criaremos um componente `TradeLedger` detalhado, termômetro do Sentinel e o botão de "Zerar Sessão".

**Tech Stack:** TypeScript, Node.js (Express), React, Tailwind.

**Spec:** Derivado de diretrizes arquiteturais e governança de risco do Sócio Digital.

## Global Constraints

- Nunca reescrever mais de 40 linhas sem validação prévia — apenas diffs cirúrgicos.
- Nenhuma dependência externa nova (usar ferramentas nativas/existentes).
- Toda comunicação inter-serviços pela Railway Private Mesh (`*.railway.internal:PORTA`).

---

### Task 1: Integração de Saldo Real e Lote Mínimo (Fim dos $500 Fixos)

**Files:**
- Modify: `server/src/engine/paperTradingEngine.ts`

**Interfaces:**
- Consumes: API da Corretora / Conta (`availableMargin`, `stepSize`, `minNotional`).
- Produces: `initialBalance` dinâmico baseado no saldo real do cliente; evento estruturado `SIGNAL_SKIPPED_MIN_LOT` quando os requisitos de margem ou lote não forem atendidos.

- [ ] **Step 1:** Modificar o construtor ou a inicialização da `PaperTradingEngine` para remover o *hardcode* de 500 e aceitar a leitura do saldo real / margem disponível (`availableMargin`).
- [ ] **Step 2:** Modificar o cálculo de dimensionamento para validar sobre a margem disponível (`availableMargin`) em vez de saldo bruto, aplicando verificação dupla: `stepSize` (arredondamento correto de quantidade) e `minNotional` (tamanho mínimo financeiro da ordem da corretora).
- [ ] **Step 3:** Implementar descarte auditável: se a conta do cliente não suportar o lote mínimo ou violar `minNotional`, disparar evento/alerta estruturado `SIGNAL_SKIPPED_MIN_LOT` (com payload do símbolo, lote exigido e margem disponível) em vez de descarte silencioso.
- [ ] **Step 4:** Validar com testes unitários / simulação de cenários com banca reduzida e lotes fracionados.
- [ ] **Step 5:** Commit: `feat(engine): integrate availableMargin sizing, minNotional validation and SIGNAL_SKIPPED_MIN_LOT alert`

### Task 2: Funcionalidade de Zerar Sessão (Reset com Arquivamento & Proteção)

**Files:**
- Modify: `server/src/engine/paperTradingEngine.ts`
- Modify: `server/src/routes/dashboardRoutes.ts` (ou arquivo de rotas apropriado)

**Interfaces:**
- Consumes: Requisição HTTP POST no endpoint `/api/session/reset`.
- Produces: Novo `sessionId`, histórico anterior preservado/arquivado no banco e retorno `HTTP 409 Conflict` se houver posições ativas.

- [ ] **Step 1:** Adicionar controle de sessão no `PaperTradingEngine`: gerar um novo identificador único `sessionId` a cada inicialização/reset e arquivar os registros da sessão anterior no banco de dados em vez de sobrescrever destrutivamente.
- [ ] **Step 2:** Implementar trava de integridade: bloquear a execução do método `resetSession` se `openPositions.length > 0`, retornando erro claro com código `HTTP 409 Conflict` (ou `400 Bad Request`) exigindo fechamento das ordens abertas antes de resetar.
- [ ] **Step 3:** Criar o endpoint `POST /api/session/reset` em `server/src/routes/dashboardRoutes.ts` invocando a lógica com os devidos códigos de status e payload contendo o novo `sessionId`.
- [ ] **Step 4:** Validar que `realizedPnl`, `winRate` e contadores da sessão vigente reflitam estritamente a nova sessão ativa iniciada pelo reset.
- [ ] **Step 5:** Commit: `feat(api): implement safe session reset with sessionId archiving and open position lock`

### Task 3: Inteligência Ofensiva e Defensiva do Sentinela na Laya

**Files:**
- Modify: `server/src/services/layaGovernanceService.ts`

**Interfaces:**
- Consumes: Resposta `predictiveScore`, `confidencePct` e `regime` do `macroSentinelClient`.
- Produces: `powerMultiplier` modulado com teto estrito de risco e fallback seguro neutro (`1.0x`).

- [ ] **Step 1:** Localizar a etapa de consulta do Macro Sentinel na `LayaGovernanceService`.
- [ ] **Step 2:** Adicionar Lógica Defensiva (Filtro Direcional): Se `regime` for `BEARISH_DUMP`, vetar sinais de `BUY` (mas permitir operações de `SELL` alinhadas ao fluxo descendente).
- [ ] **Step 3:** Adicionar Lógica Ofensiva com Teto de Segurança: Se `regime` for favorável e `confidencePct` elevado, modular o multiplicador de potência respeitando rigorosamente o limite `Math.min(calculatedMultiplier, MAX_ALLOWED_RISK_CAP)` para blindagem de capital.
- [ ] **Step 4:** Adicionar Fallback Resiliente: se a comunicação com o microserviço do Macro Sentinel falhar ou der timeout, aplicar fallback neutro padrão (`powerMultiplier: 1.0x`), sem emitir veto indevido, apenas registrando um log de alerta `[WARN] Sentinel unavailable, defaulting to neutral governance`.
- [ ] **Step 5:** Registrar em telemetria o racional da modulação (`rationaleCode: 'SENTINEL_OFFENSIVE_SURGE'` ou `'SENTINEL_DIRECTIONAL_VETO'`).
- [ ] **Step 6:** Commit: `feat(laya): add offensive power scaling with MAX_ALLOWED_RISK_CAP and resilient neutral fallback`

### Task 4: Refatoração do Painel (Trade Ledger & Histórico Vivo)

**Files:**
- Modify: `web/src/pages/ClientDashboard.tsx` (ou componente equivalente)
- Modify: `web/src/components/Advisor/MasterHealthDashboard.tsx`

**Interfaces:**
- Consumes: Array `history` e dados de sessão da rota `/api/dashboard/summary`.
- Produces: UI de Tabela Rica detalhando cada operação da sessão, parciais, taxas, timestamp de fechamento e razão do fechamento.

- [ ] **Step 1:** Criar um botão de ação rápida "🔄 Zerar Sessão" na barra superior com diálogo modal de confirmação, tratando o feedback visual caso haja posições abertas bloqueando o reset (HTTP 409).
- [ ] **Step 2:** Componentizar o Histórico. Criar uma tabela (Ledger) iterando sobre `history` da sessão atual.
- [ ] **Step 3:** Adicionar as colunas: "Ativo", "Abertura/Fechamento (Hora)", "Saída Parcial", "Motivo (TP, Trail, SL)", "Taxas (Fee)", e "Líquido".
- [ ] **Step 4:** Criar o "Termômetro Sentinela" visual na tela principal: exibir o `regime` em cor verde/vermelha/amarela com o `predictiveScore` e estado de confluência macro.
- [ ] **Step 5:** Commit: `feat(ui): implement real ledger history, reset session button, and macro thermometer`
