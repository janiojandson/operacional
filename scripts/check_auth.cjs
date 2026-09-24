async function checkAuth() {
  const loginRes = await fetch('https://operacional-production-57d9.up.railway.app/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'janiojandson@gmail.com', password: '@@Jj123123' })
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log('Login success:', !!token);

  if (token) {
    const klinesRes = await fetch('https://operacional-production-57d9.up.railway.app/api/assets/BTC%2FUSDT/klines?tf=1m', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const klines = await klinesRes.json();
    console.log('Klines source:', klines.source, 'candles count:', klines.candles?.length);
  }
}

checkAuth();
