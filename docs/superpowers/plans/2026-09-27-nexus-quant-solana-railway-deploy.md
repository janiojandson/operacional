# Implementation Plan - Nexus Quant Solana 24/7 Railway Daemon & Postgres Audit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurar o agente soberano `nexus-quant-solana` para rodar 24/7 no Railway, com persistência stateless no PostgreSQL central compartilhado (`postgres.railway.internal:5432/railway`), sem custo de volume, padronizado conforme o `AGENTS.md`.

**Architecture:** 
1. Arquitetura 100% Stateless no filesystem (zero volumes caros no Railway).
2. Tabela dedicada `solana_agent_cycles` no PostgreSQL central para registrar histórico de scans, auditorias de rugs vetados e swaps executados.
3. Servidor de telemetria HTTP na porta `3009` (ou `$PORT`) respondendo a `/health` para monitoramento ativo do Railway.
4. Orquestração contínua a cada 30s conectada à Laya interna (`http://nexus-decisor-laya.railway.internal:8080`) e ao DexScreener/RugCheck/Jupiter.

**Tech Stack:** Node.js 22, TypeScript, `@solana/web3.js`, `pg` (PostgreSQL client pool), Docker, Railway.

**Spec:** Baseado na topologia unificada de `AGENTS.md` (Mercado Financeiro / Nexus Cérebro) e no manifesto darwinista do agente.

---

## Global Constraints

- **PORTA OFICIAL:** 3009 (com fallback para `process.env.PORT`).
- **BANCO DE DADOS:** Compartilhar estritamente o PostgreSQL Central (`postgres.railway.internal:5432/railway`). Proibido criar novo banco.
- **POLÍTICA DE VOLUMES:** Zero volumes de disco. O agente é completamente Stateless no filesystem.
- **SEGURANÇA DE CHAVES:** Nunca expor a chave privada (`AGENT_SOLANA_PRIVATE_KEY`) no código ou no Git. Todas as credenciais via variáveis de ambiente do Railway.
- **MODO SEGURO:** Manter `DRY_RUN_MODE=true` por padrão no Railway até aprovação de swaps reais.

---

## Files To Create / Modify

- `AGENTS.md` (Novo): Documento mestre de governança e especificação do agente Solana.
- `src/database/postgresClient.ts` (Novo): Pool e migrations automáticas para telemetria no PostgreSQL central.
- `src/database/postgresClient.test.ts` (Novo): Testes unitários do repositório/cliente de banco.
- `src/index.ts` (Modificar): Persistir os eventos de cada ciclo (vetos, aprovações, saldo e swaps) no banco.
- `package.json` (Modificar): Adicionar dependência `pg` e `@types/pg`.

---

### Task 1: Criar AGENTS.md Padronizado do Nexus Quant Solana

**Files:**
- Create: `d:/Programas/Desenvolvendo/nexus-quant-solana/AGENTS.md`

- [ ] **Step 1: Escrever AGENTS.md com missão, portas e regras de infraestrutura**
- [ ] **Step 2: Verificar aderência com os padrões dos outros agentes Nexus**
- [ ] **Step 3: Commit no git**

---

### Task 2: Implementar Repositório PostgreSQL Central (Zero Volume)

**Files:**
- Create: `src/database/postgresClient.ts`
- Test: `src/database/postgresClient.test.ts`
- Modify: `package.json` (adicionar `pg` e `@types/pg`)

**Interfaces:**
- Consumes: `process.env.DATABASE_URL`
- Produces: `recordCycleAudit(event: CycleAuditEvent): Promise<void>`

- [ ] **Step 1: Adicionar `pg` ao package.json e rodar npm install**
- [ ] **Step 2: Escrever teste unitário para gravação e formatação de logs no banco**
- [ ] **Step 3: Implementar o cliente Postgres com criação resiliente da tabela `solana_agent_audits`**
- [ ] **Step 4: Executar testes (`npm test`) e validar aprovação 100%**
- [ ] **Step 5: Commit no git**

---

### Task 3: Integrar Registro do Ciclo no index.ts e Validar Compilação

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Chamar gravação assíncrona no Postgres a cada ciclo finalizado**
- [ ] **Step 2: Rodar build e validação de types (`npm run build`)**
- [ ] **Step 3: Commit no git e push para `origin main`**

---

### Task 4: Orientação e Acionamento do Railway

- [ ] **Step 1: Verificar status do Git remoto**
- [ ] **Step 2: Fornecer o checklist exato das variáveis de ambiente a serem preenchidas no painel do Railway**
