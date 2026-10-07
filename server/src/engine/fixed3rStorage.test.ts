import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import pg from 'pg';
import { storedRiskSnapshot, upsertMasterOrder, upsertMirrorOrder } from '../database/paperStorage.js';

test('rehydration uses a stored snapshot instead of residual lot or mutated stop', () => {
  const row = { exit_policy:'FIXED_3R' as const, entry_price:100, stop_loss:100.15, qty:5, notional_usd:500,
    initial_stop_loss:99, initial_qty:10, initial_notional_usd:1000, initial_risk_usd:10 };
  const before = structuredClone(row);
  assert.deepEqual(storedRiskSnapshot(row),{exitPolicy:'FIXED_3R',initialStopLoss:99,initialQty:10,initialNotionalUsd:1000,initialRiskUsd:10});
  assert.deepEqual(row,before);
  assert.equal(storedRiskSnapshot({entry_price:100,stop_loss:99,qty:5,notional_usd:500,partial_taken:1}).exitPolicy,'LEGACY');
  assert.equal(storedRiskSnapshot({entry_price:100,stop_loss:99,qty:5,notional_usd:500,partial_taken:1}).initialRiskUsd,10);
  assert.throws(() => storedRiskSnapshot({exit_policy:'FIXED_3R',entry_price:100,stop_loss:99,qty:10}));
});

test('Master and Mirror upserts insert snapshot but never replace existing snapshot or policy', async () => {
  const queries: Array<{sql:string;params:any[]}> = [];
  const patch = mock.method(pg.Pool.prototype,'connect',async () => ({
    query:async (sql:string,params:any[]) => {queries.push({sql,params});return {rows:[]};}, release() {}
  }) as any);
  try {
    const trade = {id:'persist',entryPrice:100,qty:10,notionalUsd:1000,fee:1,netPnl:0,
      exitPolicy:'FIXED_3R',initialStopLoss:99,initialQty:10,initialNotionalUsd:1000,initialRiskUsd:10} as any;
    await upsertMasterOrder(trade);
    await upsertMirrorOrder(trade);
    for(const {sql,params} of queries) {
      assert.deepEqual(params.slice(-5),['FIXED_3R',99,10,1000,10]);
      const conflict = sql.split('ON CONFLICT')[1];
      assert(!/exit_policy\s*=/.test(conflict));
      assert(/initial_risk_usd\s*=\s*COALESCE\(paper_(master|mirror)_orders.initial_risk_usd, EXCLUDED.initial_risk_usd\)/.test(conflict));
    }
  } finally { patch.mock.restore(); }
});
