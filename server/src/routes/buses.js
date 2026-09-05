const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

const BUS_SELECT = `
SELECT
  b.bus_number,
  b.assigned_hostel,
  b.status,
  b.latitude,
  b.longitude,
  b.speed,
  b.is_enabled,
  b.route,
  d.id AS driver_id,
  d.name AS driver_name,
  d.phone AS driver_phone,
  d.is_active AS driver_is_active,
  s.id AS schedule_id,
  s.date AS schedule_date,
  s.from_hostel_time,
  s.from_mbse_time,
  s.special_note,
  s.updated_by
FROM buses b
LEFT JOIN drivers d ON d.bus_number = b.bus_number
LEFT JOIN LATERAL (
  SELECT * FROM schedules
  WHERE bus_number = b.bus_number
  ORDER BY updated_at DESC
  LIMIT 1
) s ON true
`;

function mapBus(row) {
  return {
    busNumber: row.bus_number,
    assignedHostel: row.assigned_hostel,
    status: row.status,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    speed: Number(row.speed),
    isEnabled: row.is_enabled,
    route: row.route || 'Hostel ↔ MBSE',
    driver: row.driver_id ? {
      _id: row.driver_id,
      name: row.driver_name,
      phone: row.driver_phone,
      busNumber: row.bus_number,
      isActive: row.driver_is_active,
    } : null,
    schedule: row.schedule_id ? {
      _id: row.schedule_id,
      busNumber: row.bus_number,
      date: row.schedule_date,
      fromHostelTime: row.from_hostel_time,
      fromMBSETime: row.from_mbse_time,
      specialNote: row.special_note || '',
      updatedBy: row.updated_by || '',
    } : null,
  };
}

async function assertCaretakerAccess(busNumber, auth) {
  const rows = await query('SELECT bus_number, assigned_hostel FROM buses WHERE bus_number = $1 LIMIT 1', [busNumber]);
  if (!rows.length) return { ok: false, code: 404, message: 'Bus not found' };
  if (auth.role === 'caretaker' && auth.hostelId && rows[0].assigned_hostel !== auth.hostelId) {
    return { ok: false, code: 403, message: 'Caretaker can only update own hostel buses' };
  }
  return { ok: true, bus: rows[0] };
}

router.get('/api/buses', requireAuth(['student', 'caretaker', 'admin']), async (req, res) => {
  try {
    let reqHostel = req.query.hostel;
    if (req.auth.role === 'student') {
      if (reqHostel && reqHostel !== req.auth.hostelId) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      reqHostel = req.auth.hostelId;
    }

    let sql = BUS_SELECT;
    let params = [];
    if (reqHostel) {
      sql += ' WHERE b.assigned_hostel = $1';
      params.push(reqHostel);
    }

    const rows = await query(sql, params);
    res.json(rows.map(mapBus));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/api/all-buses', requireAuth(['student', 'caretaker', 'admin']), async (req, res) => {
  try {
    let reqHostel = req.query.hostel;
    if (req.auth.role === 'student') {
      if (reqHostel && reqHostel !== req.auth.hostelId) {
        return res.status(403).json({ status: 'error', message: 'Forbidden' });
      }
      reqHostel = req.auth.hostelId;
    }

    let sql = BUS_SELECT;
    let params = [];
    if (reqHostel) {
      sql += ' WHERE b.assigned_hostel = $1';
      params.push(reqHostel);
    }

    const rows = await query(sql, params);
    res.json({ status: 'success', data: rows.map(mapBus) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

router.get('/api/buses/:busNumber', requireAuth(['student', 'caretaker', 'admin']), async (req, res) => {
  try {
    const { busNumber } = req.params;
    const rows = await query(BUS_SELECT + ' WHERE b.bus_number = $1', [busNumber]);
    if (!rows.length) return res.status(404).json({ message: 'Bus not found' });

    const bus = rows[0];
    if (req.auth.role === 'student' && bus.assigned_hostel !== req.auth.hostelId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    res.json(mapBus(bus));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/api/buses', requireAuth(['caretaker', 'admin']), async (req, res) => {
  try {
    let { busNumber, assignedHostel, driverName, driverPhone, latitude, longitude, route } = req.body;
    if (!busNumber || !driverName || !driverPhone) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    if (req.auth.role === 'caretaker') {
      assignedHostel = req.auth.hostelId;
    }

    const existCheck = await query('SELECT bus_number FROM buses WHERE bus_number = $1', [busNumber]);
    if (existCheck.length) return res.status(409).json({ message: 'Bus already exists' });

    await query(
      'INSERT INTO buses (bus_number, assigned_hostel, latitude, longitude, route) VALUES ($1, $2, $3, $4, $5)',
      [busNumber, assignedHostel, latitude || 0, longitude || 0, route || 'Hostel ↔ MBSE']
    );

    const driverId = 'drv_' + crypto.randomBytes(6).toString('hex');
    await query(
      'INSERT INTO drivers (id, bus_number, name, phone, is_active) VALUES ($1, $2, $3, $4, $5)',
      [driverId, busNumber, driverName, driverPhone, true]
    );

    const rows = await query(BUS_SELECT + ' WHERE b.bus_number = $1', [busNumber]);
    res.json({ status: 'success', data: mapBus(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/api/buses/:busNumber', requireAuth(['caretaker', 'admin']), async (req, res) => {
  try {
    const { busNumber } = req.params;
    const access = await assertCaretakerAccess(busNumber, req.auth);
    if (!access.ok) return res.status(access.code).json({ message: access.message });

    const updates = req.body;
    let setClauses = [];
    let params = [];
    let paramIdx = 1;

    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIdx++}`);
      params.push(updates.status);
      setClauses.push(`speed = $${paramIdx++}`);
      params.push(updates.status === 'running' ? 25 : 0);
    }
    if (updates.latitude !== undefined) {
      setClauses.push(`latitude = $${paramIdx++}`);
      params.push(updates.latitude);
    }
    if (updates.longitude !== undefined) {
      setClauses.push(`longitude = $${paramIdx++}`);
      params.push(updates.longitude);
    }
    if (updates.isEnabled !== undefined) {
      setClauses.push(`is_enabled = $${paramIdx++}`);
      params.push(updates.isEnabled);
    }

    if (!setClauses.length) return res.status(400).json({ message: 'No updates provided' });

    params.push(busNumber);
    const sql = `UPDATE buses SET ${setClauses.join(', ')} WHERE bus_number = $${paramIdx}`;
    await query(sql, params);

    const rows = await query(BUS_SELECT + ' WHERE b.bus_number = $1', [busNumber]);
    res.json({ status: 'success', data: mapBus(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/api/buses/:busNumber/driver', requireAuth(['caretaker', 'admin']), async (req, res) => {
  try {
    const { busNumber } = req.params;
    const { name, phone, isActive } = req.body;

    const access = await assertCaretakerAccess(busNumber, req.auth);
    if (!access.ok) return res.status(access.code).json({ message: access.message });

    let setClauses = [];
    let params = [];
    let paramIdx = 1;

    if (name !== undefined) { setClauses.push(`name = $${paramIdx++}`); params.push(name); }
    if (phone !== undefined) { setClauses.push(`phone = $${paramIdx++}`); params.push(phone); }
    if (isActive !== undefined) { setClauses.push(`is_active = $${paramIdx++}`); params.push(isActive); }

    if (setClauses.length) {
      params.push(busNumber);
      const sql = `UPDATE drivers SET ${setClauses.join(', ')} WHERE bus_number = $${paramIdx} RETURNING id`;
      const updated = await query(sql, params);

      if (!updated.length) {
         const driverId = 'drv_' + crypto.randomBytes(6).toString('hex');
         await query(
           'INSERT INTO drivers (id, bus_number, name, phone, is_active) VALUES ($1, $2, $3, $4, $5)',
           [driverId, busNumber, name || 'Unknown', phone || '000', isActive !== undefined ? isActive : true]
         );
      }
    }

    const rows = await query(BUS_SELECT + ' WHERE b.bus_number = $1', [busNumber]);
    res.json({ status: 'success', data: mapBus(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/api/buses/live', requireAuth(), async (req, res) => {
  try {
    const sql = `
      SELECT b.bus_number, b.status, b.latitude, b.longitude, b.speed, b.route, b.assigned_hostel
      FROM buses b
      WHERE b.is_enabled = true
    `;
    const rows = await query(sql);
    const data = rows.map(r => ({
      busNumber: r.bus_number,
      status: r.status,
      lat: Number(r.latitude),
      lng: Number(r.longitude),
      speed: Number(r.speed),
      route: r.route,
      hostel: r.assigned_hostel,
      // Mock diagnostics since they aren't on the bus table directly
      hasFix: r.status !== 'maintenance',
      satellites: r.status === 'running' ? 8 : 0,
      hdop: 1.2,
      netType: 'API'
    }));
    res.json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
