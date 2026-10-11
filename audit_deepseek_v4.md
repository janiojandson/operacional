# Auditoria Diagnóstica e Otimização — MarketFlow Pro (audit_deepseek_v4)

**Data:** 2026-10-11 · **Modo:** Auditoria Estrita Non-Destructive (nenhum arquivo de produção alterado, nenhum commit na `main`)
**Escopo:** `D:\Programas\Desenvolvendo\Mercado Financeiro` (repo `janiojandson/operacional`, branch `main`)
**Produção:** `operacional-production-57d9.up.railway.app` (serviço `Mercado Financeiro`, projeto `Nexus-Multi`, região EU West)

---

## 0. Resumo Executivo

O projeto compila (build Vite OK) e está **Online e estável** no Railway (sem crash-loop; deploy atual `fddb9b35` desde 2026-10-08). Porém a auditoria encontrou **falhas críticas de autorização**, **silenciosa perda de dados no Event Store em deploys limpos**, e um conjunto relevante de problemas de latência/event-loop que violam a meta sub-25ms e a regra de persistência fire-and-forget do `AGENTS.md`.

O risco mais grave **não é de performance**: qualquer pessoa pode se **auto-cadastrar como CLIENTE** (`POST /api/auth/signup` aberto) e, com esse token, acionar endpoints de operador protegidos apenas por `requireAuth` (ex.: `/api/trading/reset`, `/api/trading/balance`), que fecham posições do Master e **disparam fechamentos de ordens REAIS** nas contas Bybit dos clientes via `ClientCopyTraderEngine`. A correção imediata é trocar esses guardas para `requireAdmin`.

**Scorecard geral: 4.0 / 10** — funcional, mas **não seguro** para operação financeira sem as correções P0/P1 abaixo.

---

## 1. Scorecard Geral (0–10)

| Dimensão | Nota | Justificativa resumida |
|---|---|---|
| **Performance & Latência** | **5/10** | Fan-out REST serial (11 símbolos), sem backoff 429, `loadMarkets()` por ordem, persistência awaited no caminho crítico, broadcast de book não-throttled. Há bons padrões (release em `finally`, `pool.on('error')`, emits throttled de conta, event-store fire-and-forget). |
| **Robustez do Motor Quantitativo** | **4/10** | Bug de tipagem `'CHOPPY'` (time-stop morto), cap de potência 2.0x da governança **ignorado** no sizing (pares até 5.0x), trava de correlação USD apenas observacional (não bloqueia), Monte Carlo degenerado (shuffle sem reposição), métricas fabricadas, R-legado por constantes. |
| **Segurança & Criptografia** | **3/10** | Autorização quebrada em endpoints de operador (P0), dashboard sem auth + isento de rate limit, dados do Master expostos publicamente (REST + WebSocket), AES-256-**CBC sem autenticação**, OTP de reset brute-forceável, `rejectUnauthorized:false` no DB externo. Positivos: bcrypt cost 12, `.env` ignorado, queries parametrizadas, sem segredos hardcoded. |
| **Manutenibilidade & Arquitetura** | **4/10** | `index.ts` monolítico (~1.697 linhas), Dockerfile com porta `8000` conflitante com a `4000` oficial, env `LAYA_*` legado, stub morto do Google Sheets, mistura BingX/Bybit, bundle front 801 kB sem code-split, cruft de versionamento. |

---

## 2. Top Riscos Críticos (P0 / P1)

### 🔴 P0-1 — Autorização quebrada: endpoints de operador acessíveis por qualquer CLIENTE
- **Arquivos:** `server/src/index.ts` (rotas inline), `server/src/auth/authMiddleware.ts`, `server/src/engine/clientCopyTraderEngine.ts`
- **Linhas:** index.ts `:966, :976, :1017, :1119, :1230, :1237, :1245, :1262, :1312, :1321, :1330, :1334, :1342, :1346, :1352, :1358, :1364, :1378, :1401, :1408, :1420, :1431` (todos `requireAuth`); signup aberto em `authRoutes.ts:123`
- **Problema:** `/api/trading/reset`, `/api/trading/balance`, `/api/paper-trading/*`, `/api/clients`, `/api/client-protection/*`, `/api/ai-advisor/*`, `/api/autonomous-pairs/*`, `/api/pairs/:symbol/toggle` usam apenas `requireAuth` (qualquer usuário autenticado, incluindo `CLIENT`), não `requireAdmin`. O cadastro público (`/api/auth/signup`) cria contas `CLIENT` sem aprovação.
- **Cadeia de impacto real:** `POST /api/trading/reset` → `paperTrading.closePosition(...,'MANUAL')` → callback do Master em `index.ts:210` chama `clientCopyTrader.replicateTrade(...)` → `bybitExecutionEngine.closeCopyPosition(cfg.client_id, symbol, 'REAL')` (e `closeRealPositionsBeforeMaster` em `index.ts:905`) → **fechamento de posições reais** em contas Bybit de clientes. `POST /api/trading/balance` também permite reescrever o saldo Master.
- **Correção (cirúrgica):** substituir `requireAuth` por `requireAdmin` em todas as rotas de operador listadas. Como camada adicional, bloquear o escalar de role/uso indevido do `clientId` no signup e exigir aprovação de `plan_active`.

### 🔴 P0-2 — Event Store: perda silenciosa de eventos em deploy limpo (ordem de migração)
- **Arquivos:** `server/src/database/eventStoreDb.ts:12-41, :156-161`; `migrations/20260928_laya_v2_event_store.sql:62-76`; `migrations/20261001_event_store_forensics.sql:32`; `services/eventStoreService.ts:167-178, :437`
- **Problema:** `initEventStoreTables()` cria `trade_events`/`decision_events` com schema legado, depois roda as migrações na ordem `['20261001_event_store_forensics.sql', '20260928_laya_v2_event_store.sql']`. A migração forense (`20261001`) adiciona colunas (`entry_decision_id`, `exit_decision_id`, `exit_reason_raw`, `branch_classification_raw`, …) à tabela, e **só então** a migração canônica (`20260928`) faz `ALTER TABLE trade_events RENAME TO trade_events_legacy` e recria a `trade_events` canônica **sem** essas colunas. O `INSERT INTO trade_events (... entry_decision_id, exit_decision_id, exit_reason_raw, branch_classification_raw ...)` passa a referenciar colunas inexistentes; o erro é engolido por `.catch()` e o evento é **descartado em silêncio**.
- **Consequência:** em qualquer banco recém-criado, o ledger de trades/decisões fica cego → `fn_evaluate_session_lockout()` (lockout diário -3.0R) e `fn_evaluate_safe_halt()` (drawdown 15%) deixam de funcionar. Produção provavelmente "auto-curou" por boots anteriores (tabelas já existentes); o risco é de reprodutibilidade/DR.
- **Correção:** reordenar para canônico primeiro e depois forense; mover os `ALTER/ADD COLUMN`/FKs/trigger para um bloco idempotente pós-canonical (`ADD COLUMN IF NOT EXISTS` sobre a tabela canônica); validar com `drop/create` + boot limpo.

### 🔴 P0-3 — `dashboardRoutes` sem autenticação e isento de rate limit
- **Arquivos:** `server/src/routes/dashboardRoutes.ts:10` (sem middleware); `server/src/index.ts:87-92` (`skip` de `/api/dashboard`)
- **Problema:** `/api/dashboard/*` é público e ainda é **explicitamente isento** do rate limiter global. Os handlers agregam métricas via `query(...)` sobre `decision_events`/Event Store.
- **Consequência:** vazamento de telemetria/governança + vetor de DoS (consultas agregadas ao PostgreSQL sem teto de requisições).
- **Correção:** `dashboardRouter.use(requireAuth)` (idealmente `requireAdmin`) e remover `/api/dashboard` da lista `skip` do rate limiter (ou aplicar um limiter próprio).

### 🟠 P1-1 — Fan-out REST serial no `updateTickers`
- **Arquivo/linha:** `marketDataManager.ts:316-368` (loop `320-364`, intervalo `203`)
- **Problema:** 11 símbolos consultados `fetchTicker`+`fetchTrades` **sequencialmente**, 10s de timeout cada → pior caso ~110s por ciclo agendado de 2s; `isUpdatingTickers` descarta o restante. É o principal gatilho de rate-limit e de atraso de preço.
- **Correção:** `Promise.allSettled` sobre os símbolos + `Promise.race` com timeout por símbolo.

### 🟠 P1-2 — Sem detecção/backoff de 429 (DDoSProtection / TooManyRequests)
- **Arquivo/linha:** `marketDataManager.ts:361-363, 427-429, 443-445`; `bybitExecutionEngine.ts:833-852`
- **Problema:** `enableRateLimit` apenas limita, não **tenta novamente**. Qualquer rajada pode gerar ban temporário da BingX/Bybit.
- **Correção:** detectar erros de rate limit, aplicar backoff exponencial + jitter respeitando `Retry-After`.

### 🟠 P1-3 — `loadMarkets()` a cada ordem
- **Arquivo/linha:** `bybitExecutionEngine.ts:523`
- **Problema:** `await exchange.loadMarkets()` em toda `executeCopyTrade` (cliente novo por chamada) adiciona latência/IO por execução.
- **Correção:** cache de mercados por `(clientId, env)`.

### 🟠 P1-4 — Persistência awaited no caminho crítico (viola fire-and-forget)
- **Arquivos/linhas:** `bybitExecutionEngine.ts:751, 760-765, 770`; `paperStorage.ts:419-437, 578-596`; `index.ts:175, 199, 460, 471`
- **Problema:** `persistMasterBalance`/`upsertMasterOrder`/`persistMirrorBalance`/`TradeHistoryDB.insert` são `await` inline. Contrasta com a regra do `AGENTS.md` ("persistência secundária sempre fire-and-forget").
- **Correção:** disparar `.catch()` sem `await` (manter apenas o ledger autoritativo transacional).

### 🟠 P1-5 — Reconcile FIXED_3R pode deixar posição REAL nua
- **Arquivo/linha:** `bybitExecutionEngine.ts:741, 758-775`
- **Problema:** a ordem real é enviada (`:741`) e gravada no DB (`:751`) **antes** de `reconcileFixed3rEntry`; se a reconciliação lança, marca `UNCONFIRMED` e relança, mas **não cancela/fecha** a posição real → posição aberta sem stop reportada como falha.
- **Correção:** em falha de reconcile, tentar cancelar + close reduce-only / stop de segurança antes de relançar.

### 🟠 P1-6 — Lost-update (race) na persistência de saldo
- **Arquivo/linha:** `paperStorage.ts:419-437` (`persistMasterBalance`), `:578-596` (`persistMirrorBalance`)
- **Problema:** `UPDATE ... SET balance = $1, equity = $2, ...` com valores absolutos em memória — sem `SELECT ... FOR UPDATE`, sem `balance = balance + delta`.
- **Correção:** persistir deltas atômicos (`balance = balance + $1`) ou lock otimista/`FOR UPDATE` na linha singleton.

### 🟠 P1-7 — Operações multi-statement sem transação (autocommit)
- **Arquivos/linhas:** `db.ts:492-503` (`deleteClient`), `:96-101`; `paperStorage.ts:336-356` (`resetTradingAccounts`); `eventStoreService.ts:335-385` (`resetOperationalSession`)
- **Problema:** cada statement é autocommit; `query()` pega conexão nova por chamada, impossibilitando `BEGIN/COMMIT` entre statements → estado parcial em falha.
- **Correção:** helper transacional (`BEGIN/COMMIT/ROLLBACK` num único `pool.connect()` com `release()` em `finally`).

### 🟠 P1-8 — Pool sem timeout de statement e `max` default (10)
- **Arquivo/linha:** `db.ts:10-18`
- **Problema:** sem `statement_timeout`/`query_timeout`; `connectionTimeoutMillis: 10000`; `max` não definido (default 10).
- **Correção:** `statement_timeout` (~5000ms) + `query_timeout`; dimensionar `max`; reduzir `connectionTimeoutMillis` em caminhos quentes. (`pool.on('error')` já presente — positivo.)

### 🟠 P1-9 — Cap de potência (2.0x) da governança é ignorado no sizing
- **Arquivos/linhas:** `marketGovernanceService.ts:217, 235` vs `paperTradingEngine.ts:283, 293`
- **Problema:** a governança clampa `powerMultiplier` em `[0.5, 2.0]`, mas `handleSignal` calcula notional a partir de `pairConfig.powerMultiplier` (até 5.0x) → `notional = 0.667 × balance` por trade, contornando o teto de risco.
- **Correção:** aplicar `marketProposal.powerMultiplier` no sizing e adicionar guarda de exposição agregada.

### 🟠 P1-10 — Bug de tipagem `'CHOPPY'` → time-stop morto para `CHOPPY_RANGING`
- **Arquivo/linha:** `paperTradingEngine.ts:472` (tipo em `shared/types.ts:171-184`)
- **Problema:** `trade.marketRegime === 'CHOPPY'` compara com literal **ausente** da union (`'CHOPPY_RANGING'` é o valor real). Gera `TS2367` no `tsc --noEmit`; em runtime (transpile-only) a cláusula é sempre `false`, então o time-stop de 12h **nunca** dispara para posições `CHOPPY_RANGING` (capital preso em lateral).
- **Correção:** `'CHOPPY_RANGING'` (idealmente um `Set<MarketRegime>` compartilhado).

### 🟠 P1-11 — Criptografia AES-256-CBC sem autenticação + OTP de reset brute-forceável
- **Arquivos/linhas:** `crypto.ts:3, 20-26, 31-39`; `authRoutes.ts:210-304`
- **Problema:** AES-CBC é **maleável** (sem GCM/HMAC) para as API keys Bybit dos clientes; a chave mestra é só `sha256(MASTER_ENCRYPTION_KEY)` (sem KDF). O reset de senha usa OTP de 6 dígitos gerado com `Math.random()` (`:232`), **sem rate limit** em `/forgot-password` e `/reset-password-otp`, e o fallback `OtpDB.findByCode` (`:283-285`) valida o código **sem** vínculo ao identifier → brute-force de 900k combinações viável.
- **Correção:** migrar para AES-256-**GCM** (ou CBC+HMAC) e `scrypt/PBKDF2` na chave; usar `crypto.randomInt` no OTP; aplicar rate limit + vínculo obrigatório identifier↔OTP + tentativas máximas.

### 🟠 P1-12 — Exposição de dados do Master (REST público + WebSocket)
- **Arquivos/linhas:** `index.ts:1450-1475` (`/api/assets/:symbol/state` sem auth retorna `paperAccount` em `:1471`); `index.ts:1550-1579` (guest WebSocket recebe `initial_state` com `paperAccount`/`mirrorAccount`); `index.ts:142` (`broadcast` = `io.emit` para todos)
- **Problema:** saldo/posições/histórico do Master Quant vazam sem autenticação (REST público) e para qualquer socket convidado.
- **Correção:** remover `paperAccount` do endpoint público; emitir dados sensíveis apenas em salas (`admin_room`/`client_*`) e autenticar/rejeitar sockets sem token válido.

---

## 3. Plano de Otimização do Event Loop & Memória

### 3.1 `updateTickers` — eliminar fan-out serial (maior fonte de atraso)
**Atual (`marketDataManager.ts:316-368`):** loop `for ... await fetchTicker(); await fetchTrades();` sequencial com timeout de 10s por símbolo.
**Proposta:**
```ts
await Promise.allSettled(symbols.map(async (symbol) => {
  await Promise.race([
    (async () => { const t = await exchange.fetchTicker(symbol); await this.processTrades(...); })(),
    new Promise((_, rej) => setTimeout(() => rej(new Error('ticker_timeout')), 3_000))
  ]);
}));
```
**Ganho:** pior caso ~110s → ~3s; elimina descarte por `isUpdatingTickers`.

### 3.2 `trackLiquiditySweep` / bloco de absorção — remover `slice/filter/map/reduce` por tick
**Atual (`flowEngine.ts:192-200`):** `trades.slice(0,-1).filter(...)` + 2× `map` + `Math.min/max` por trade (alocações transitórias em caminho quente).
**Proposta:** agregação em um único passe com acumuladores incrementais (min/max/janela), sem `slice` nem `filter`.
**Ganho:** reduz GC churn em caminho chamado por WS e REST a cada trade.

### 3.3 `streamOrderBook` — coalescer/limitar broadcast
**Atual (`marketDataManager.ts:248-268`):** realoca `bids/asks/book` e rebroadcasta em **todo** tick WS, sem throttle.
**Proposta:** manter `latestBook` e emitir no trailing edge (ex.: no máximo 1 broadcast a cada 200–300ms), descartando intermediários.
**Ganho:** menos alocação + menos tráfego Socket.IO; preço/candle continuam em cadência própria.

### 3.4 `getKlines` — limpar timer do `Promise.race`
**Atual (`marketDataManager.ts:457-460`):** timer do `Promise.race` nunca é `clearTimeout` → vazamento de timers e fetch órfão.
**Proposta:** `clearTimeout` em `finally` ao resolver/rejeitar.
**Ganho:** evita acúmulo de timers e requisições órfãs.

### 3.5 Monte Carlo — bootstrap com reposição + PRNG semeado
**Atual (`quantStrategyEngine.ts:616-651, :626`):** shuffle sem reposição → soma invariante → `finalEquities`/`medianFinalEquity` degenerados; `Math.random()` não-determinístico.
**Proposta:** reamostragem **com reposição** (bootstrap) e PRNG semeado (ex.: mulberry32), mantendo drawdown percentis/ruin como estresse de ordem.
**Ganho:** distribuição real de capital final + resultados reproduzíveis.

### 3.6 Persistência secundária fire-and-forget (alinhado ao `AGENTS.md`)
- `index.ts:175,199,460,471` e `bybitExecutionEngine.ts:751,760-765,770`: converter `await persist*(...)` em `void persist*(...).catch(log)`.
- **Ganho:** remove IO de banco do caminho de decisão/fechamento, preservando sub-25ms.

---

## 4. Plano de Modularização Cirúrgica do `server/src/index.ts` (1.697 linhas)

Objetivo: decompor em camadas de responsabilidade única **sem** alterar nenhum contrato de rede/rota/evento.

| Novo módulo | Responsabilidade | Origem (index.ts) |
|---|---|---|
| `server/src/app.ts` | Express: helmet, CORS, `express.json`, rate limiters, `express.static`, fallback SPA | `:41-139` |
| `server/src/ws/gateway.ts` | Socket.IO: auth, salas, `broadcast`, handler de `connection` | `:141-144, :1549-1587` |
| `server/src/routes/terminalRoutes.ts` | `/api/paper-trading*`, `/api/trading/*`, `/api/pair-performance`, `/api/pairs/:symbol/toggle`, `/api/autonomous-pairs*` | `:966-1014, :1114-1124, :1237-1340` |
| `server/src/routes/telemetryRoutes.ts` | `/api/assets*`, `/api/signals`, `/api/health`, `/api/macro-regime`, `/api/audit-logs`, `/api/shadow-opportunities` | `:957-963, :1127-1167, :1378-1418, :1450-1547` |
| `server/src/routes/operatorRoutes.ts` | `/api/clients`, `/api/client-protection*`, `/api/ai-advisor/*`, `/api/strategy/health-report` | `:1119-1124, :1230-1235, :1342-1448` |
| `server/src/services/tradePipeline.ts` | callback do Master (persistência + Google Sheets + shadow + mirror replication) | `:162-445` |
| `server/src/services/signalDispatcher.ts` | handler de `FlowSignal` (parse de side, governança, sizing, dispatch) | `:482-803` |
| `server/src/services/positionGovernanceLoop.ts` | governança de posição por tick | `:805-923` |
| `server/src/bootstrap.ts` | `initDatabase → hydrate → marketManager.initialize → server.listen(4000)` | `:1589-1697` |

**Regras de preservação de contrato (obrigatórias):**
1. Porta permanece `Number(process.env.PORT) || 4000`; **corrigir** o `Dockerfile` para `ENV PORT=4000`/`EXPOSE 4000` (hoje está `8000`, violando o `AGENTS.md`).
2. Paths de rota e payloads do lightweight-charts e do React 19 permanecem idênticos.
3. Nomes de eventos Socket.IO (`flow_signal`, `paper_account_update`, `mirror_account_update`, `simulated_trade_event`, `shadow_audit_event`, `initial_state`, …) permanecem idênticos.
4. Cada passo deve ser um diff cirúrgico (<40 linhas por arquivo), validado com `tsc --noEmit` + `npm run build:web` a cada etapa.

---

## 5. Tabela de Ações Prioritárias

| Prio | Arquivo | Melhoria | Ganho esperado |
|---|---|---|---|
| **P0** | `server/src/index.ts` (rotas inline) | Trocar `requireAuth`→`requireAdmin` nos endpoints de operador | Elimina takeover: reset/balance/close de ordens reais por qualquer cliente |
| **P0** | `server/src/database/eventStoreDb.ts` | Reordenar/refatorar migrações (canônico antes, forense idempotente depois) | Restaura persistência do Event Store em deploy limpo (lockout/SAFE_HALT) |
| **P0** | `server/src/routes/dashboardRoutes.ts` + `index.ts:87` | Adicionar auth e remover isenção de rate limit em `/api/dashboard` | Fecha vazamento de telemetria e vetor de DoS |
| **P0** | `server/src/index.ts:1450/1550` | Não expor `paperAccount` em rota pública nem a guests do Socket.IO | Impede vazamento do saldo/posições do Master |
| **P1** | `server/src/utils/crypto.ts` | AES-256-GCM (ou CBC+HMAC) + KDF na chave mestra | Protege API keys contra tampering |
| **P1** | `server/src/auth/authRoutes.ts` | Rate limit + vínculo identifier↔OTP + `crypto.randomInt` no reset | Bloqueia brute-force de OTP (account takeover) |
| **P1** | `server/src/engine/marketDataManager.ts:316-368` | `Promise.allSettled` + `Promise.race` no `updateTickers` | Pior caso ~110s → ~3s; menos rate-limit |
| **P1** | `marketDataManager.ts` / `bybitExecutionEngine.ts:833` | Backoff exponencial + jitter para 429 | Evita ban temporário da exchange |
| **P1** | `bybitExecutionEngine.ts:523` | Cache de `loadMarkets` por cliente/env | Remove IO por execução |
| **P1** | `bybitExecutionEngine.ts:751/758-775` | Cancelar/fechar em falha de reconcile FIXED_3R | Elimina posição real nua |
| **P1** | `paperStorage.ts:419/578` | Persistência de saldo por delta ou `FOR UPDATE` | Elimina lost-update de saldo/equity |
| **P1** | `db.ts:492` / `paperStorage.ts:336` / `eventStoreService.ts:335` | Transações em operações multi-statement | Evita estado parcial em falha |
| **P1** | `db.ts:10-18` | `statement_timeout`/`query_timeout` + `max` dimensionado | Evita conexões retidas e outage |
| **P1** | `paperTradingEngine.ts:283` vs `marketGovernanceService.ts:235` | Aplicar cap 2.0x no sizing + exposição agregada | Respeita teto de risco da governança |
| **P1** | `paperTradingEngine.ts:472` | Corrigir `'CHOPPY'` → `'CHOPPY_RANGING'` | Reativa time-stop de 12h (libera capital) |
| **P2** | `flowEngine.ts:192` / `marketDataManager.ts:248` | Agregação single-pass + throttle de book | Menos GC/latência no caminho quente |
| **P2** | `quantStrategyEngine.ts:616` | Bootstrap com reposição + PRNG semeado | Monte Carlo real + determinístico |
| **P2** | `shadowAuditor.ts:42/315` | Vincular desfecho por id (não por símbolo) | Evita GREEN/RED atribuído à decisão errada |
| **P2** | `shadowAuditor.ts:133` / `riskConfig.ts:8` | Mover trava de correlação USD para a governança determinística | Correlação direcional passa a bloquear, não só observar |
| **P2** | `db.ts:13-17` | `rejectUnauthorized:true` para DB externo | Remove MITM em conexão externa |
| **P2** | `db.ts:569/584`, `db.ts:485` | Índices `client_configs(user_id)`, `app_users(client_id)` + restaurar FK | Elimina seq-scan em lookups |
| **P2** | `quantStrategyEngine.ts:191-203` | Remover Sharpe/Calmar/consistency fabricados | Métricas honestas |
| **P2** | `web/src/main.tsx` | `React.lazy` + code-split por rota | Bundle 801 kB → chunks sob demanda |
| **P3** | `Dockerfile` / `.env` | Alinhar `PORT=4000`/`EXPOSE 4000`; remover `LAYA_*` legado | Consistência com `AGENTS.md` |
| **P3** | `services/googleSheetsService.ts` | Remover stub morto (webhook desativado) e URL hardcoded | Reduz dead code |
| **P3** | `marketDataManager.ts:457` | `clearTimeout` no `Promise.race` | Elimina vazamento de timer |
| **P3** | raiz do repo | Limpar cruft (`{console.error(err.message)`, 5× `google_sheets_apps_script*.js`, `idx*.json`, `post.json`, logs) | Higiene de versionamento |

---

## 6. Verificação de Build e Tipagem (evidências)

- **`tsc --noEmit` (TypeScript 5.9.3):** **1 erro** — `paperTradingEngine.ts(472,74): TS2367` (comparação `'CHOPPY'` sem overlap com a union `MarketRegime`). Ver §P1-10.
- **`npm run build:web` (Vite 6.4.3):** **sucesso** (`__BUILD_EXIT__=0`, 20.8s). Alertas:
  - Chunk principal **801.24 kB** (gzip 218.89 kB) — acima de 500 kB, sem code-split.
  - `react-router` empacotado a partir do build **development** (`"use client"` ignorado) — investigar condição de export para usar o build de produção.

## 7. Telemetria Railway (resumo)

- `railway whoami` → Janio Jandson; projeto **Nexus-Multi** (`627374bf-…`), ambiente **production**.
- Serviço `Mercado Financeiro` **Online**, região EU West, deploy `fddb9b35` (SUCCESS, 2026-10-08). Sem crash-loop nos últimos logs amostrados; `restartPolicyType=ON_FAILURE` (5 retries) em `railway.json`.
- Histórico de deploys mostra rajada de ~15 deploys em 2026-10-02 (todos `REMOVED`) — atividade intensa de correção, sem evidência de restarts anômalos desde então.
- `/api/health` → **HTTP 200** `{"status":"ok", ...}`.
- Logs recentes dominados por fluxo/governança (`[IndexFlow][DROP][...]`, `[Flow] sinal emitido`); **não** foram encontrados `connection pool exhausted`, timeouts Bybit/BingX ou `UnhandledPromiseRejection` na janela amostrada.

## 8. Segredos & Governança de `.env`

- `.env` **corretamente ignorado** (`.gitignore:3`) e **não rastreado** no repositório público. `.env.example` contém apenas placeholders.
- Varredura de arquivos rastreados por padrões de segredo: **nenhum segredo real hardcoded** (ocorrências são nomes de campos/placeholders). `reset_admin.mjs` usa `process.env.DATABASE_URL` (correto).
- `.env` ainda carrega chaves legadas `LAYA_*`, `CEREBRO_URL`, `NEXUS_*`, `COMUNICACAO_*` (alguns sem consumidor no runtime pós-expurgo) — candidatas a limpeza.

---

*Relatório gerado em modo auditoria estrita. Nenhum arquivo de produção foi modificado; nenhuma alteração commitada na `main`.*
