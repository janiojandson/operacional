# Adaptive Risk and Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calculate per-asset adaptive risk and update the Sheets dashboard incrementally.

**Architecture:** A pure risk calculator consumes a strategy profile and Bybit candle range. The paper engine consumes its approved plan; Sheets persists events immediately while throttling dashboard recomputation.

**Tech Stack:** TypeScript, React, Google Apps Script.

**Spec:** `docs/superpowers/specs/2026-09-22-adaptive-risk-dashboard-design.md`

## Global Constraints

- No new dependencies, no order placement, no existing API signature changes.
- Keep 2.5R as gross structural target and record net R separately.
- Fallback/local market data cannot authorize a trade.

### Task 1: Pure adaptive-risk calculator

**Files:** Create `server/src/engine/adaptiveRisk.ts`; create `server/src/engine/adaptiveRisk.test.ts`; modify `server/src/engine/cryptoStrategyProfile.ts`.

- [x] Write failing tests for ATR calculation, fixed 2.5R target, risk cap reducing notional, invalid data rejection and aggregate cap rejection.
- [x] Run `npx tsx server/src/engine/adaptiveRisk.test.ts` and verify failure.
- [x] Implement `calculateAdaptiveRisk(input)` returning stop, target, notional, gross/net R and rejection reasons.
- [x] Run the focused test and `npx tsc --noEmit`; verify PASS.

### Task 2: Connect the paper master and chart metadata

**Files:** Modify `server/src/index.ts`, `server/src/engine/paperTradingEngine.ts`, `shared/paperTypes.ts`, `web/src/components/Chart/ChartPro.tsx`.

- [x] Write failing engine test proving a capped notional is used and a rejected aggregate risk opens no trade.
- [x] Pass only Bybit candle data and open-position risk into Task 1.
- [x] Persist gross/net R, risk USD and reason in the simulated trade; chart price lines already use the persisted stop/target/trailing prices.
- [x] Run all engine tests, TypeScript and build; verify PASS.

### Task 3: Incremental Sheets dashboard

**Files:** Modify `google_sheets_apps_script_v3.js`; test syntax with Node.

- [x] Add `scheduleDashboardRefresh()` using one pending ScriptApp trigger per 60-second window.
- [x] Replace per-webhook `updateDashboard()` with the scheduler.
- [x] Remove destructive `sheet.clear()` from dashboard update; charts are rebuilt only in the scheduled job.
- [x] Run `node --check google_sheets_apps_script_v3.js`; verify PASS.

### Task 4: Verification and publication

- [ ] Run every deterministic test, TypeScript, build, Apps Script syntax and `git diff --check`.
- [ ] Review risk values manually with BTC, ETH, SOL, BNB and XRP fixtures.
- [ ] Commit and push only after all checks pass; verify Railway HTTP response and manually verify the Sheets dashboard after Apps Script deployment.
