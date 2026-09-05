const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { requireAuth, requireApiKey } = require('../middleware/auth');
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

/**
 * Normalize an incoming telemetry payload.
 *
 * The ESP32 firmware sends:
 *   { has_fix, latitude, longitude, speed_kmh, satellites, hdop, timestamp, status, net_type }
 *
 * The Flutter app webhook / simulator sends:
 *   { device_id, bus_id, lat, lng, speed, accuracy, ts, status }
 *
 * This function merges both shapes into a unified internal format.
 */
function normalizeTelemetry(body) {
  return {
    device_id: body.device_id || null,
    bus_id:    body.bus_id || null,
    lat:       body.lat ?? body.latitude,
    lng:       body.lng ?? body.longitude,
    speed:     body.speed ?? body.speed_kmh ?? 0,
    accuracy:  body.accuracy ?? body.hdop ?? 1.0,
    has_fix:   body.has_fix ?? (body.status === 'active') ?? null,
    satellites: body.satellites ?? 0,
    hdop:      body.hdop ?? body.accuracy ?? 99.9,
    net_type:  body.net_type || 'unknown',
    ts:        body.ts ?? body.timestamp ?? null,
    status:    body.status || 'idle',
    is_sos:    body.is_sos === true || body.is_sos === 'true'
  };
}

// ─── POST /api/update-location ──────────────────────────────────
// Secure ESP32 / simulator telemetry ingestion (x-api-key required)
// Accepts BOTH ESP32 native format and app webhook format
router.post('/api/update-location', requireApiKey(), async (req, res) => {
  try {
    const d = normalizeTelemetry(req.body);
    if (d.lat === undefined || d.lng === undefined) {
      return res.status(400).json({ status: 'error', message: 'lat/latitude and lng/longitude are required' });
    }

    // Insert full telemetry row with diagnostics
    await query(
      `INSERT INTO telemetry (device_id, bus_id, lat, lng, speed, accuracy, has_fix, satellites, hdop, net_type, ts, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [d.device_id, d.bus_id, d.lat, d.lng, d.speed, d.accuracy, d.has_fix, d.satellites, d.hdop, d.net_type, d.ts, d.status]
    );

    // Update live bus position and updated_at
    const parsedBusNumber = Number(String(d.bus_id || '').replace(/[^0-9]/g, ''));
    if (parsedBusNumber) {
      await query(
        `UPDATE buses SET latitude = $1, longitude = $2, speed = $3, status = COALESCE($4, status), updated_at = NOW() WHERE bus_number = $5`,
        [d.lat, d.lng, d.speed, d.status === 'active' ? 'running' : d.status, parsedBusNumber]
      );

      // Feature: SOS Alert
      if (d.is_sos) {
        const nId = 'n_' + crypto.randomBytes(6).toString('hex');
        await query(
          `INSERT INTO notifications (id, title, message, type, bus_number, sent_by) VALUES ($1, $2, $3, $4, $5, $6)`, 
          [nId, 'SOS ALERT', `Emergency SOS triggered on Bus ${parsedBusNumber}!`, 'alert', parsedBusNumber, 'system']
        );
      }

      // Feature: Route Deviation / Geofence
      const distFromCampus = haversine(d.lat, d.lng, 23.7271, 92.7176);
      if (distFromCampus > 4000) { // 4km boundary
        const recent = await query(
          `SELECT id FROM notifications WHERE type = 'warning' AND bus_number = $1 AND sent_at > NOW() - INTERVAL '15 minutes'`, 
          [parsedBusNumber]
        );
        if (recent.length === 0) {
          const nId = 'n_' + crypto.randomBytes(6).toString('hex');
          await query(
            `INSERT INTO notifications (id, title, message, type, bus_number, sent_by) VALUES ($1, $2, $3, $4, $5, $6)`, 
            [nId, 'Geofence Alert', `Bus ${parsedBusNumber} has left the 4km campus boundary.`, 'warning', parsedBusNumber, 'system']
          );
        }
      }
    }

    res.json({ message: 'Data received successfully', status: 'success' });
  } catch (err) {
    console.error('[telemetry] POST /api/update-location error:', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

// ─── POST /endpoint ─────────────────────────────────────────────
// Legacy ESP32 firmware endpoint (x-api-key required)
// The actual ESP32 .ino firmware POSTs to /endpoint
router.post('/endpoint', requireApiKey(), async (req, res) => {
  try {
    const d = normalizeTelemetry(req.body);
    if (d.lat === undefined || d.lng === undefined) {
      return res.status(400).json({ status: 'error' });
    }

    await query(
      `INSERT INTO telemetry (device_id, bus_id, lat, lng, speed, accuracy, has_fix, satellites, hdop, net_type, ts, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [d.device_id || 'ESP32-Device-1', d.bus_id, d.lat, d.lng, d.speed, d.accuracy, d.has_fix, d.satellites, d.hdop, d.net_type, d.ts, d.status]
    );

    // Update bus 5 by default (the ESP32 is mounted on bus 5)
    const busNum = Number(String(d.bus_id || '5').replace(/[^0-9]/g, '')) || 5;
    const busStatus = d.has_fix && d.speed > 2 ? 'running' : (d.has_fix ? 'idle' : 'idle');
    await query(
      `UPDATE buses SET latitude = $1, longitude = $2, speed = $3, status = $4 WHERE bus_number = $5`,
      [d.lat, d.lng, d.speed, busStatus, busNum]
    );

    res.json({ status: 'success' });
  } catch (err) {
    console.error('[telemetry] POST /endpoint error:', err.message);
    res.status(500).json({ status: 'error' });
  }
});

// ─── GET /api/location/latest ───────────────────────────────────
// Public — returns latest telemetry WITH full diagnostics
router.get('/api/location/latest', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM telemetry ORDER BY ts DESC NULLS LAST, received_at DESC LIMIT 1');
    if (!rows.length) {
      return res.json({
        status: 'success',
        data: {
          deviceId: 'unknown-device',
          busId: 'Bus-Unknown',
          lat: 0,
          lng: 0,
          speed: 0,
          accuracy: 1.0,
          hasFix: false,
          satellites: 0,
          hdop: 99.9,
          netType: 'unknown',
          timestamp: new Date().toISOString(),
          status: 'idle'
        }
      });
    }

    const row = rows[0];
    res.json({
      status: 'success',
      data: {
        busId: row.bus_id || 'Bus-Unknown',
        lat: Number(row.lat),
        lng: Number(row.lng),
        speed: Number(row.speed || 0),
        timestamp: row.ts || row.received_at,
        status: row.status || 'idle'
      }
    });
  } catch (err) {
    console.error('[telemetry] GET /api/location/latest error:', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

// ─── GET /api/telemetry/diagnostics ─────────────────────────────
// PROTECTED — Caretakers & admins only
// Returns recent telemetry with full ESP32 hardware diagnostics
// Query params: ?limit=50 (default 50, max 200) &bus_id=5
router.get('/api/telemetry/diagnostics', requireAuth(['caretaker', 'admin']), async (req, res) => {
  try {
    let limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const busFilter = req.query.bus_id || null;

    let sql = `SELECT * FROM telemetry`;
    const params = [];
    let paramIdx = 1;

    if (busFilter) {
      sql += ` WHERE bus_id LIKE $${paramIdx++}`;
      params.push(`%${busFilter}%`);
    }

    sql += ` ORDER BY received_at DESC LIMIT $${paramIdx}`;
    params.push(limit);

    const rows = await query(sql, params);

    const data = rows.map(row => ({
      id: row.id,
      deviceId: row.device_id,
      busId: row.bus_id,
      lat: Number(row.lat),
      lng: Number(row.lng),
      speed: Number(row.speed || 0),
      accuracy: Number(row.accuracy || 1.0),
      hasFix: row.has_fix ?? false,
      satellites: row.satellites ?? 0,
      hdop: Number(row.hdop ?? 99.9),
      netType: row.net_type || 'unknown',
      timestamp: row.ts || null,
      status: row.status || 'idle',
      receivedAt: row.received_at,
    }));

    // Compute summary stats for the caretaker
    const summary = {
      totalPackets: data.length,
      fixRate: data.length > 0
        ? `${Math.round((data.filter(d => d.hasFix).length / data.length) * 100)}%`
        : '0%',
      avgSatellites: data.length > 0
        ? Math.round(data.reduce((sum, d) => sum + d.satellites, 0) / data.length * 10) / 10
        : 0,
      avgHdop: data.length > 0
        ? Math.round(data.reduce((sum, d) => sum + d.hdop, 0) / data.length * 10) / 10
        : 99.9,
      networks: {
        gsm: data.filter(d => d.netType === 'GSM').length,
        wifi: data.filter(d => d.netType === 'WiFi').length,
        none: data.filter(d => d.netType === 'None' || d.netType === 'unknown').length,
      },
      latestPacket: data[0] || null,
    };

    res.json({ status: 'success', summary, data });
  } catch (err) {
    console.error('[telemetry] GET /api/telemetry/diagnostics error:', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

// ─── GET /api/telemetry/history ───────────────────────────────
// PROTECTED — Caretakers & admins only
// Time-series playback of historical routes
router.get('/api/telemetry/history', requireAuth(['caretaker', 'admin']), async (req, res) => {
  try {
    const { bus_id, start_time, end_time } = req.query;
    if (!bus_id) return res.status(400).json({ status: 'error', message: 'bus_id required' });
    
    const start = start_time || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const end = end_time || new Date().toISOString();
    
    const rows = await query(`
      SELECT lat, lng, speed, ts, received_at, status 
      FROM telemetry 
      WHERE bus_id LIKE $1 AND received_at >= $2 AND received_at <= $3
      ORDER BY ts ASC NULLS LAST, received_at ASC
    `, [`%${bus_id}%`, start, end]);
    
    res.json({ status: 'success', data: rows });
  } catch (err) {
    console.error('[telemetry] GET /api/telemetry/history error:', err.message);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

module.exports = router;
