import { runShadowAudit, recordShadowOutcome } from './server/src/engine/shadowAuditor.js';
import fs from 'fs';

async function test() {
  const mockExchange = {
    fetchPositions: async () => [
      { symbol: 'EUR/USD', side: 'sell', contracts: 1 }, // USD LONG (1R)
      { symbol: 'USD/JPY', side: 'buy', contracts: 1 }   // USD LONG (1R)
    ],
    fetchOrderBook: async (symbol, depth) => ({
      bids: [[1.0850, 10]],
      asks: [[1.0852, 10]] // Spread: 2.0 pips > 1.5 pips
    })
  };

  console.log('--- TEST 1: Master Quant Shadow Audit (SOL/USDT BUY) ---');
  await runShadowAudit(
    null,
    'SOL/USDT',
    'BUY',
    1.0,
    [],
    {
      bids: [[194.50, 10]],
      asks: [[194.52, 10]]
    }
  );

  console.log('\n--- TEST 2: Master Quant Shadow Audit Anti-Correlation Block (3rd SELL on USDT) ---');
  await runShadowAudit(
    null,
    'ETH/USDT',
    'SELL',
    1.0,
    [
      { symbol: 'BTC/USDT', type: 'SELL' },
      { symbol: 'SOL/USDT', type: 'SELL' }
    ],
    {
      bids: [[2840.00, 5]],
      asks: [[2840.20, 5]]
    }
  );

  console.log('\n--- TEST 3: Desfecho Real do Trade 1 (SOL/USDT deu GREEN +2.5R) ---');
  recordShadowOutcome('SOL/USDT', 'CLOSED_TP', 75.00, 2.5);

  console.log('\n--- TEST 4: Desfecho Real do Trade 2 (ETH/USDT daria RED -1.0R mas foi BLOQUEADO) ---');
  recordShadowOutcome('ETH/USDT', 'CLOSED_SL', -30.00, -1.0);

  console.log('\n--- LOG FILE VERIFICATION (ÚLTIMAS LINHAS) ---');
  if (fs.existsSync('audit_shadow_mode.log')) {
    const lines = fs.readFileSync('audit_shadow_mode.log', 'utf8').trim().split('\n');
    console.log(lines.slice(-4).join('\n'));
  }
}

test().catch(console.error);
