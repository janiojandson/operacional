import { runShadowAudit } from './server/src/engine/shadowAuditor.js';
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

  console.log('\n--- LOG FILE VERIFICATION ---');
  if (fs.existsSync('audit_shadow_mode.log')) {
    console.log(fs.readFileSync('audit_shadow_mode.log', 'utf8'));
  }
}

test().catch(console.error);
