const ccxt = require('ccxt');

async function testDomains() {
  const domains = [
    'https://fapi.binance.com',
    'https://dapi.binance.com',
    'https://api.binance.com'
  ];

  for (const url of domains) {
    try {
      const res = await fetch(url + '/api/v3/ping', { signal: AbortSignal.timeout(3000) });
      console.log(url, 'status:', res.status);
    } catch (e) {
      console.log(url, 'FAILED:', e.message);
    }
  }

  // Test spot vs futures
  const spotEx = new ccxt.binance({ enableRateLimit: true, timeout: 5000 });
  try {
    const t = await spotEx.fetchTicker('BTC/USDT');
    console.log('SPOT BINANCE SUCCESS:', t.last);
  } catch (e) {
    console.log('SPOT BINANCE FAILED:', e.message);
  }
}

testDomains();
