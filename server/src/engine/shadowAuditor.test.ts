import assert from 'node:assert/strict';
import { clearShadowOpportunities, getShadowOpportunities, normalizeShadowPnlPct, recordShadowOpportunity } from './shadowAuditor.js';

assert.equal(normalizeShadowPnlPct(0), 0, 'breakeven remains 0%, never a synthetic target');
assert.equal(normalizeShadowPnlPct(2.5), 2.5);
assert.equal(normalizeShadowPnlPct(Number.NaN), null);

clearShadowOpportunities();
recordShadowOpportunity({ symbol: 'BTC/USDT', side: 'BUY', mode: 'AUDIT', approved: false, reasons: ['SPREAD_EXCESSIVO'], source: 'BYBIT' });
const opportunities = getShadowOpportunities();
assert.equal(opportunities.length, 1);
assert.equal(opportunities[0].approved, false);
assert.equal(opportunities[0].mode, 'AUDIT');
assert.equal(opportunities[0].reasons[0], 'SPREAD_EXCESSIVO');
console.log('shadowAuditor: PASS');
