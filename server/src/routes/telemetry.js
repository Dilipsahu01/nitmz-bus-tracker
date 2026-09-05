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
 *   { has_fix, latitude, longitude, speed_kmh, satellites, hdop, timestamp, status, net_type, bus_id }
 *
 * The Flutter app webhook / simulator sends:
 *   { device_id, bus_id, lat, lng, speed, accuracy, ts, status }
 *
 * This function merges all variant shapes into a unified internal format.
 */
function normalizeTelemetry(body) {
  const rawLat = body.lat ?? body.latitude ?? body.lat_deg;
  const rawLng = body.lng ?? body.longitude ?? body.lng_deg ?? body.long;
  
  const parsedLat = (rawLat !== undefined && rawLat !== null && !isNaN(Number(rawLat))) ? Number(rawLat) : undefined;
  const parsedLng = (rawLng !== undefined && rawLng !== null && !isNaN(Number(rawLng))) ? Number(rawLng) : undefined;

  const rawBusId = body.bus_id ?? body.bus_number ?? body.busId ?? body.busNo ?? body.bus ?? null;

  return {
    device_id: body.device_id || body.deviceId || null,
    bus_id:    rawBusId !== null ? String(rawBusId) : null,
    lat:       parsedLat,
    lng:       parsedLng,
    speed:     Number(body.speed ?? body.speed_kmh ?? body.spd ?? 0),
    accuracy:  Number(body.accuracy ?? body.hdop ?? 1.0),
    has_fix:   body.has_fix ?? (body.status === 'active') ?? null,
    satellites: Number(body.satellites ?? 0),
    hdop:      Number(body.hdop ?? body.accuracy ?? 99.9),
    net_type:  body.net_type || body.netType || 'unknown',
    ts:        body.ts ?? body.timestamp ?? null,
    status:    body.status || 'idle',
    is_sos:    body.is_sos === true || body.is_sos === 'true'
  };
}

const { redisClient, redisSub } = require('../redis');
const EventEmitter = require('events');

// Bridge Redis Pub/Sub to Local EventEmitter for SSE efficiency
const telemetryEmitter = new EventEmitter();
telemetryEmitter.setMaxListeners(0);

let busHostelMapping = {};
async function updateBusHostelMapping() {
  try {
    const buses = await query('SELECT bus_number, assigned_hostel FROM buses');
    for (const b of buses) {
      busHostelMapping[b.bus_number] = b.assigned_hostel;
    }
  } catch (err) {
    console.error('Failed to update busHostelMapping:', err.message);
  }
}
updateBusHostelMapping();
setInterval(updateBusHostelMapping, 60000); // Refresh every minute

(async () => {
  try {
    setTimeout(async () => {
      if (redisSub && redisSub.isOpen) {
        await redisSub.subscribe('live_update', (message) => {
          try {
            const cacheEntry = JSON.parse(message);
            telemetryEmitter.emit('live_update', cacheEntry);
          } catch(e) {
            console.error('[telemetry] Error parsing Redis pubsub message:', e.message);
          }
        });
        console.log('✅ Subscribed to Redis live_update channel');
      }
    }, 1000);
  } catch (err) {
    console.error('[telemetry] Failed to subscribe to redis pubsub:', err.message || err);
  }
})();

// ─── POST /api/update-location ──────────────────────────────────
// Secure ESP32 / simulator telemetry ingestion (x-api-key required)
// Accepts BOTH ESP32 native format and app webhook format
router.post('/api/update-location', requireApiKey(), async (req, res) => {
  try {
    const d = normalizeTelemetry(req.body);
    if (d.lat === undefined || d.lng === undefined) {
      console.error('[telemetry] POST /api/update-location 400 Bad Request: Missing lat/lng in payload:', req.body);
      return res.status(400).json({ status: 'error', message: 'lat/latitude and lng/longitude are required' });
    }

    const parsedBusNumber = Number(String(d.bus_id || '').replace(/[^0-9]/g, ''));
    if (!parsedBusNumber) {
      console.error('[telemetry] POST /api/update-location 400 Bad Request: Invalid or missing bus ID in payload:', req.body);
      return res.status(400).json({ status: 'error', message: 'invalid bus id' });
    }

    // Prepare hot cache entry
    const cacheEntry = {
      ...d,
      bus_number: parsedBusNumber,
      ts: d.ts || new Date().toISOString()
    };

    // Store in Redis Hot Cache if connected
    if (redisClient && redisClient.isOpen) {
      try {
        await redisClient.hSet('hotCache', String(parsedBusNumber), JSON.stringify(cacheEntry));
        await redisClient.rPush('telemetryQueue', JSON.stringify(cacheEntry));
        await redisClient.publish('live_update', JSON.stringify(cacheEntry));
      } catch (redisErr) {
        console.error('[telemetry] Redis hotCache write error:', redisErr.message);
      }
    } else {
      // Fallback: direct DB update if Redis is offline
      try {
        await query(
          `UPDATE buses SET latitude = $1, longitude = $2, speed = $3, status = $4, updated_at = NOW() WHERE bus_number = $5`,
          [d.lat, d.lng, d.speed || 0, d.status === 'active' ? 'running' : (d.status || 'idle'), parsedBusNumber]
        );
      } catch (dbErr) {
        console.error('[telemetry] Fallback DB update error:', dbErr.message);
      }
    }

    // Always emit event locally for active SSE subscribers
    telemetryEmitter.emit('live_update', cacheEntry);

    // SOS Alerts
    if (d.is_sos) {
      try {
        const nId = 'n_' + crypto.randomBytes(6).toString('hex');
        await query(
          `INSERT INTO notifications (id, title, message, type, bus_number, sent_by) VALUES ($1, $2, $3, $4, $5, $6)`, 
          [nId, 'SOS ALERT', `Emergency SOS triggered on Bus ${parsedBusNumber}!`, 'alert', parsedBusNumber, 'system']
        );
      } catch (sosErr) {
        console.error('[telemetry] SOS alert creation error:', sosErr.message);
      }
    }

    // Geofence checking
    try {
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
    } catch (geoErr) {
      console.error('[telemetry] Geofence check error:', geoErr.message);
    }

    res.json({ message: 'Hot Path ingest success', status: 'success' });
  } catch (err) {
    console.error('[telemetry] POST /api/update-location server error:', err.stack || err.message || err);
    res.status(500).json({ status: 'error', message: err.message || 'Server error' });
  }
});

// ─── POST /endpoint ─────────────────────────────────────────────
// Legacy ESP32 firmware endpoint (x-api-key required)
router.post('/endpoint', requireApiKey(), async (req, res) => {
  try {
    const d = normalizeTelemetry(req.body);
    if (d.lat === undefined || d.lng === undefined) {
      console.error('[telemetry] POST /endpoint 400 Bad Request: Missing lat/lng:', req.body);
      return res.status(400).json({ status: 'error', message: 'lat and lng required' });
    }

    const busNum = Number(String(d.bus_id || '5').replace(/[^0-9]/g, '')) || 5;
    
    const cacheEntry = {
      ...d,
      bus_number: busNum,
      device_id: d.device_id || 'ESP32-Device-1',
      ts: d.ts || new Date().toISOString()
    };

    if (redisClient && redisClient.isOpen) {
      try {
        await redisClient.hSet('hotCache', String(busNum), JSON.stringify(cacheEntry));
        await redisClient.rPush('telemetryQueue', JSON.stringify(cacheEntry));
        await redisClient.publish('live_update', JSON.stringify(cacheEntry));
      } catch (redisErr) {
        console.error('[telemetry] Redis legacy endpoint error:', redisErr.message);
      }
    } else {
      try {
        await query(
          `UPDATE buses SET latitude = $1, longitude = $2, speed = $3, updated_at = NOW() WHERE bus_number = $4`,
          [d.lat, d.lng, d.speed || 0, busNum]
        );
      } catch (dbErr) {
        console.error('[telemetry] Legacy DB update error:', dbErr.message);
      }
    }

    telemetryEmitter.emit('live_update', cacheEntry);
    res.json({ status: 'success' });
  } catch (err) {
    console.error('[telemetry] POST /endpoint server error:', err.stack || err.message || err);
    res.status(500).json({ status: 'error', message: err.message || 'Server error' });
  }
});

// --- HOT PATH: SSE Broadcast to Clients ---
router.get('/api/buses/stream', requireAuth(), async (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }
    
    // Fetch current state snapshot
    let initialData = [];
    if (redisClient && redisClient.isOpen) {
      try {
        const allData = await redisClient.hGetAll('hotCache');
        initialData = Object.values(allData).map(val => JSON.parse(val));
      } catch (redisErr) {
        console.error('[SSE stream] Error reading hotCache from Redis:', redisErr.message);
      }
    }

    // DB Fallback if Redis is offline or hotCache empty
    if (initialData.length === 0) {
      try {
        const rows = await query(`
          SELECT bus_number, status, latitude, longitude, speed, route, assigned_hostel, updated_at
          FROM buses WHERE is_enabled = true
        `);
        initialData = rows.map(r => ({
          bus_number: parseInt(r.bus_number, 10),
          status: r.status,
          lat: Number(r.latitude),
          lng: Number(r.longitude),
          speed: Number(r.speed),
          route: r.route,
          assigned_hostel: r.assigned_hostel,
          ts: r.updated_at
        }));
      } catch (dbErr) {
        console.error('[SSE stream] Fallback DB query error:', dbErr.message);
      }
    }

    // Filter initial data for RBAC
    const isGlobalViewer = req.auth.role === 'admin' || req.auth.role === 'caretaker';
    const userHostel = req.auth.hostelId || req.auth.hostel_id;
    if (!isGlobalViewer) {
      initialData = initialData.filter(d => {
        const assigned = busHostelMapping[d.bus_number] || d.assigned_hostel || d.hostel;
        return userHostel && assigned && String(userHostel).trim().toUpperCase() === String(assigned).trim().toUpperCase();
      });
      initialData = initialData.map(d => {
        const { satellites, hdop, net_type, ...cleanData } = d;
        return cleanData;
      });
    }

    res.write(`data: ${JSON.stringify(initialData)}\n\n`);

    // Stream future updates
    const onUpdate = (data) => {
      try {
        const isGlobalViewer = req.auth.role === 'admin' || req.auth.role === 'caretaker';
        const userHostel = req.auth.hostelId || req.auth.hostel_id;
        const assigned = busHostelMapping[data.bus_number] || data.assigned_hostel || data.hostel;

        if (!isGlobalViewer && (!userHostel || !assigned || String(userHostel).trim().toUpperCase() !== String(assigned).trim().toUpperCase())) {
          return; // Skip data not belonging to student's hostel
        }

        if (!res.writable) {
          req.destroy();
          return;
        }

        let chunk;
        if (req.auth.role === 'student') {
          const { satellites, hdop, net_type, ...cleanData } = data;
          chunk = `data: ${JSON.stringify([cleanData])}\n\n`;
        } else {
          chunk = `data: ${JSON.stringify([data])}\n\n`;
        }

        const writeSuccess = res.write(chunk);
        if (!writeSuccess) {
          req.destroy();
        }
      } catch (err) {
        console.error('[SSE stream] Error writing chunk to client:', err.message);
      }
    };
    
    telemetryEmitter.on('live_update', onUpdate);
    req.on('close', () => telemetryEmitter.removeListener('live_update', onUpdate));
  } catch (err) {
    console.error('[telemetry] GET /api/buses/stream error:', err.stack || err.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'SSE initialization failed' });
    }
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
    
// ─── POST /api/telemetry/reset-sos ─────────────────────────────
// Reset Emergency SOS state for all buses
router.post('/api/telemetry/reset-sos', async (req, res) => {
  try {
    // 1. Clear SOS notifications from database
    await query(`DELETE FROM notifications WHERE type = 'alert' OR title LIKE '%SOS%'`);
    
    // 2. Clear is_sos flag in Redis hot cache and broadcast live update
    if (redisClient && redisClient.isOpen) {
      try {
        const allData = await redisClient.hGetAll('hotCache');
        for (const [busNumber, valStr] of Object.entries(allData)) {
          try {
            const entry = JSON.parse(valStr);
            entry.is_sos = false;
            await redisClient.hSet('hotCache', String(busNumber), JSON.stringify(entry));
            await redisClient.publish('live_update', JSON.stringify(entry));
            telemetryEmitter.emit('live_update', entry);
          } catch (e) {}
        }
      } catch (redisErr) {
        console.error('[telemetry] Reset SOS Redis error:', redisErr.message);
      }
    }

    res.json({ status: 'success', message: 'All emergency SOS alerts cleared and turned OFF' });
  } catch (err) {
    console.error('[telemetry] POST /api/telemetry/reset-sos error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to reset SOS alerts' });
  }
});

module.exports = router;

// --- COLD PATH: Background DB Sync ---
let isSyncing = false;
setInterval(async () => {
  if (isSyncing) return;
  isSyncing = true;
  try {
    const queueItems = await redisClient.lRange('telemetryQueue', 0, -1);
    if (!queueItems || queueItems.length === 0) return;
    
    const parsedItems = queueItems.map(item => JSON.parse(item));
    const len = parsedItems.length;

    const deviceIds = [], busIds = [], lats = [], lngs = [], speeds = [], accuracies = [], hasFixes = [], satellites = [], hdops = [], netTypes = [], tss = [], statuses = [];
    const busNumbers = [], updateLats = [], updateLngs = [], updateSpeeds = [], updateStatuses = [];

    for (const d of parsedItems) {
      deviceIds.push(d.device_id);
      busIds.push(String(d.bus_id || d.bus_number));
      lats.push(d.lat);
      lngs.push(d.lng);
      speeds.push(d.speed || 0);
      accuracies.push(d.accuracy || 1.0);
      hasFixes.push(d.has_fix || false);
      satellites.push(d.satellites || 0);
      hdops.push(d.hdop || 99.9);
      netTypes.push(d.net_type || 'unknown');
      tss.push(d.ts || new Date().toISOString());
      statuses.push(d.status || 'idle');

      busNumbers.push(d.bus_number);
      updateLats.push(d.lat);
      updateLngs.push(d.lng);
      updateSpeeds.push(d.speed || 0);
      updateStatuses.push(d.status === 'active' ? 'running' : (d.status || 'idle'));
    }

    // 1. Bulk Insert historical telemetry
    await query(
      `INSERT INTO telemetry (device_id, bus_id, lat, lng, speed, accuracy, has_fix, satellites, hdop, net_type, ts, status)
       SELECT * FROM UNNEST($1::text[], $2::text[], $3::numeric[], $4::numeric[], $5::numeric[], $6::numeric[], $7::boolean[], $8::int[], $9::numeric[], $10::text[], $11::timestamp[], $12::text[])`,
      [deviceIds, busIds, lats, lngs, speeds, accuracies, hasFixes, satellites, hdops, netTypes, tss, statuses]
    );

    // 2. Bulk Update canonical buses table
    await query(
      `UPDATE buses AS b
       SET latitude = u.lat, longitude = u.lng, speed = u.speed, status = COALESCE(u.status, b.status), updated_at = NOW()
       FROM UNNEST($1::int[], $2::numeric[], $3::numeric[], $4::numeric[], $5::text[]) AS u(bus_number, lat, lng, speed, status)
       WHERE b.bus_number = u.bus_number`,
      [busNumbers, updateLats, updateLngs, updateSpeeds, updateStatuses]
    );

    // Safely clear only the processed records
    await redisClient.lTrim('telemetryQueue', len, -1);
  } catch (err) {
    console.error('[Cold Path] Error syncing to DB from Redis:', err.message);
  } finally {
    isSyncing = false;
  }
}, 30000); // Runs every 30 seconds
