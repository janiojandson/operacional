async function fetchOpportunities() {
  const loginRes = await fetch('https://operacional-production-57d9.up.railway.app/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'janiojandson@gmail.com', password: '@@Jj123123' })
  });
  const { token } = await loginRes.json();

  const oppRes = await fetch('https://operacional-production-57d9.up.railway.app/api/shadow-opportunities', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await oppRes.json();
  console.log('Opportunities count:', data.opportunities?.length);
  if (data.opportunities?.length > 0) {
    console.log('Latest 3 opportunities:');
    console.log(JSON.stringify(data.opportunities.slice(0, 3), null, 2));
  }
}

fetchOpportunities();
