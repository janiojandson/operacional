const ccxt = require('ccxt');

async function testCcxt() {
  const spot = new ccxt.binance({ enableRateLimit: true, timeout: 5000 });
  const klines = await spot.fetchOHLCV('BTC/USDT', '1m', undefined, 10);
  console.log('Spot klines length:', klines.length, 'sample:', klines[0]);
  const book = await spot.fetchOrderBook('BTC/USDT', 20);
  console.log('Spot book bids:', book.bids.length, 'asks:', book.asks.length, 'top bid:', book.bids[0]);
  const trades = await spot.fetchTrades('BTC/USDT', undefined, 10);
  console.log('Spot trades count:', trades.length, 'last trade:', trades[0]);
}

testCcxt();
