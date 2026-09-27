# Implementação: Otimização de Chamadas Laya, Cesta Dinâmica de Pares e Monetização por Ondas com Trailing L2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir em >70% as consultas redundantes à Laya (Sistema 1), integrar pares com alta tração de liquidez (SUI/USDT e DOGE/USDT substituindo o spread tóxico do BNB/USDT) e implementar a monetização dinâmica por ondas (Take Profit Parcial em +0.6R, Breakeven instantâneo e Trailing Stop Vivo colado no Book L2).

**Architecture:** 
- **Pilar 1 (Motor & Laya):** Pré-filtro de spread e quarentena progressiva de vetos no Node.js; ativação de consulta à Laya orientada a delta de CVD e baleias.
- **Pilar 2 (Símbolos):** Atualização do catálogo de ativos monitorados no `MarketDataManager` para adicionar `SUI/USDT` e `DOGE/USDT` e colocar `BNB/USDT` em quarentena.
- **Pilar 3 (Execução & Gestão de Posição):** Implementação de realização parcial em 2 estágios (+0.6R) no `PaperTradingEngine` e `ClientCopyTrader`, com ajuste automático para Breakeven (risco zero) e rastreamento de Trailing Stop ancorado em clusters de liquidez do Book L2.

**Tech Stack:** Node.js, TypeScript, Express, CCXT (BingX Linear), PostgreSQL, Vitest / Node Test Runner.

**Spec:** Baseado na auditoria real das últimas 100 requisições do PostgreSQL e no comportamento dos trades XRP/ETH de 26/09/2026 documentados em `docs/notebooklm_referencia_mercado_financeiro.md`.

## Global Constraints
- Seguir estritamente o protocolo `safe-dev` (máximo de 3 modificações cirúrgicas por ciclo, preservação de interfaces e sem reescrita destrutiva).
- Preservar a compatibilidade com a aba `Auditoria Ayla (Decisões)` do Google Sheets e o dashboard do Google Looker Studio.
- Manter as 4 Linhas Vermelhas da Constituição intactas (Martingale Zero, Teto de Risco 1.5%, Stop a Favor e Circuit Breaker de -3.0R).

---

### Task 1: Pré-Filtro de Spread e Quarentena de VETO no Node.js (Redução de Requisições)

**Files:**
- Modify: `server/src/services/layaGovernanceService.ts`
- Modify: `server/src/index.ts`
- Test: `server/src/services/layaGovernanceService.test.ts`

**Interfaces:**
- Consumes: `LayaMarketState` contendo `bookL2` ou `spreadBps`
- Produces: `isSpreadToxicLocal(spreadBps: number): boolean` e quarentena de 60s em `Map<string, number>`

- [ ] **Step 1: Escrever teste unitário para o filtro local de spread e quarentena de veto**
Criar teste verificando que se o spread for superior ao teto ou o símbolo estiver em quarentena pós-veto, a consulta à Laya é evitada e retorna `VETO` local imediatamente.

- [ ] **Step 2: Rodar teste para verificar falha**
Run: `npm test server/src/services/layaGovernanceService.test.ts`
Expected: FAIL (função ou comportamento ainda não existente).

- [ ] **Step 3: Implementar checagem local de spread e cache de quarentena em `layaGovernanceService.ts`**
Inserir verificação rápida: se o par estiver com spread > 5 bps ou tiver tomado VETO nos últimos 60 segundos sem alteração de book, reter localmente sem disparar requisição HTTP ao container Python.

- [ ] **Step 4: Rodar teste para verificar aprovação**
Run: `npm test server/src/services/layaGovernanceService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit cirúrgico**
```bash
git add server/src/services/layaGovernanceService.ts server/src/services/layaGovernanceService.test.ts
git commit -m "feat(laya): adiciona pre-filtro de spread e quarentena local de veto"
```

---

### Task 2: Atualização da Cesta de Ativos Monitorados (SUI e DOGE no lugar de BNB)

**Files:**
- Modify: `server/src/engine/marketDataManager.ts:20-35`
- Modify: `server/src/services/autoPairSelectorEngine.ts` (se aplicável)
- Test: `server/src/engine/marketDataManager.test.ts`

**Interfaces:**
- Produces: `DEFAULT_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'SUI/USDT', 'DOGE/USDT', 'XRP/USDT']`

- [ ] **Step 1: Escrever teste unitário validando a lista de símbolos ativos**
Verificar se `DEFAULT_SYMBOLS` contém `SUI/USDT` e `DOGE/USDT`, e não inclui `BNB/USDT`.

- [ ] **Step 2: Rodar teste para verificar falha**
Run: `npm test server/src/engine/marketDataManager.test.ts`
Expected: FAIL.

- [ ] **Step 3: Ajustar `DEFAULT_SYMBOLS` e `BYBIT_CATEGORIES` em `marketDataManager.ts`**
Substituir `BNB/USDT` por `SUI/USDT` e `DOGE/USDT`, garantindo as categorias lineares e precisão decimal de preço.

- [ ] **Step 4: Rodar teste para verificar aprovação**
Run: `npm test server/src/engine/marketDataManager.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit cirúrgico**
```bash
git add server/src/engine/marketDataManager.ts
git commit -m "feat(market): atualiza pares monitorados adicionando SUI e DOGE e pausando BNB"
```

---

### Task 3: Realização Parcial Rápida (+0.6R) com Stop no Breakeven (Risco Zero)

**Files:**
- Modify: `server/src/engine/paperTradingEngine.ts:240-300`
- Modify: `server/src/engine/paperTradingEngine.test.ts`

**Interfaces:**
- Produces: `trade.partialTaken: boolean`, `trade.partialPnlUsd: number`
- Behavior: Quando `currentPrice` atingir $\ge +0.6R$, fecha 50% do `qty`, move `stopLoss` para `entryPrice` e marca `partialTaken = true`.

- [ ] **Step 1: Escrever teste unitário no `paperTradingEngine.test.ts` para saída parcial e breakeven**
Testar que um trade comprado que atinge +0.6R reduz a quantidade em 50%, realiza o lucro e trava o stop loss no valor da entrada.

- [ ] **Step 2: Rodar teste para verificar falha**
Run: `npm test server/src/engine/paperTradingEngine.test.ts`
Expected: FAIL (campos e método de parcial não acionados).

- [ ] **Step 3: Implementar lógica de Realização Parcial e Breakeven em `updatePrice`**
No arquivo `paperTradingEngine.ts`, adicionar a verificação de lucro $\ge +0.6R$: debitar 50% da posição, registrar o PnL realizado no caixa e ajustar o `stopLoss = trade.entryPrice`.

- [ ] **Step 4: Rodar teste para verificar aprovação**
Run: `npm test server/src/engine/paperTradingEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit cirúrgico**
```bash
git add server/src/engine/paperTradingEngine.ts server/src/engine/paperTradingEngine.test.ts
git commit -m "feat(trading): adiciona realizacao parcial em +0.6R e ajuste para breakeven"
```

---

### Task 4: Trailing Stop Vivo Colado nas Paredes do Book L2

**Files:**
- Modify: `server/src/engine/paperTradingEngine.ts:270-340`
- Modify: `server/src/index.ts:1100-1160` (injeção dos 20 níveis do book na atualização de preço)
- Test: `server/src/engine/paperTradingEngine.test.ts`

**Interfaces:**
- Consumes: `currentBook.bids` e `currentBook.asks` (profundidade real)
- Produces: `trade.trailingStopPrice` posicionado a 1 tick atrás do maior cluster de liquidez passiva.

- [ ] **Step 1: Escrever teste unitário validando a ancoragem do trailing stop atrás da maior ordem do book**
Testar que com a posição em lucro, o stop loss segue o maior volume passivo de compra (para LONG) sem regredir se o preço subir.

- [ ] **Step 2: Rodar teste para verificar falha**
Run: `npm test server/src/engine/paperTradingEngine.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar cálculo do cluster de liquidez passiva para o trailing stop**
No `updatePrice`, varrer os níveis do Book L2 e ancorar o `trailingStopPrice` 1 tick atrás do cluster de maior volume, garantindo que o stop suba degrau por degrau.

- [ ] **Step 4: Rodar teste para verificar aprovação**
Run: `npm test server/src/engine/paperTradingEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit cirúrgico**
```bash
git add server/src/engine/paperTradingEngine.ts
git commit -m "feat(trading): implementa trailing stop vivo ancorado no Book L2"
```

---

### Task 5: Validação Integrada e Deploy no Railway

**Files:**
- Test: Execução dos testes de integração do servidor
- Deploy: Push para `origin/main` e monitoramento do log de deploy no Railway

- [ ] **Step 1: Rodar suíte completa de testes no backend**
Run: `npm run build && npm test` no diretório `server`.
Expected: 0 erros de compilação TypeScript e todos os testes passando.

- [ ] **Step 2: Enviar alterações para o repositório GitHub**
```bash
git push origin main
```

- [ ] **Step 3: Monitorar log de produção no Railway**
Verificar se o container inicializa com os novos pares (`SUI/USDT`, `DOGE/USDT`) e com as regras de saída parcial ativas.
