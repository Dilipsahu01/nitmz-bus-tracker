const router = require('express').Router();
const { query } = require('../db');

router.get('/api', (req, res) => {
  res.json({ status: 'ok', message: 'Campus Bus Tracker API running' });
});

router.get('/api/health', async (req, res) => {
  try {
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM hostels) AS hostels,
        (SELECT COUNT(*) FROM buses) AS buses,
        (SELECT COUNT(*) FROM notifications) AS notifications
    `;
    const rows = await query(sql);
    const data = rows[0];
    res.json({
      status: 'ok',
      hostels: parseInt(data.hostels, 10),
      buses: parseInt(data.buses, 10),
      notifications: parseInt(data.notifications, 10)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/hostels', async (req, res) => {
  try {
    const sql = `SELECT id, name, type, full_name FROM hostels ORDER BY id`;
    const rows = await query(sql);
    const data = rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      fullName: row.full_name
    }));
    res.json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
