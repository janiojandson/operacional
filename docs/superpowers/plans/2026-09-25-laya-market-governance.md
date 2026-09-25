# Laya ↔ Mercado Financeiro v2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar o Decisor Sistema 1 (Laya) ao motor de execução do Mercado Financeiro (MarketFlow Pro) com arquitetura Propositor vs Executor (único dono do stop), validação constitucional rígida, semântica de falha dupla e liberação em cascata de poderes.

**Architecture:** O Mercado Financeiro (:4000) coleta dados L2/Ticks e dispara payload sub-15ms via `POST /v1/systemone/market-governance` para a Laya (:8000). A Laya devolve propostas determinísticas com rationale por enum. O motor valida rigorosamente a proposta contra a Constituição de 5 linhas vermelhas, versão de estado (`stateVersion`) e expiração (`expiresAt`), executando de forma segura ou descartando com log contrafactual.

**Tech Stack:** TypeScript (Node.js/Express, Vite/React), fetch nativo com `AbortController` (timeout estrito 25ms), node:test para asserções e testes unitários.

**Spec:** Documento Mestre Projeto SaaS & `PLANO DE INTEGRAÇÃO: LAYA ↔ MERCADO FINANCEIRO DE CRIPTO Versão 2.0`.

## Global Constraints

- **Porta Oficial Estrita:** Mercado Financeiro opera estritamente na porta `4000`. Laya opera na porta `8000` (`http://nexus-decisor-laya.railway.internal:8000` em prod / `http://127.0.0.1:8000` com fallback configurável).
- **Proibição de Colisão:** NUNCA invadir ou alterar portas 3000-3003, 8000 ou 8080.
- **Protocolo safe-dev:** Modificações cirúrgicas (máximo 40 linhas por bloco), proibido reescrever arquivos completos. Não alterar schemas consumidos por lightweight-charts nem contratos existentes de API.
- **Dono Único do Stop:** O motor (:4000) é o único escritor do stop e da posição. A Laya apenas propõe (`PROPOSER`, nunca `WRITER`).
- **A Constituição Inegociável:**
  1. Proibido preço médio para trás (martingale).
  2. Teto financeiro estrito por trade (R máximo, max 1.5% da banca).
  3. Circuit breaker diário (-3R congela autonomia da Laya).
  4. Stop só move a favor (`TIGHTEN` ou `TO_PROFIT`; `WIDEN` é terminantemente rejeitado).
  5. Cap de beta por cluster de correlação.
- **Semântica de Falha Dupla:**
  - *Novo Risco (Entrada, Scale-in, Potência):* Fail-Closed (sem resposta em 25ms = rejeição).
  - *Proteção (Stop, Saída, Colheita):* Fail-Open (motor executa proteção local sem esperar por Laya).

---

## Files Mapping

- **Create:** `shared/layaGovernanceTypes.ts` — Contratos de dados compartilhados, enums de ações (`AUTHORIZE`, `VETO`, `CLOSE_NOW`, etc.), rationale enums, rejection codes e payloads.
- **Create:** `server/src/services/layaGovernanceService.ts` — Serviço de comunicação HTTP com a Laya, timeout de 25ms, validador constitucional, gerenciamento de estado operacional (`OFF`, `SHADOW`, `ACTIVE`) e métricas (p50/p95, taxas de veto/override, contrafactual).
- **Test:** `server/src/services/layaGovernanceService.test.ts` — Bateria de testes unitários cobrindo falha dupla, rejeições constitucionais, expiração e cálculo contrafactual.
- **Modify:** `server/src/engine/paperTradingEngine.ts` — Ancorar validação de entrada, perdão de cooldown condicional, micro-stop e runner harvest.
- **Modify:** `server/src/routes/adminRoutes.ts` — Endpoints para alternância de estado Laya (`OFF` / `SHADOW` / `ACTIVE`) e consulta do painel de 4 métricas e feed.
- **Modify:** `web/src/components/TradingTerminal.tsx` (ou componente de status) — Badges de 3 estados e feed de auditoria de governança Laya.

---

### Task 1: Data Contracts & Governance Types

**Files:**
- Create: `shared/layaGovernanceTypes.ts`
- Test: `server/src/services/layaGovernanceTypes.test.ts`

**Interfaces:**
- Produces:
  - `LayaGovernanceAction`: `'AUTHORIZE' | 'VETO' | 'CLOSE_NOW' | 'EARLY_HARVEST_CLOSE' | 'CONVERT_TO_SUPER_RUNNER' | 'AUTHORIZE_SCALE_IN' | 'OVERRIDE_COOLDOWN' | 'NO_ACTION'`
  - `LayaMode`: `'OFF' | 'SHADOW' | 'ACTIVE'`
  - `LayaGovernanceRequest`: Payload de telemetria enviado pelo motor
  - `LayaGovernanceResponse`: Resposta proposta pela Laya
  - `ConstitutionCheckResult`: Validação contra as 5 linhas vermelhas

- [ ] **Step 1: Write failing test for type guards & contract validation**

```typescript
// server/src/services/layaGovernanceTypes.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { isProposalExpired, validateConstitutionRules } from './layaGovernanceService.js';
import type { LayaGovernanceResponse } from '../../../shared/layaGovernanceTypes.js';

test('isProposalExpired detects expired decisions', () => {
  const expired: LayaGovernanceResponse = {
    decisionId: 'test-1',
    stateVersion: 10,
    issuedAt: Date.now() - 50000,
    expiresAt: Date.now() - 1000,
    action: 'AUTHORIZE',
    symbol: 'BTC/USDT',
    powerMultiplier: 2.0,
    riskPct: 1.0,
    governance: {},
    rationaleCode: 'SWEEP_RECLAIM_CVD_CONVERGENT',
    trace: { l2DepthTop20: 100, imbalanceRatio: 2.0, cvdDelta60s: 50, spoofScore: 0.05, betaDivergence: false }
  };
  assert.equal(isProposalExpired(expired), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx server/src/services/layaGovernanceTypes.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `shared/layaGovernanceTypes.ts`**

Define exact interfaces, enums and safety constraints as specified in v2.0.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --import tsx server/src/services/layaGovernanceTypes.test.ts`
Expected: PASS.

---

### Task 2: LayaGovernanceService (Motor Side with 25ms Timeout & Constitution)

**Files:**
- Create: `server/src/services/layaGovernanceService.ts`
- Create: `server/src/services/layaGovernanceService.test.ts`

**Interfaces:**
- Produces:
  - `class LayaGovernanceService`
  - Methods:
    - `requestGovernance(payload: LayaGovernanceRequest): Promise<LayaGovernanceDecision>`
    - `setMode(mode: 'OFF' | 'SHADOW' | 'ACTIVE'): void`
    - `getMode(): 'OFF' | 'SHADOW' | 'ACTIVE'`
    - `getMetrics(): LayaMetrics`
    - `recordCounterfactual(decisionId: string, actualResult: number): void`

- [ ] **Step 1: Write failing unit test for Constitution & Timeout**

Test that:
1. `stopLossMoveDirection: 'WIDEN'` is REJECTED_BY_CONSTITUTION.
2. `riskPct > 1.5` is capped or rejected.
3. Timeout of 25ms triggers fail-closed for entries and fail-open for protections.
4. Cooldown override is capped at max 3 per session.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx server/src/services/layaGovernanceService.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `LayaGovernanceService`**

Implement sub-25ms fetch with `AbortController`, constitution checks, mode branching (`OFF` / `SHADOW` / `ACTIVE`), latency p50/p95 accumulator, and counterfactual logging.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --import tsx server/src/services/layaGovernanceService.test.ts`
Expected: PASS.

---

### Task 3: Engine Hooking & Cooldown Override Gatekeeper

**Files:**
- Modify: `server/src/engine/paperTradingEngine.ts` (Surgical diff <= 35 lines)
- Modify: `server/src/index.ts` (Surgical diff <= 35 lines)
- Test: `node --test --import tsx server/src/services/layaGovernanceService.test.ts`

**Interfaces:**
- Consumes: `layaGovernanceService.requestGovernance`
- Implements:
  - Check cooldown: if `isCooldownActive()`, consult Laya for `OVERRIDE_COOLDOWN`. If approved, bypass cooldown and increment session pardon counter (max 3).
  - Gatekeeper entry filter: if Laya returns `VETO` (spoofing, spread, beta divergence), abort signal execution.
  - Micro-Stop proposal: if Laya recommends tight stop behind real liquidity (>3s), use proposal pct.

- [ ] **Step 1: Write unit test verifying cooldown override & veto logic**
- [ ] **Step 2: Run test to verify initial state**
- [ ] **Step 3: Apply surgical diffs to `paperTradingEngine.ts` and `index.ts`**
- [ ] **Step 4: Verify test passes and TypeScript builds without errors**

Run: `npx tsc -p server/tsconfig.json --noEmit`
Expected: 0 errors.

---

### Task 5: Admin API & Dashboard Metrics Endpoint

**Files:**
- Modify: `server/src/routes/adminRoutes.ts` (Surgical diff <= 30 lines)
- Test: `server/src/routes/adminRoutes.test.ts` or curl simulation

**Interfaces:**
- Produces:
  - `GET /api/admin/laya/status`: Retorna estado atual (`OFF` | `SHADOW` | `ACTIVE`), p50/p95, taxas de perdão e histórico de decisões recentes.
  - `POST /api/admin/laya/mode`: Alterna modo operacional.

- [ ] **Step 1: Write test for Laya admin routes**
- [ ] **Step 2: Add surgical routes in `server/src/routes/adminRoutes.ts`**
- [ ] **Step 3: Verify tests pass**

---

### Task 5: Web Terminal Visual Integration (3-State Badge & Governance Feed)

**Files:**
- Modify: `web/src/components/TradingTerminal.tsx` or related header component
- Test: Build validation `npm run build:web`

**Interfaces:**
- Visual Elements:
  - 3-State Badge: `OFF` (Cinza), `SHADOW` (Âmbar), `ACTIVE` (Verde 🧠), `OFFLINE (FALLBACK LOCAL)` (Vermelho pulsante quando timeout).
  - Governance Feed: Exibe `[LAYA OVERRIDE]`, `[LAYA VETO]`, `[LAYA SHADOW]`.

- [ ] **Step 1: Check frontend bundle and build**
- [ ] **Step 2: Add status badge and feed component**
- [ ] **Step 3: Run `npm run build:web` to verify zero regressions**

---

## Plan Review & Verification Check

1. **Spec Coverage:**
   - [x] Laya como Propositor e Motor como Dono Único do Stop.
   - [x] 5 Linhas Vermelhas da Constituição validadas em código.
   - [x] Semântica de Falha Dupla (25ms: fail-closed para risco, fail-open para proteção).
   - [x] 3 Estados Operacionais (OFF, SHADOW, ACTIVE).
   - [x] Limite de 3 perdões de cooldown por sessão.
   - [x] Telemetria de 4 métricas (p50/p95, taxa de perdão, P&L atribuído, contrafactual).
2. **Port Isolation:**
   - Mercado Financeiro permanece fixo na porta `4000`.
   - Laya chamada no destino `http://nexus-decisor-laya.railway.internal:8000`.
   - Nenhuma porta alterada.
3. **Safe-dev Compliance:**
   - Diffs isolados <= 40 linhas em arquivos existentes.
   - Novos módulos focados em arquivos dedicados (`layaGovernanceService.ts`, `layaGovernanceTypes.ts`).
