// load_test.js
// High-Concurrency & Redis Stress Test Script for NITMZ Bus Tracker

const BASE_URL = 'http://localhost:3000';
const API_KEY = 'BUSTRACKESP1SECRETKEY';

const STUDENT_CREDENTIALS = {
  email: 'student@nitmz.ac.in',
  password: 'student123'
};

// Aizawl coordinates bounding box (North Durtlang / Bawngkawn / Chaltlang)
const LAT_MIN = 23.7200;
const LAT_MAX = 23.7500;
const LNG_MIN = 92.7100;
const LNG_MAX = 92.7300;

function randomCoord(min, max) {
  return +(min + Math.random() * (max - min)).toFixed(6);
}

async function getToken() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(STUDENT_CREDENTIALS)
  });
  const data = await res.json();
  if (!res.ok || !data.token) {
    throw new Error('Failed to obtain student token for load test.');
  }
  return data.token;
}

async function simulateBusPing(busId) {
  const payload = {
    bus_id: String(busId),
    latitude: randomCoord(LAT_MIN, LAT_MAX),
    longitude: randomCoord(LNG_MIN, LNG_MAX),
    speed_kmh: +(Math.random() * 40).toFixed(2),
    satellites: Math.floor(8 + Math.random() * 6),
    hdop: +(0.7 + Math.random() * 0.5).toFixed(2),
    has_fix: true,
    status: 'active',
    net_type: Math.random() > 0.5 ? 'GSM' : 'WIFI',
    timestamp: new Date().toISOString(),
    is_sos: false
  };

  const start = Date.now();
  const res = await fetch(`${BASE_URL}/api/update-location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify(payload)
  });
  return { type: 'ESP32_PING', ok: res.ok, status: res.status, latency: Date.now() - start };
}

async function simulateUserFetch(token, endpoint) {
  const start = Date.now();
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return { type: 'USER_READ', ok: res.ok, status: res.status, latency: Date.now() - start };
}

async function runLoadTest() {
  console.log("🔥 Initializing High-Concurrency Load Test against Redis Hot Path...");
  
  let token;
  try {
    token = await getToken();
    console.log("✅ Authenticated successfully. Starting traffic simulation...\n");
  } catch (err) {
    console.error("❌ Authentication failed:", err.message);
    return;
  }

  const durationSec = 10; // Run test for 10 seconds
  const busIds = [5, 6, 7, 8, 9, 10, 11, 12];
  const endpoints = ['/api/buses/live', '/api/buses', '/api/buses/5', '/api/hostels'];

  let activeRequests = [];
  let stats = {
    total: 0,
    success: 0,
    failed: 0,
    latencies: []
  };

  const startTime = Date.now();
  const endTime = startTime + (durationSec * 1000);

  // Continuously fire asynchronous requests until time expires
  while (Date.now() < endTime) {
    // Generate a batch of 10 concurrent requests (mix of IoT pings and student dashboard reads)
    const batch = [];
    for (let i = 0; i < 10; i++) {
      if (Math.random() > 0.4) {
        // 60% IoT traffic (simulating 8 buses pinging rapidly)
        const randomBus = busIds[Math.floor(Math.random() * busIds.length)];
        batch.push(simulateBusPing(randomBus));
      } else {
        // 40% User traffic (simulating students refreshing the live dashboard)
        const randomEndpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
        batch.push(simulateUserFetch(token, randomEndpoint));
      }
    }

    const results = await Promise.all(batch);
    for (const r of results) {
      stats.total++;
      if (r.ok) {
        stats.success++;
        stats.latencies.push(r.latency);
      } else {
        stats.failed++;
      }
    }

    // Brief yield to prevent CPU choking on the test script itself
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const avgLatency = stats.latencies.length > 0 
    ? (stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length).toFixed(2) 
    : 0;

  console.log("==========================================");
  console.log("📊 LOAD TEST RESULTS REPORT");
  console.log("==========================================");
  console.log(`⏱️ Duration:          ${durationSec} seconds`);
  console.log(`🚀 Total Requests:    ${stats.total}`);
  console.log(`✅ Successful:        ${stats.success} (${((stats.success / stats.total) * 100).toFixed(1)}%)`);
  console.log(`❌ Failed:            ${stats.failed}`);
  console.log(`⚡ Average Latency:   ${avgLatency} ms`);
  console.log("==========================================");
  if (stats.failed === 0) {
    console.log("🎉 Redis Hot Path & Backend Scalability Verified: ZERO DROPS OR FAILURES UNDER LOAD!");
  } else {
    console.log("⚠️ Some requests failed. Check server logs for connection pool exhaustion.");
  }
}

runLoadTest();
