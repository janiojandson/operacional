async function checkFullData() {
  const loginRes = await fetch('https://operacional-production-57d9.up.railway.app/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'janiojandson@gmail.com', password: '@@Jj123123' })
  });
  const { token } = await loginRes.json();

  const stateRes = await fetch('https://operacional-production-57d9.up.railway.app/api/assets/BTC%2FUSDT/state', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const state = await stateRes.json();
  console.log('--- BTC/USDT STATE ---');
  console.log('Last price:', state.lastPrice);
  console.log('Book source:', state.book?.source, 'bids count:', state.book?.bids?.length, 'asks count:', state.book?.asks?.length);
  console.log('Top bid price:', state.book?.bids?.[0]?.price, 'Top ask price:', state.book?.asks?.[0]?.price);
  console.log('Tape trades count:', state.trades?.length);
  if (state.trades?.length > 0) {
    console.log('Latest trade:', state.trades[0]);
  }
}

checkFullData();
