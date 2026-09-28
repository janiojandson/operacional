# Plano de Sobrevivência, Governança Darwinista e Liquidação On-Chain Web

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dotar o agente `nexus-quant-solana` de consciência ativa de sobrevivência (filtro de maturidade 20-240 min, Time-Stop de 15 min, modo espartano dinâmico) e implementar no Dashboard Web uma tabela com varredura RPC on-chain de TODAS as contas SPL da carteira Phantom com botões de liquidação individual imediata para SOL e resgate de rent exemption.

**Architecture:** 
1. **Governança & Vitalidade:** Conectar `vitalityEngine` ao scanner e dimensionador de lote (modo espartano dinâmico baseado em saldo real).
2. **Scanner & Maturidade:** Atualizar `dexScreenerScanner` para rejeitar lançamentos < 20 minutos ou sem liquidez real ($15k+).
3. **Time-Stop:** Integrar no `positionExitEngine` e `runUltraFastExitMonitor` o fechamento automático após 15 min de estagnação.
4. **Visão On-Chain & Liquidação Web:** Criar rota `/api/wallet/tokens` e ação `POST /api/wallet/liquidate-token` que lê direto via `connection.getParsedTokenAccountsByOwner()`, exibindo no Dashboard HTML cada token existente na Phantom com o botão `[🚨 Liquidar para SOL]`.

**Tech Stack:** TypeScript, Node.js, `@solana/web3.js`, `@solana/spl-token`, Jupiter V6 Swap API, TailwindCSS / HTML.

**Spec:** Baseado no consenso com o usuário em 27/09/2026 para eliminação de risco de inanição e controle on-chain total.

## Global Constraints
- Nenhuma dependência externa não-auditada.
- Respeitar a chave da carteira Phantom oficial `FBx2SKLDLsdeLM8owxU8MNVPKAfJpLpmpHHRgiZDqBoi`.
- Todo fechamento de posição ou liquidação de token avulso deve obrigatoriamente chamar `createCloseAccountInstruction` para resgatar ~0.00204 SOL de caução.
- Não quebrar a suíte de testes existente (manter 100% dos testes passando).

---

### Task 1: Mapeamento On-Chain Real de Tokens na Carteira Phantom e Endpoint de Liquidação Avulsa

**Files:**
- Modify: `src/blockchain/solanaWallet.ts`
- Modify: `src/index.ts`
- Test: `tests/walletOnChainScan.test.ts`

**Interfaces:**
- Consumes: `connection.getParsedTokenAccountsByOwner(walletPublicKey)`
- Produces: `getWalletHoldingTokens(): Promise<Array<{ mint: string; symbol: string; amountTokens: number; decimals: number }>>`

- [ ] **Step 1: Escrever teste unitário para listagem on-chain de tokens da carteira**
- [ ] **Step 2: Implementar método `getHoldingTokens` em `SolanaWalletService`**
- [ ] **Step 3: Adicionar endpoint `GET /api/wallet/holdings` e `POST /api/wallet/liquidate-holding` em `index.ts`**
- [ ] **Step 4: Rodar suíte de testes e validar**

---

### Task 2: Botões e Tabela On-Chain no Dashboard Web (Mesmo Tokens Fora da Memória)

**Files:**
- Modify: `src/dashboard/dashboardRenderer.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: Endpoint `/api/wallet/holdings` e lista de posições
- Produces: Seção visual `🚨 Ativos On-Chain na Carteira Phantom (Detecção em Tempo Real)` com botão `[⚡ Liquidar para SOL & Resgatar Taxa]` por token.

- [ ] **Step 1: Adicionar tabela no HTML do dashboard para exibir todas as moedas detectadas na carteira**
- [ ] **Step 2: Adicionar script frontend para disparar `POST /api/wallet/liquidate-holding` ao clicar no botão**
- [ ] **Step 3: Testar renderização do Dashboard**

---

### Task 3: Consciência de Sobrevivência & Filtro de Maturidade no Scanner

**Files:**
- Modify: `src/scanner/dexScreenerScanner.ts`
- Modify: `src/core/vitalityEngine.ts`
- Test: `tests/scannerMaturity.test.ts`

**Interfaces:**
- Consumes: `item.pairCreatedAt` e `item.liquidity.usd`
- Produces: Rejeição estrita de tokens com idade < 20 minutos (`ageMs < 20 * 60 * 1000`) e liquidez < $15.000 USD.

- [ ] **Step 1: Escrever testes unitários para o filtro de maturidade (20 a 240 minutos)**
- [ ] **Step 2: Atualizar `dexScreenerScanner.ts` com as novas travas biológicas**
- [ ] **Step 3: Rodar os testes e verificar conformidade**

---

### Task 4: Time-Stop Biológico (15 Minutos de Estagnação)

**Files:**
- Modify: `src/execution/positionExitEngine.ts`
- Modify: `src/index.ts`
- Test: `tests/timeStop.test.ts`

**Interfaces:**
- Consumes: `pos.entryTimestamp` e cotação de PnL a cada 1.5s
- Produces: Disparo de sinal `'TIME_STOP'` se `elapsedMs >= 15 * 60 * 1000` e o trade não decolou (+30% / +50%).

- [ ] **Step 1: Escrever teste unitário para detecção de Time-Stop**
- [ ] **Step 2: Implementar lógica no `positionExitEngine.ts`**
- [ ] **Step 3: Conectar o gatilho no loop de 1.5s de `index.ts`**
- [ ] **Step 4: Rodar suíte completa de testes**

---

### Task 5: Build, Verificação Integrada e Deploy no Railway

**Files:**
- Execute: `npm test`
- Execute: `npm run build`
- Git commit e push para disparar o deploy de produção

- [ ] **Step 1: Executar `npm test` e `npm run build`**
- [ ] **Step 2: Commit e push para o repositório**
- [ ] **Step 3: Verificar status no Railway e certificar o funcionamento do novo Dashboard**
