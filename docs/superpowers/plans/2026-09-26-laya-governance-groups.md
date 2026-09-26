# Plano de Implementação: Governança de 3 Grupos e Subgrupos da Laya (Sistema 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar arquitetura de Governança Semântica da Laya dividida em 3 Grupos (Pré-Entrada, Perdão de Cooldown e Ciclo de Vida da Posição), eliminando falsos bloqueios de scale-in e chamadas repetitivas sem novidade de microestrutura.

**Architecture:** O motor de mercado (`server/src/index.ts`) classifica cada evento em um Grupo e Subgrupo de Intenção antes de consultar o `LayaGovernanceService`. A Laya recebe payloads semanticamente ricos com perguntas contextuais específicas, e a Constituição de Risco só avalia regras de Scale-In quando o evento for explicitamente do Grupo 3 Subgrupo B (`SCALE_IN_EXPANSION`).

**Tech Stack:** Node.js, TypeScript, Express, Socket.IO, PostgreSQL, Laya System 1 (`convaiinnovations/laya` / Uvicorn).

**Spec:** Baseado na discussão de alinhamento de 26/09/2026 e nos contratos de [`shared/layaGovernanceTypes.ts`](file:///d:/Programas/Desenvolvendo/Mercado%20Financeiro/shared/layaGovernanceTypes.ts).

## Global Constraints
- **Preservação de Contratos:** Manter assinaturas públicas, eventos do Socket.IO (`strategy_decision`, `flow_signal`) e contratos de banco.
- **Protocolo Safe-Dev:** Alterações estritamente cirúrgicas; sem reescrita integral de arquivos.
- **Isolamento de Erro:** Falhas na Laya nunca devem interromper o loop de streaming de preços do mercado financeiro.

---

### Task 1: Contrato Semântico de Grupos e Subgrupos em `shared/layaGovernanceTypes.ts`

**Files:**
- Modify: [`shared/layaGovernanceTypes.ts`](file:///d:/Programas/Desenvolvendo/Mercado%20Financeiro/shared/layaGovernanceTypes.ts)

**Interfaces:**
- Produces: `LayaIntentGroup = 'PRE_ENTRY' | 'COOLDOWN_AUDIT' | 'POSITION_LIFECYCLE'`
- Produces: `LayaIntentSubgroup = 'NEW_OPPORTUNITY' | 'LIQUIDITY_SWEEP_REENTRY' | 'DEFENSE_CONTRARIAN_FLOW' | 'RUNNER_EVALUATION' | 'SCALE_IN_REQUEST'`
- Extends: `LayaGovernanceRequest` para incluir `intentGroup: LayaIntentGroup` e `intentSubgroup?: LayaIntentSubgroup`

- [ ] **Step 1: Adicionar os novos tipos literais e atualizar a interface de request**
- [ ] **Step 2: Adicionar os campos opcionais em `LayaGovernanceRequest`**
- [ ] **Step 3: Compilar TypeScript com `npm run build` para garantir ausência de erros de tipo**

---

### Task 2: Refatoração Cirúrgica do `LayaGovernanceService`: Desacoplamento de Scale-In e Payloads Semânticos

**Files:**
- Modify: [`server/src/services/layaGovernanceService.ts`](file:///d:/Programas/Desenvolvendo/Mercado%20Financeiro/server/src/services/layaGovernanceService.ts)

**Interfaces:**
- Consumes: `LayaIntentGroup`, `LayaIntentSubgroup` de `shared/layaGovernanceTypes.ts`
- Modifies: `validateConstitutionRules()` e `requestGovernance()`

- [ ] **Step 1: Corrigir a montagem de `allowScaleIn` em `proposal`**
  - Mudar `allowScaleIn: choice === 'AUTHORIZE'` para:
  ```typescript
  allowScaleIn: payload.intentSubgroup === 'SCALE_IN_REQUEST' && choice === 'AUTHORIZE'
  ```
  Isso garante que entradas virgens (`PRE_ENTRY` / `NEW_OPPORTUNITY`) **nunca** ativem a validação de Scale-In e passem limpas pela Constituição.

- [ ] **Step 2: Construir Prompt/Payload Semântico Dinâmico para a Laya por Grupo**
  - Se `intentGroup === 'PRE_ENTRY'`: Pergunta sobre aprovação de novo risco com potência dinâmica (1.5x a 6.0x).
  - Se `intentGroup === 'COOLDOWN_AUDIT'`: Pergunta sobre Liquidity Sweep e perdão de cooldown.
  - Se `intentGroup === 'POSITION_LIFECYCLE'`:
    - Subgrupo `DEFENSE_CONTRARIAN_FLOW`: Pergunta sobre `CLOSE_NOW` ou manutenção.
    - Subgrupo `RUNNER_EVALUATION`: Pergunta sobre `CONVERT_TO_SUPER_RUNNER` ou `EARLY_HARVEST_CLOSE`.

- [ ] **Step 3: Testar localmente com `npm run build` e validar lógica de isolamento de escala**

---

### Task 3: Integração dos 3 Grupos de Governança no Motor de Execução (`server/src/index.ts`)

**Files:**
- Modify: [`server/src/index.ts`](file:///d:/Programas/Desenvolvendo/Mercado%20Financeiro/server/src/index.ts)

**Interfaces:**
- Consumes: `layaGovernanceService.requestGovernance()` com novos grupos

- [ ] **Step 1: Implementar Grupo 1 (Pré-Entrada) com Trava de Posição Pré-Existente**
  - Antes de consultar a Laya para nova entrada em `signal`:
  ```typescript
  const hasPosition = paperTrading.getAccountState().openPositions.some(p => p.symbol === signal.symbol);
  if (hasPosition) return; // Não perturba a Laya pedindo nova entrada em par já comprado/vendido
  ```
  - Enviar com `intentGroup: 'PRE_ENTRY'` e `intentSubgroup: 'NEW_OPPORTUNITY'`.

- [ ] **Step 2: Implementar Grupo 2 (Perdão de Cooldown)**
  - No bloco `if (cooldownActive)`:
  - Enviar com `intentGroup: 'COOLDOWN_AUDIT'` e `intentSubgroup: 'LIQUIDITY_SWEEP_REENTRY'`.

- [ ] **Step 3: Implementar Grupo 3 (Ciclo de Vida da Posição)**
  - No loop de trades (`marketManager.on('trade')`):
  - Se agressão contrária de baleia: `intentGroup: 'POSITION_LIFECYCLE'`, `intentSubgroup: 'DEFENSE_CONTRARIAN_FLOW'`.
  - Se $R \ge +1.2$: `intentGroup: 'POSITION_LIFECYCLE'`, `intentSubgroup: 'RUNNER_EVALUATION'`.

- [ ] **Step 4: Compilar o projeto (`npm run build`) e verificar que todos os tipos estão alinhados**

---

### Task 4: Validação em Produção (Railway) e Auditoria de Métricas

**Files:**
- Deploy via Git commit & push para `origin/main`

- [ ] **Step 1: Enviar commits ao GitHub e acompanhar build automático do Railway**
- [ ] **Step 2: Monitorar logs do Railway buscando as primeiras chamadas com a nova taxonomia**
- [ ] **Step 3: Verificar que o status `REJECTED_BY_CONSTITUTION: SCALE_IN_REQUIRES_1_2R_PROFIT` desaparece nas entradas primárias e o botão verde `AUTHORIZE` gera posições ativas**
- [ ] **Step 4: Confirmar na planilha Google Sheets que o histórico da Laya registra as decisões categorizadas por grupo**
