const router = require('express').Router();
const crypto = require('crypto');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

router.get('/api/notifications', requireAuth(['student', 'caretaker', 'admin']), async (req, res) => {
  try {
    let sql = 'SELECT * FROM notifications';
    const params = [];
    
    if (req.auth.role === 'student') {
      sql += ' WHERE target_hostel = $1 OR target_hostel IS NULL';
      params.push(req.auth.hostelId);
    } else if (['caretaker', 'admin'].includes(req.auth.role)) {
      const { hostel } = req.query;
      if (hostel) {
        sql += ' WHERE target_hostel = $1';
        params.push(hostel);
      }
    }
    
    sql += ' ORDER BY sent_at DESC';
    
    const rows = await query(sql, params);
    const notifications = rows.map(row => ({
      _id: row.id,
      title: row.title,
      message: row.message,
      type: row.type,
      busNumber: row.bus_number,
      targetHostel: row.target_hostel,
      sentAt: row.sent_at,
      isRead: row.is_read
    }));
    
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/notifications/send', requireAuth(['caretaker', 'admin']), async (req, res) => {
  try {
    const { title, message, busNumber } = req.body;
    let { type, targetHostel } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }
    
    if (!type) {
      type = 'general';
    }
    
    if (req.auth.role === 'caretaker' && !targetHostel) {
      targetHostel = req.auth.hostelId;
    }
    
    const id = 'n_' + crypto.randomBytes(6).toString('hex');
    const sql = `
      INSERT INTO notifications (id, title, message, type, bus_number, target_hostel, sent_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const params = [
      id,
      title,
      message,
      type,
      busNumber || null,
      targetHostel || null,
      req.auth.email
    ];
    
    const rows = await query(sql, params);
    const row = rows[0];
    
    res.status(201).json({
      _id: row.id,
      title: row.title,
      message: row.message,
      type: row.type,
      busNumber: row.bus_number,
      targetHostel: row.target_hostel,
      sentAt: row.sent_at,
      isRead: row.is_read
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
