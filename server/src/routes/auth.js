const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query } = require('../db');
const { requireAuth, createToken } = require('../middleware/auth');

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    hostelId: row.hostel_id
  };
}

router.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, hostelId } = req.body;
    let { role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    if (!email.toLowerCase().endsWith('@nitmz.ac.in')) {
      return res.status(403).json({ error: 'Only @nitmz.ac.in email addresses are allowed' });
    }

    // Force all public registrations to student
    role = 'student';

    // Check duplicate email
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const id = 'usr_' + crypto.randomBytes(6).toString('hex');
    const sql = `
      INSERT INTO users (id, name, email, password_hash, role, hostel_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const rows = await query(sql, [id, name, email, hashedPassword, role, hostelId || null]);
    const insertedUser = rows[0];

    const token = createToken(insertedUser);

    res.status(201).json({ token, user: publicUser(insertedUser) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const rows = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = createToken(user);

    res.json({ token, user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/me', requireAuth(), async (req, res) => {
  try {
    const rows = await query('SELECT * FROM users WHERE id = $1', [req.auth.userId]);
    const user = rows[0];
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ status: 'success', user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
