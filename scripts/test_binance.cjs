const ccxt = require('ccxt');

async function test() {
  console.log('Testing Binance connection...');
  const ex = new ccxt.binance({
    options: { defaultType: 'future' },
    enableRateLimit: true,
    timeout: 10000
  });

  try {
    const ticker = await ex.fetchTicker('BTC/USDT');
    console.log('SUCCESS BTC/USDT price:', ticker.last);
  } catch (err) {
    console.error('Binance direct failed:', err.message);
  }
}

test();
