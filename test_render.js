const https = require('https');

const loginData = JSON.stringify({
  email: 'student@nitmz.ac.in',
  password: 'student123'
});

const req = https.request('https://nitmz-bus-tracker.onrender.com/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': loginData.length
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      if (data.token) {
        console.log('Got token, fetching /api/buses/live...');
        fetchBuses(data.token);
      } else {
        console.log('Login failed:', body);
      }
    } catch(e) {
      console.log('Failed to parse login response:', body);
    }
  });
});

req.on('error', e => console.error('Login error:', e));
req.write(loginData);
req.end();

function fetchBuses(token) {
  const req2 = https.request('https://nitmz-bus-tracker.onrender.com/api/buses/live', {
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + token
    }
  }, (res) => {
    console.log('Status Code:', res.statusCode);
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('Response Body:', body);
    });
  });
  req2.on('error', e => console.error('Buses error:', e));
  req2.end();
}
