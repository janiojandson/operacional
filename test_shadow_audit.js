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

  console.log('--- TEST 1: Blocked by USD Exposure & Spread ---');
  await runShadowAudit(mockExchange, 'GBP/USD', 'SELL'); // 2R + 1R = 3R > 2R USD LONG + Spread 2.0 pips

  console.log('\n--- TEST 2: Permitted Trade ---');
  const mockExchangeGood = {
    fetchPositions: async () => [],
    fetchOrderBook: async (symbol, depth) => ({
      bids: [[1.0850, 10]],
      asks: [[1.0851, 10]] // Spread: 1.0 pip < 1.5 pips
    })
  };
  await runShadowAudit(mockExchangeGood, 'EUR/USD', 'BUY');

  console.log('\n--- TEST 3: Orderbook Empty Handled Gracefully ---');
  const mockExchangeEmpty = {
    fetchPositions: async () => [],
    fetchOrderBook: async () => ({ bids: [], asks: [] })
  };
  await runShadowAudit(mockExchangeEmpty, 'BTC/USDT', 'BUY');

  console.log('\n--- LOG FILE VERIFICATION ---');
  if (fs.existsSync('audit_shadow_mode.log')) {
    console.log(fs.readFileSync('audit_shadow_mode.log', 'utf8'));
  }
}

test().catch(console.error);
