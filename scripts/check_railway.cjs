const https = require('https');

async function checkRailway() {
  const url = 'https://operacional-production-57d9.up.railway.app/api/assets/BTC%2FUSDT/klines?tf=1m';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    console.log('Railway response status:', res.status, 'data source:', data.source, 'candles count:', data.candles?.length);
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}

checkRailway();
