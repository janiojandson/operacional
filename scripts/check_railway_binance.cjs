async function testRailwayBinance() {
  const loginRes = await fetch('https://operacional-production-57d9.up.railway.app/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'janiojandson@gmail.com', password: '@@Jj123123' })
  });
  const { token } = await loginRes.json();
  console.log('Logged in on Railway');

  // Let's test if Railway backend can reach Binance Futures endpoint or if Railway itself can execute it
  // Since we don't have an eval endpoint, let's see if Railway has railway CLI linked
}
testRailwayBinance();
