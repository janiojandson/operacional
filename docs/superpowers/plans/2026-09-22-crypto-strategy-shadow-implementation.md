# Crypto Strategy Shadow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make crypto entries profile-driven and auditable while exposing Shadow decisions, master-copy eligibility, data quality and correct seven-block reporting.

**Architecture:** A pure strategy-decision module receives fresh market context and a per-symbol profile, returning a typed decision. The existing engines consume that decision without changing public route contracts. Shadow persists the decision ledger and either observes or blocks according to the configured mode; dashboard and Sheets consume the same event payloads.

**Tech Stack:** TypeScript, Express, Socket.IO, React, PostgreSQL, CCXT/Bybit, Google Apps Script.

**Spec:** `docs/superpowers/specs/2026-09-22-crypto-strategy-shadow-design.md`

## Global Constraints

- Keep port 4000, existing API route signatures and chart schemas.
- Do not add packages.
- Use `/safe-dev [DIAGNÓSTICO]`, `[EXECUÇÃO CIRÚRGICA]`, and `[VERIFICAÇÃO DE REGRESSÃO]` in implementation notes.
- Default to paper trading and Shadow `AUDIT`; no AI action may place an order.
- Do not serialize credentials or fabricate financial outcomes.

---

### Task 1: Freeze the strategy contract and profiles

**Files:**
- Create: `server/src/engine/cryptoStrategyProfile.ts`
- Create: `server/src/engine/cryptoStrategyDecision.ts`
- Test: `server/src/engine/cryptoStrategyDecision.test.ts`

**Interfaces:**
- Produces `evaluateCryptoOpportunity(input): StrategyDecision`.
- `StrategyDecision` contains `approved`, `score`, `reasons`, `profileVersion`, `entrySide`, `stopLoss`, `takeProfit`, and `trailingTrigger`.

- [ ] Write tests for BTC/ETH/SOL profiles, valid 2.5R TP, stale data rejection, excessive spread rejection, cooldown rejection and allowed valid confluence.
- [ ] Run `npx tsx server/src/engine/cryptoStrategyDecision.test.ts` and verify the test fails before implementation.
- [ ] Implement immutable per-symbol profile data and pure decision evaluation; use only finite values and return rejection reasons rather than placing orders.
- [ ] Run the test again and verify PASS.
- [ ] Commit the contract and test.

### Task 2: Feed decision data into the master engine

**Files:**
- Modify: `server/src/engine/flowEngine.ts`
- Modify: `server/src/engine/paperTradingEngine.ts`
- Modify: `shared/paperTypes.ts`
- Test: `server/src/engine/paperTradingEngine.test.ts`

**Interfaces:**
- Consumes `StrategyDecision` from Task 1.
- Adds optional, backwards-compatible trade fields `strategyVersion`, `closeReason`, `realizedR`, `decisionFactors`.

- [ ] Create failing tests proving an isolated raw signal cannot open a trade, a valid decision can, `0R` remains zero, and fixed TP versus trailing have distinct reasons.
- [ ] Run the engine test and observe the expected failure.
- [ ] Replace duplicated inline risk profiles with the profile contract; preserve existing symbols, WorkUnits/configuration and trade route payloads.
- [ ] Use nullish/finite checks for realized R, calculate net PnL once, and set `FIXED_TP`, `TRAILING`, or `STOP_LOSS` on close.
- [ ] Run the engine and sizing tests; verify PASS.
- [ ] Commit the engine change and tests.

### Task 3: Make Shadow a durable audit/filter ledger

**Files:**
- Modify: `server/src/engine/shadowAuditor.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/database/db.ts`
- Modify: `server/src/services/googleSheetsService.ts`
- Test: `server/src/engine/shadowAuditor.test.ts`

**Interfaces:**
- Consumes `StrategyDecision`.
- Persists `mode: AUDIT | FILTER`, decision, reasons, source freshness and copy eligibility.

- [ ] Write tests for AUDIT allowing a rejected decision to be logged without blocking, FILTER blocking it, no synthetic PnL, and valid outcome association by trade id.
- [ ] Run the Shadow tests and verify failure before code.
- [ ] Add only additive database migration fields/tables; map the existing boolean control to `AUDIT`/`FILTER` without breaking current endpoints.
- [ ] Execute Shadow before master entry in both modes and emit a structured socket event; never infer an outcome from zero PnL.
- [ ] Run tests and verify PASS.
- [ ] Commit the ledger and tests.

### Task 4: Correct seven-block reporting and AI input

**Files:**
- Modify: `server/src/engine/quantStrategyEngine.ts`
- Modify: `server/src/engine/aiAdvisorEngine.ts`
- Test: `server/src/engine/quantStrategyEngine.test.ts`

**Interfaces:**
- Health reporting accepts the actual account initial balance and closed-trade history.
- AI consumes a sanitized report only.

- [ ] Add failing test fixtures containing a 500-dollar account, a 10,000-dollar account, `0R`, a trailing close, fees and an open trade.
- [ ] Assert only closed net trades are included, `0R` is retained, and each block uses the supplied initial balance.
- [ ] Implement finite/nullish R handling and remove hard-coded 10,000-dollar assumptions from calculations.
- [ ] Build a sanitized advisor summary without credentials or order capability.
- [ ] Run the focused tests and verify PASS.
- [ ] Commit the reporting changes and tests.

### Task 5: Render the audit trail and market-data quality

**Files:**
- Modify: `web/src/components/ShadowAuditModal.tsx`
- Modify: `web/src/pages/TradingTerminal.tsx`
- Modify: `web/src/components/Chart/ChartPro.tsx`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes structured Shadow events and candle source metadata.
- Displays decision state, reasons, data age/source, entry/SL/TP/trailing markers and mode.

- [ ] Add component-level deterministic fixtures for approved, blocked and unavailable-data Shadow records.
- [ ] Render `AUDIT`/`FILTER` distinctly; show filter reasons and do not display a fabricated outcome.
- [ ] Keep chart data display-only; add source and stale warning while preserving the existing lightweight-chart payload.
- [ ] Render trailing, TP and SL using the same trade identifier as the ledger.
- [ ] Run `npx tsc --noEmit` and `npm run build`; verify PASS.
- [ ] Commit the UI changes.

### Task 6: Extend Google Sheets without fabricating history

**Files:**
- Modify: `google_sheets_apps_script_v3.js`
- Modify: `server/src/services/googleSheetsService.ts`
- Test: `server/src/services/googleSheetsService.test.ts`

**Interfaces:**
- Adds additive payload fields for decision, data quality, R/close reason, Shadow record and copy eligibility.

- [ ] Write payload tests for master, mirror, blocked copy and Shadow event; assert zero is preserved and missing data stays blank/indisponível.
- [ ] Update Apps Script to create or refresh the six specified tabs without deleting existing trade history.
- [ ] Ensure historical incomplete rows are marked unavailable, never estimated.
- [ ] Validate syntax with `node --check google_sheets_apps_script_v3.js` and run the service test without posting externally.
- [ ] Commit the Sheets changes and tests.

### Task 7: Secure, verify and publish

**Files:**
- Modify: `.env.example`
- Modify: `.gitignore` only if a secret-containing test artifact must be excluded
- Modify: unsafe test fixtures only to remove credentials

- [ ] Inspect tracked files with `git grep` for credential patterns; remove exposed values and document rotation requirements without printing secrets.
- [ ] Run all local deterministic tests, `npx tsc --noEmit`, `npm run build`, `node --check google_sheets_apps_script_v3.js`, and `git diff --check`.
- [ ] Perform an explicit, controlled Apps Script test only after its deployment URL/configuration is confirmed; do not send an order.
- [ ] Review the final diff and commit only the reviewed files.
- [ ] Push to the configured GitHub remote only after all checks pass.
- [ ] Verify Railway deploy and perform the three human visual checks in `AGENTS.md`: timeframe continuity, signal markers, and 1-minute candle tick.

## Self-review

- Spec coverage: Tasks 1–2 cover per-pair strategy and correct R; Task 3 covers Shadow modes; Task 4 covers seven blocks/AI; Task 5 covers dashboard/chart; Task 6 covers Sheets; Task 7 covers security and deploy.
- Scope: Licitações is intentionally excluded and will receive a separate design and plan after this project is deployed.
- No new packages, route signatures, or chart payload schema changes are planned.
