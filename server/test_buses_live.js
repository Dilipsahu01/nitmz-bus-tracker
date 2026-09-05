const { query } = require('./src/db');
const crypto = require('crypto');

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI/180;
  const p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180;
  const dl = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function testQuery() {
  try {
    console.log('Running query...');
    const sql = `
      SELECT b.bus_number, b.status, b.latitude, b.longitude, b.speed, b.route, b.assigned_hostel, b.updated_at
      FROM buses b
      WHERE b.is_enabled = true
    `;
    const rows = await query(sql);
    const data = rows.map(r => {
      const dist = haversine(Number(r.latitude), Number(r.longitude), 23.7271, 92.7176);
      const speedMs = Number(r.speed) * (1000 / 3600);
      const eta = (speedMs > 0.5) ? Math.round(dist / speedMs) : null;

      return {
        busNumber: r.bus_number,
        status: r.status,
        lat: Number(r.latitude),
        lng: Number(r.longitude),
        speed: Number(r.speed),
        route: r.route,
        hostel: r.assigned_hostel,
        updatedAt: r.updated_at,
        etaSeconds: eta,
        hasFix: r.status !== 'maintenance',
        satellites: r.status === 'running' ? 8 : 0,
        hdop: 1.2,
        netType: 'API'
      };
    });
    console.log(data);
    process.exit(0);
  } catch(err) {
    console.error(err);
    process.exit(1);
  }
}
testQuery();
