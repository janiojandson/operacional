# Master Mirror and Sheets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make paper, copy execution, and Google Sheets evaluate the same proportional master exposure while truthfully reporting Bybit eligibility, fees, trailing, and shadow outcomes.

**Architecture:** Preserve the existing routes and strategy triggers. Introduce a pure sizing contract for a master exposure ratio, carry actual master notional/quantity through trade events, and make the Sheets payload auditable. The Google Apps Script records closed outcomes separately from eligibility-only events; its dashboard compares banks without fabricating trades.

**Tech Stack:** TypeScript, Node/Express, CCXT Bybit Linear, React/Vite, Google Apps Script.

**Spec:** User-approved master-proportional mirroring: `notional = current bank × master exposure ratio`; skip an entry if exchange lot, margin, or fee makes it infeasible.

## Global Constraints

- Do not change API route signatures or schemas.
- Preserve the existing strategy signal rules, B/W-equivalent controls, and `WorkUnits`-unrelated infrastructure.
- No new packages.
- Never synthesize a positive PnL or execution.
- Maintain separately gross PnL, fees, net PnL, margin, and execution eligibility.

---

### Task 1: Sizing contract and regression tests

**Files:**
- Create: `server/src/engine/masterMirrorSizing.ts`
- Create: `server/src/engine/masterMirrorSizing.test.ts`
- Modify: `server/src/engine/bybitExecutionEngine.ts`

- [ ] Write failing tests for an executable proportional position, insufficient minimum lot, insufficient margin, and fee-aware result.
- [ ] Implement a pure `calculateMasterMirrorSize` that rounds down to exchange step and returns `EXECUTABLE` or an explicit block reason.
- [ ] Route Bybit copy execution through the new contract only when master exposure is supplied.
- [ ] Run the focused test and `npx tsc --noEmit`.

### Task 2: Preserve master and mirror trade economics

**Files:**
- Modify: `shared/paperTypes.ts`
- Modify: `server/src/engine/paperTradingEngine.ts`
- Modify: `server/src/engine/clientCopyTraderEngine.ts`
- Test: `server/src/engine/masterMirrorSizing.test.ts`

- [ ] Add failing tests that prove master notional, quantity, and ratio are stable at entry.
- [ ] Persist entry notional and use it for closing fees.
- [ ] Make mirror sizing proportional to the recorded master exposure and avoid double-charging its opening fee.
- [ ] Run focused tests and type check.

### Task 3: Operational controls and source observability

**Files:**
- Modify: `server/src/index.ts`
- Modify: `server/src/routes/adminRoutes.ts`
- Modify: `server/src/engine/marketDataManager.ts`
- Modify: `web/src/components/Chart/ChartPro.tsx`
- Modify: `web/src/pages/TradingTerminal.tsx`

- [ ] Wire persisted trailing state into both paper engines and emit it with trade events.
- [ ] Record shadow decision/state in Sheets payload without claiming a blocked trade was executed.
- [ ] Return explicit Bybit/fallback candle source and render it on the chart.
- [ ] Type check and build.

### Task 4: Google Sheets audit dashboard

**Files:**
- Modify: `google_sheets_apps_script_v3.js`
- Modify: `server/src/index.ts`
- Modify: `server/src/services/googleSheetsService.ts`

- [ ] Stop using the `+2%` fallback and exclude open events from realized-bank curves.
- [ ] Add master trade ID, entry economics, power, leverage, trailing and shadow fields to the payload.
- [ ] Add per-bank eligibility, capital-minimum, fee, gross/net PnL, and skipped-trade fields.
- [ ] Update dashboard summaries/charts to distinguish executed, skipped, and shadow-blocked signals.
- [ ] Verify JavaScript syntax and run TypeScript/build checks.

### Task 5: Regression verification

**Files:**
- Modify: test files only if a regression exposes an untested contract.

- [ ] Run `npx tsx server/src/engine/masterMirrorSizing.test.ts`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run build`.
- [ ] Review `git diff --check` and the final changed-file list.
