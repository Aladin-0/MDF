const http = require('http');

async function testApi() {
  const loginRes = await fetch('http://localhost:8000/api/v1/token/', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({username: 'admin', password: 'password123'})
  });
  const tokens = await loginRes.json();
  
  const salesRes = await fetch('http://localhost:8000/api/v1/sales/?outletId=d5349da2-dc06-405e-a5ee-6370c5e75c91&limit=1', {
    headers: { 'Authorization': `Bearer ${tokens.access}` }
  });
  const sales = await salesRes.json();
  console.log("Response:", JSON.stringify(sales, null, 2));
}

testApi().catch(console.error);
