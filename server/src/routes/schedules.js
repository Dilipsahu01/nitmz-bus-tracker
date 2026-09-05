const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

function hostelsMatch(h1, h2) {
  if (!h1 || !h2) return false;
  return String(h1).trim().toUpperCase() === String(h2).trim().toUpperCase();
}

async function assertCaretakerAccess(busNumber, auth) {
  const rows = await query('SELECT bus_number, assigned_hostel FROM buses WHERE bus_number = $1 LIMIT 1', [busNumber]);
  if (!rows.length) return { ok: false, code: 404, message: 'Bus not found' };
  
  if (auth.role === 'caretaker') {
    const userHostel = auth.hostelId || auth.hostel_id;
    const bus = rows[0];
    const busHostel = bus.assignedHostel || bus.assigned_hostel;
    if (!userHostel || !busHostel || !hostelsMatch(userHostel, busHostel)) {
      return { ok: false, code: 403, message: 'Caretaker can only update own hostel buses' };
    }
  }
  return { ok: true, bus: rows[0] };
}

router.get('/api/schedules', requireAuth(['student', 'caretaker', 'admin']), async (req, res) => {
  try {
    let reqHostel = req.query.hostel;
    const date = req.query.date;
    const userHostel = req.auth.hostelId || req.auth.hostel_id;

    if (req.auth.role === 'student') {
      if (reqHostel && userHostel && !hostelsMatch(reqHostel, userHostel)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      reqHostel = userHostel;
    }

    let sql = `
      SELECT s.*, b.assigned_hostel
      FROM schedules s
      JOIN buses b ON s.bus_number = b.bus_number
      WHERE 1=1
    `;
    let params = [];
    let paramIdx = 1;

    if (reqHostel) {
      sql += ` AND LOWER(b.assigned_hostel) = LOWER($${paramIdx++})`;
      params.push(reqHostel);
    }
    if (date) {
      sql += ` AND s.date = $${paramIdx++}`;
      params.push(date);
    }

    sql += ' ORDER BY s.date DESC, s.updated_at DESC';

    const rows = await query(sql, params);
    res.json(rows.map(row => ({
      _id: row.id,
      busNumber: row.bus_number,
      date: row.date,
      fromHostelTime: row.from_hostel_time,
      fromMBSETime: row.from_mbse_time,
      specialNote: row.special_note || '',
      updatedBy: row.updated_by || ''
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/api/schedules', requireAuth(['caretaker', 'admin']), async (req, res) => {
  try {
    const { busNumber, date, fromHostelTime, fromMBSETime, specialNote, status } = req.body;
    if (!busNumber) return res.status(400).json({ message: 'busNumber is required' });

    const access = await assertCaretakerAccess(busNumber, req.auth);
    if (!access.ok) return res.status(access.code).json({ message: access.message });

    const targetDate = date || new Date().toISOString().split('T')[0];
    const id = 'sch_' + crypto.randomBytes(6).toString('hex');
    const updatedBy = req.auth.email || 'system';

    const sql = `
      INSERT INTO schedules (id, bus_number, date, from_hostel_time, from_mbse_time, special_note, updated_by, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (bus_number, date) DO UPDATE
      SET from_hostel_time = EXCLUDED.from_hostel_time,
          from_mbse_time = EXCLUDED.from_mbse_time,
          special_note = EXCLUDED.special_note,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
      RETURNING *;
    `;
    const schedRows = await query(sql, [id, busNumber, targetDate, fromHostelTime, fromMBSETime, specialNote, updatedBy]);
    const scheduleObj = schedRows[0];

    if (status !== undefined) {
      const speed = status === 'running' ? 25 : 0;
      await query('UPDATE buses SET status = $1, speed = $2 WHERE bus_number = $3', [status, speed, busNumber]);
    }

    const busRows = await query('SELECT * FROM buses WHERE bus_number = $1 LIMIT 1', [busNumber]);

    res.json({
      status: 'success',
      data: {
        _id: scheduleObj.id,
        busNumber: scheduleObj.bus_number,
        date: scheduleObj.date,
        fromHostelTime: scheduleObj.from_hostel_time,
        fromMBSETime: scheduleObj.from_mbse_time,
        specialNote: scheduleObj.special_note || '',
        updatedBy: scheduleObj.updated_by || ''
      },
      bus: busRows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
