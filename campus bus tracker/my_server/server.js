const express = require('express');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 3000);
const API_SECRET_KEY = process.env.API_SECRET_KEY || 'BUSTRACKESP1SECRETKEY';

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'campus_bus_tracker';

let pool;

const hostelsSeed = [
    { id: 'GH1', name: 'GH1', type: 'Girls', fullName: "Girls' Hostel 1" },
    { id: 'GH2', name: 'GH2', type: 'Girls', fullName: "Girls' Hostel 2" },
    { id: 'BH1', name: 'BH1', type: 'Boys', fullName: "Boys' Hostel 1" },
    { id: 'BH2', name: 'BH2', type: 'Boys', fullName: "Boys' Hostel 2" },
    { id: 'BH3', name: 'BH3', type: 'Boys', fullName: "Boys' Hostel 3" },
    { id: 'BH4', name: 'BH4', type: 'Boys', fullName: "Boys' Hostel 4" },
];

const usersSeed = [
    { id: 'caretaker-gh1', name: 'GH1 Caretaker', email: 'caretaker-gh1@nitmz.ac.in', password: 'caretaker123', role: 'caretaker', hostelId: 'GH1' },
    { id: 'caretaker-gh2', name: 'GH2 Caretaker', email: 'caretaker-gh2@nitmz.ac.in', password: 'caretaker123', role: 'caretaker', hostelId: 'GH2' },
    { id: 'caretaker-bh1', name: 'BH1 Caretaker', email: 'caretaker-bh1@nitmz.ac.in', password: 'caretaker123', role: 'caretaker', hostelId: 'BH1' },
    { id: 'caretaker-bh2', name: 'BH2 Caretaker', email: 'caretaker-bh2@nitmz.ac.in', password: 'caretaker123', role: 'caretaker', hostelId: 'BH2' },
    { id: 'caretaker-bh3', name: 'BH3 Caretaker', email: 'caretaker-bh3@nitmz.ac.in', password: 'caretaker123', role: 'caretaker', hostelId: 'BH3' },
    { id: 'caretaker-bh4', name: 'BH4 Caretaker', email: 'caretaker-bh4@nitmz.ac.in', password: 'caretaker123', role: 'caretaker', hostelId: 'BH4' },
    { id: 'student-bh1', name: 'Anshul Student', email: 'student@nitmz.ac.in', password: 'student123', role: 'student', hostelId: 'BH1' },
];

const busesSeed = [
    [1, 'GH1', 'Pa Hlutea', '9436168711', 23.7285, 92.7180, 'idle', '8:30 AM', '1:30 PM'],
    [2, 'GH1', 'Pu Stephen', '8787778119', 23.7260, 92.7165, 'running', '9:15 AM', '4:30 PM'],
    [3, 'GH1', 'Mawizuala', '8131811729', 23.7290, 92.7200, 'idle', '8:30 AM', '5:30 PM'],
    [4, 'GH2', 'Hruaia', '6909101103', 23.7240, 92.7150, 'running', '8:15 AM', '4:30 PM'],
    [5, 'BH1', 'Chhuanga', '9862369186', 23.7275, 92.7185, 'running', '8:15 AM', '5:30 PM'],
    [6, 'BH1', 'Pa Dina', '9615408299', 23.7265, 92.7170, 'idle', '8:15 AM', '7:00 PM'],
    [7, 'BH1', 'Vk-a', '7005367693', 23.7280, 92.7195, 'running', '8:15 PM', '5:30 PM'],
    [8, 'BH1', 'Dama', '7005364878', 23.7255, 92.7160, 'idle', '6:30 AM', '12:30 PM', 'IoN Digital Centre Mualpui'],
    [9, 'BH1', 'Mala', '6009425695', 23.7295, 92.7205, 'maintenance', '1:00 PM', '4:30 PM'],
    [10, 'BH1', 'Rinkima', '7005616947', 23.7270, 92.7175, 'idle', '9:15 AM', '1:30 PM'],
    [11, 'BH1', 'Pa Dika', '6909470121', 23.7250, 92.7155, 'running', '9:15 AM', '1:30 PM'],
    [12, 'BH1', 'Ramtea', '8729985255', 23.7285, 92.7190, 'idle', '10:15 AM', '2:30 PM'],
    [13, 'BH2', 'Lalrammawia', '9862411234', 23.7260, 92.7165, 'running', '9:20 AM', '2:00 PM'],
    [14, 'BH2', 'Vanlalruata', '8014567890', 23.7245, 92.7148, 'idle', '8:20 AM', '3:20 PM'],
    [15, 'BH2', 'Zohmingliana', '7005223344', 23.7300, 92.7210, 'running', '8:20 AM', '11:15 AM'],
    [16, 'BH3', 'Lalduhawma', '9856112233', 23.7230, 92.7140, 'idle', '8:00 AM', '4:00 PM'],
    [17, 'BH3', 'Vanlalngaia', '6009334455', 23.7315, 92.7215, 'running', '9:00 AM', '5:00 PM'],
    [18, 'BH3', 'Hmingthansanga', '7005556677', 23.7240, 92.7155, 'idle', '8:30 AM', '3:30 PM'],
    [19, 'BH3', 'Lalremruata', '8259667788', 23.7305, 92.7205, 'idle', '9:30 AM', '4:30 PM'],
    [20, 'BH3', 'Thangmawia', '9612778899', 23.7235, 92.7145, 'running', '10:00 AM', '2:00 PM'],
    [21, 'BH4', 'Kaptluanga', '9862990011', 23.7320, 92.7220, 'idle', '8:45 AM', '5:00 PM'],
    [22, 'GH2', 'Saka', '9378074359', 23.7245, 92.7152, 'running', '8:25 AM', '5:30 PM'],
];

const notificationsSeed = [
    ['n1', 'Bus 5 Departure Alert', 'Bus 5 will depart from BH1 at 8:15 AM. Please be ready!', 'departure', 5, 'BH1', false],
    ['n2', 'Bus 7 Schedule Update', 'Bus 7 schedule updated. From Hostel: 8:15 PM, From MBSE: 5:30 PM', 'general', 7, 'BH1', false],
    ['n3', 'Bus 2 Arriving Soon', 'Bus 2 (GH1) is 1 km away from hostel. ETA: 5 minutes!', 'arrival', 2, 'GH1', true],
    ['n4', 'Bus 9 Maintenance', 'Bus 9 is under maintenance today. Please use alternate buses.', 'delay', 9, 'BH1', true],
];

const sessions = new Map();

const today = () => new Date().toISOString().slice(0, 10);
const uid = (prefix) => `${prefix}${crypto.randomBytes(6).toString('hex')}`;

app.use(express.json());
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
});

async function q(sql, params = []) {
    const [rows] = await pool.execute(sql, params);
    return rows;
}

function publicUser(row) {
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        hostelId: row.hostel_id,
    };
}

function mapSchedule(row) {
    if (!row.schedule_id) return null;
    return {
        _id: row.schedule_id,
        busNumber: row.bus_number,
        date: row.schedule_date,
        fromHostelTime: row.from_hostel_time,
        fromMBSETime: row.from_mbse_time,
        specialNote: row.special_note || '',
        updatedBy: row.updated_by || '',
    };
}

function mapBus(row) {
    return {
        busNumber: row.bus_number,
        assignedHostel: row.assigned_hostel,
        status: row.status,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        speed: Number(row.speed),
        isEnabled: !!row.is_enabled,
        route: row.route || 'Hostel ↔ MBSE',
        driver: row.driver_id
            ? {
                _id: row.driver_id,
                name: row.driver_name,
                phone: row.driver_phone,
                busNumber: row.bus_number,
                isActive: !!row.driver_is_active,
            }
            : null,
        schedule: mapSchedule(row),
    };
}

function requireAuth(req, res, allowedRoles = null) {
    const header = req.header('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token || !sessions.has(token)) {
        res.status(401).json({ error: 'Unauthorized' });
        return null;
    }

    const session = sessions.get(token);
    if (allowedRoles && !allowedRoles.includes(session.role)) {
        res.status(403).json({ error: 'Forbidden' });
        return null;
    }

    return { token, ...session };
}

function createToken(user) {
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, {
        userId: user.id,
        email: user.email,
        role: user.role,
        hostelId: user.hostel_id,
    });
    return token;
}

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
LEFT JOIN (
  SELECT s1.*
  FROM schedules s1
  JOIN (
    SELECT bus_number, MAX(updated_at) AS max_updated
    FROM schedules
    GROUP BY bus_number
  ) s2 ON s1.bus_number = s2.bus_number AND s1.updated_at = s2.max_updated
) s ON s.bus_number = b.bus_number
`;

async function fetchBusByNumber(busNumber) {
    const rows = await q(`${BUS_SELECT} WHERE b.bus_number = ?`, [busNumber]);
    return rows.length ? mapBus(rows[0]) : null;
}

async function assertCaretakerAccess(busNumber, auth) {
    const busRows = await q('SELECT bus_number, assigned_hostel FROM buses WHERE bus_number = ? LIMIT 1', [busNumber]);
    if (!busRows.length) {
        return { ok: false, code: 404, message: 'Bus not found' };
    }
    if (auth.role === 'caretaker' && auth.hostelId && busRows[0].assigned_hostel !== auth.hostelId) {
        return { ok: false, code: 403, message: 'Caretaker can only update own hostel buses' };
    }
    return { ok: true, bus: busRows[0] };
}

async function initializeDatabase() {
    const bootstrap = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
    });

    await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
    await bootstrap.end();

    pool = mysql.createPool({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME,
        connectionLimit: 10,
        waitForConnections: true,
    });

    await q(`
CREATE TABLE IF NOT EXISTS hostels (
  id VARCHAR(10) PRIMARY KEY,
  name VARCHAR(20) NOT NULL,
  type VARCHAR(20) NOT NULL,
  full_name VARCHAR(100) NOT NULL
)`);

    await q(`
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(40) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  password VARCHAR(120) NOT NULL,
  role VARCHAR(20) NOT NULL,
  hostel_id VARCHAR(10) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hostel_id) REFERENCES hostels(id) ON DELETE SET NULL
)`);

    await q(`
CREATE TABLE IF NOT EXISTS buses (
  bus_number INT PRIMARY KEY,
  assigned_hostel VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'idle',
  latitude DECIMAL(10,6) NOT NULL,
  longitude DECIMAL(10,6) NOT NULL,
  speed DECIMAL(8,2) NOT NULL DEFAULT 0,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  route VARCHAR(120) NOT NULL DEFAULT 'Hostel ↔ MBSE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_hostel) REFERENCES hostels(id)
)`);

    await q(`
CREATE TABLE IF NOT EXISTS drivers (
  id VARCHAR(40) PRIMARY KEY,
  bus_number INT NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (bus_number) REFERENCES buses(bus_number) ON DELETE CASCADE
)`);

    await q(`
CREATE TABLE IF NOT EXISTS schedules (
  id VARCHAR(40) PRIMARY KEY,
  bus_number INT NOT NULL,
  date DATE NOT NULL,
  from_hostel_time VARCHAR(20) NOT NULL,
  from_mbse_time VARCHAR(20) NOT NULL,
  special_note VARCHAR(255) NULL,
  updated_by VARCHAR(120) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_schedule_bus_date (bus_number, date),
  FOREIGN KEY (bus_number) REFERENCES buses(bus_number) ON DELETE CASCADE
)`);

    await q(`
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(40) PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(30) NOT NULL,
  bus_number INT NULL,
  target_hostel VARCHAR(10) NULL,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  sent_by VARCHAR(120) NULL,
  FOREIGN KEY (target_hostel) REFERENCES hostels(id) ON DELETE SET NULL
)`);

    await q(`
CREATE TABLE IF NOT EXISTS telemetry (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(60) NULL,
  bus_id VARCHAR(40) NULL,
  lat DECIMAL(10,6) NOT NULL,
  lng DECIMAL(10,6) NOT NULL,
  speed DECIMAL(8,2) NOT NULL DEFAULT 0,
  accuracy DECIMAL(8,2) NOT NULL DEFAULT 1.0,
  ts VARCHAR(64) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'idle',
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`);

    const [hostelCount] = await q('SELECT COUNT(*) AS count FROM hostels');
    if (hostelCount.count === 0) {
        for (const hostel of hostelsSeed) {
            await q('INSERT INTO hostels (id, name, type, full_name) VALUES (?, ?, ?, ?)', [
                hostel.id,
                hostel.name,
                hostel.type,
                hostel.fullName,
            ]);
        }
    }

    const [userCount] = await q('SELECT COUNT(*) AS count FROM users');
    if (userCount.count === 0) {
        for (const user of usersSeed) {
            await q(
                'INSERT INTO users (id, name, email, password, role, hostel_id) VALUES (?, ?, ?, ?, ?, ?)',
                [user.id, user.name, user.email, user.password, user.role, user.hostelId]
            );
        }
    }

    const [busCount] = await q('SELECT COUNT(*) AS count FROM buses');
    if (busCount.count === 0) {
        for (const [busNumber, assignedHostel, driverName, phone, latitude, longitude, status, fromHostelTime, fromMBSETime, specialNote = ''] of busesSeed) {
            await q(
                'INSERT INTO buses (bus_number, assigned_hostel, status, latitude, longitude, speed, is_enabled, route) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
                [busNumber, assignedHostel, status, latitude, longitude, status === 'running' ? 25 : 0, 'Hostel ↔ MBSE']
            );
            await q('INSERT INTO drivers (id, bus_number, name, phone, is_active) VALUES (?, ?, ?, ?, 1)', [
                `drv${busNumber}`,
                busNumber,
                driverName,
                phone,
            ]);
            await q(
                'INSERT INTO schedules (id, bus_number, date, from_hostel_time, from_mbse_time, special_note, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [`sch${busNumber}`, busNumber, today(), fromHostelTime, fromMBSETime, specialNote, 'caretaker-gh1@nitmz.ac.in']
            );
        }
    }

    const [notifCount] = await q('SELECT COUNT(*) AS count FROM notifications');
    if (notifCount.count === 0) {
        for (const [id, title, message, type, busNumber, targetHostel, isRead] of notificationsSeed) {
            await q(
                'INSERT INTO notifications (id, title, message, type, bus_number, target_hostel, is_read, sent_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [id, title, message, type, busNumber, targetHostel, isRead ? 1 : 0, 'seed']
            );
        }
    }

    const [telemetryCount] = await q('SELECT COUNT(*) AS count FROM telemetry');
    if (telemetryCount.count === 0) {
        await q(
            'INSERT INTO telemetry (device_id, bus_id, lat, lng, speed, accuracy, ts, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            ['ESP32-1', '5', 23.7271, 92.7176, 0, 1.0, null, 'idle']
        );
    }
}

app.get('/', (_req, res) => {
    res.json({ status: 'ok', message: 'Campus Bus Tracker API running (MySQL)' });
});

app.get('/api/health', async (_req, res) => {
    try {
        const [[hostels], [buses], [notifications]] = await Promise.all([
            q('SELECT COUNT(*) AS count FROM hostels'),
            q('SELECT COUNT(*) AS count FROM buses'),
            q('SELECT COUNT(*) AS count FROM notifications'),
        ]);
        res.json({ status: 'ok', hostels: hostels.count, buses: buses.count, notifications: notifications.count });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/api/hostels', async (_req, res) => {
    try {
        const rows = await q('SELECT id, name, type, full_name AS fullName FROM hostels ORDER BY id');
        res.json({ status: 'success', data: rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, hostelId, role } = req.body || {};
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'name, email, and password are required' });
        }

        const existing = await q('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const user = {
            id: uid('usr_'),
            name,
            email,
            password,
            role: role === 'caretaker' ? 'caretaker' : 'student',
            hostel_id: hostelId || 'BH1',
        };

        await q(
            'INSERT INTO users (id, name, email, password, role, hostel_id) VALUES (?, ?, ?, ?, ?, ?)',
            [user.id, user.name, user.email, user.password, user.role, user.hostel_id]
        );

        const token = createToken(user);
        return res.json({ token, user: publicUser(user) });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        const rows = await q('SELECT id, name, email, role, hostel_id, password FROM users WHERE email = ? LIMIT 1', [email || '']);
        if (rows.length === 0 || rows[0].password !== password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = rows[0];
        const token = createToken(user);
        return res.json({ token, user: publicUser(user) });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.get('/api/me', async (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;

    try {
        const rows = await q('SELECT id, name, email, role, hostel_id FROM users WHERE id = ? LIMIT 1', [auth.userId]);
        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
        return res.json({ status: 'success', user: publicUser(rows[0]) });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.get('/api/buses', async (req, res) => {
    const auth = requireAuth(req, res, ['student', 'caretaker', 'admin']);
    if (!auth) return;

    try {
        const hostel = req.query.hostel || null;
        if (auth.role === 'student' && auth.hostelId && hostel && hostel !== auth.hostelId) {
            return res.status(403).json({ error: 'Students can only view their own hostel buses' });
        }

        const targetHostel = auth.role === 'student' ? auth.hostelId : hostel;
        const where = targetHostel ? 'WHERE b.assigned_hostel = ?' : '';
        const rows = await q(`${BUS_SELECT} ${where} ORDER BY b.bus_number`, targetHostel ? [targetHostel] : []);
        return res.json(rows.map(mapBus));
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.get('/api/all-buses', async (req, res) => {
    const auth = requireAuth(req, res, ['student', 'caretaker', 'admin']);
    if (!auth) return;

    try {
        const hostel = auth.role === 'student' ? auth.hostelId : (req.query.hostel || null);
        const where = hostel ? 'WHERE b.assigned_hostel = ?' : '';
        const rows = await q(`${BUS_SELECT} ${where} ORDER BY b.bus_number`, hostel ? [hostel] : []);
        return res.json({ status: 'success', data: rows.map(mapBus) });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.get('/api/buses/:busNumber', async (req, res) => {
    const auth = requireAuth(req, res, ['student', 'caretaker', 'admin']);
    if (!auth) return;

    try {
        const bus = await fetchBusByNumber(req.params.busNumber);
        if (!bus) return res.status(404).json({ error: 'Bus not found' });
        if (auth.role === 'student' && auth.hostelId !== bus.assignedHostel) {
            return res.status(403).json({ error: 'Access denied' });
        }
        return res.json(bus);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.post('/api/buses', async (req, res) => {
    const auth = requireAuth(req, res, ['caretaker', 'admin']);
    if (!auth) return;

    try {
        const { busNumber, assignedHostel, driverName, driverPhone, latitude, longitude, route } = req.body || {};
        if (busNumber === undefined || !driverName || !driverPhone) {
            return res.status(400).json({ error: 'busNumber, driverName, and driverPhone are required' });
        }

        const existing = await q('SELECT bus_number FROM buses WHERE bus_number = ? LIMIT 1', [busNumber]);
        if (existing.length) {
            return res.status(409).json({ error: 'Bus number already exists' });
        }

        const targetHostel = auth.role === 'caretaker' ? auth.hostelId : (assignedHostel || auth.hostelId || 'BH1');
        if (!targetHostel) {
            return res.status(400).json({ error: 'assignedHostel is required' });
        }

        await q(
            'INSERT INTO buses (bus_number, assigned_hostel, status, latitude, longitude, speed, is_enabled, route) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
            [
                Number(busNumber),
                targetHostel,
                'idle',
                latitude !== undefined ? Number(latitude) : 23.7271,
                longitude !== undefined ? Number(longitude) : 92.7176,
                0,
                route || 'Hostel ↔ MBSE',
            ]
        );

        await q('INSERT INTO drivers (id, bus_number, name, phone, is_active) VALUES (?, ?, ?, ?, 1)', [
            uid('drv_'),
            Number(busNumber),
            String(driverName),
            String(driverPhone),
        ]);

        const created = await fetchBusByNumber(busNumber);
        return res.status(201).json({ status: 'success', data: created });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.patch('/api/buses/:busNumber/driver', async (req, res) => {
    const auth = requireAuth(req, res, ['caretaker', 'admin']);
    if (!auth) return;

    try {
        const busNumber = Number(req.params.busNumber);
        const access = await assertCaretakerAccess(busNumber, auth);
        if (!access.ok) {
            return res.status(access.code).json({ error: access.message });
        }

        const { name, phone, isActive } = req.body || {};
        if (!name && !phone && isActive === undefined) {
            return res.status(400).json({ error: 'At least one of name, phone, isActive is required' });
        }

        const rows = await q('SELECT id FROM drivers WHERE bus_number = ? LIMIT 1', [busNumber]);
        if (!rows.length) {
            if (!name || !phone) {
                return res.status(400).json({ error: 'name and phone are required to create a new driver' });
            }
            await q('INSERT INTO drivers (id, bus_number, name, phone, is_active) VALUES (?, ?, ?, ?, ?)', [
                uid('drv_'),
                busNumber,
                name,
                phone,
                isActive === undefined ? 1 : (isActive ? 1 : 0),
            ]);
        } else {
            const updates = [];
            const params = [];
            if (name) {
                updates.push('name = ?');
                params.push(name);
            }
            if (phone) {
                updates.push('phone = ?');
                params.push(phone);
            }
            if (isActive !== undefined) {
                updates.push('is_active = ?');
                params.push(isActive ? 1 : 0);
            }
            params.push(busNumber);
            await q(`UPDATE drivers SET ${updates.join(', ')} WHERE bus_number = ?`, params);
        }

        const updatedBus = await fetchBusByNumber(busNumber);
        return res.json({ status: 'success', data: updatedBus });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.get('/api/schedules', async (req, res) => {
    const auth = requireAuth(req, res, ['student', 'caretaker', 'admin']);
    if (!auth) return;

    try {
        const hostel = auth.role === 'student' ? auth.hostelId : (req.query.hostel || null);
        const date = req.query.date || null;

        const rows = await q(
            `
      SELECT
        s.id AS _id,
        s.bus_number AS busNumber,
        DATE_FORMAT(s.date, '%Y-%m-%d') AS date,
        s.from_hostel_time AS fromHostelTime,
        s.from_mbse_time AS fromMBSETime,
        IFNULL(s.special_note, '') AS specialNote,
        IFNULL(s.updated_by, '') AS updatedBy
      FROM schedules s
      JOIN buses b ON b.bus_number = s.bus_number
      WHERE (? IS NULL OR b.assigned_hostel = ?)
        AND (? IS NULL OR s.date = ?)
      ORDER BY s.bus_number
      `,
            [hostel, hostel, date, date]
        );

        return res.json(rows);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.post('/api/schedules', async (req, res) => {
    const auth = requireAuth(req, res, ['caretaker', 'admin']);
    if (!auth) return;

    try {
        const { busNumber } = req.body || {};
        if (busNumber === undefined) {
            return res.status(400).json({ error: 'busNumber is required' });
        }

        const access = await assertCaretakerAccess(busNumber, auth);
        if (!access.ok) {
            return res.status(access.code).json({ error: access.message });
        }

        const scheduleDate = req.body.date || today();
        const fromHostelTime = req.body.fromHostelTime || '';
        const fromMBSETime = req.body.fromMBSETime || '';
        const specialNote = req.body.specialNote || '';

        await q(
            `
      INSERT INTO schedules (id, bus_number, date, from_hostel_time, from_mbse_time, special_note, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        from_hostel_time = VALUES(from_hostel_time),
        from_mbse_time = VALUES(from_mbse_time),
        special_note = VALUES(special_note),
        updated_by = VALUES(updated_by)
      `,
            [
                uid('sch_'),
                busNumber,
                scheduleDate,
                fromHostelTime,
                fromMBSETime,
                specialNote,
                auth.email,
            ]
        );

        if (req.body.status) {
            const status = String(req.body.status).toLowerCase();
            await q('UPDATE buses SET status = ?, speed = ? WHERE bus_number = ?', [
                status,
                status === 'running' ? 25 : 0,
                busNumber,
            ]);
        }

        const rows = await q(
            `
      SELECT
        s.id AS _id,
        s.bus_number AS busNumber,
        DATE_FORMAT(s.date, '%Y-%m-%d') AS date,
        s.from_hostel_time AS fromHostelTime,
        s.from_mbse_time AS fromMBSETime,
        IFNULL(s.special_note, '') AS specialNote,
        IFNULL(s.updated_by, '') AS updatedBy
      FROM schedules s
      WHERE s.bus_number = ? AND s.date = ?
      LIMIT 1
      `,
            [busNumber, scheduleDate]
        );

        const bus = await fetchBusByNumber(busNumber);
        return res.json({ status: 'success', data: rows[0], bus });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.patch('/api/buses/:busNumber', async (req, res) => {
    const auth = requireAuth(req, res, ['caretaker', 'admin']);
    if (!auth) return;

    try {
        const busNumber = Number(req.params.busNumber);
        const access = await assertCaretakerAccess(busNumber, auth);
        if (!access.ok) {
            return res.status(access.code).json({ error: access.message });
        }

        const updates = [];
        const params = [];

        if (req.body.status !== undefined) {
            const status = String(req.body.status).toLowerCase();
            updates.push('status = ?', 'speed = ?');
            params.push(status, status === 'running' ? 25 : 0);
        }
        if (req.body.latitude !== undefined) {
            updates.push('latitude = ?');
            params.push(Number(req.body.latitude));
        }
        if (req.body.longitude !== undefined) {
            updates.push('longitude = ?');
            params.push(Number(req.body.longitude));
        }
        if (req.body.isEnabled !== undefined) {
            updates.push('is_enabled = ?');
            params.push(req.body.isEnabled ? 1 : 0);
        }

        if (updates.length > 0) {
            params.push(busNumber);
            await q(`UPDATE buses SET ${updates.join(', ')} WHERE bus_number = ?`, params);
        }

        const bus = await fetchBusByNumber(busNumber);
        return res.json({ status: 'success', data: bus });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.get('/api/notifications', async (req, res) => {
    const auth = requireAuth(req, res, ['student', 'caretaker', 'admin']);
    if (!auth) return;

    try {
        const hostel = auth.role === 'student' ? auth.hostelId : (req.query.hostel || null);
        const rows = await q(
            `
      SELECT
        id AS _id,
        title,
        message,
        type,
        bus_number AS busNumber,
        target_hostel AS targetHostel,
        DATE_FORMAT(sent_at, '%Y-%m-%dT%H:%i:%sZ') AS sentAt,
        is_read AS isRead
      FROM notifications
      WHERE (? IS NULL OR target_hostel = ? OR target_hostel IS NULL)
      ORDER BY sent_at DESC
      `,
            [hostel, hostel]
        );
        return res.json(rows.map((n) => ({ ...n, isRead: !!n.isRead })));
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.post('/api/notifications/send', async (req, res) => {
    const auth = requireAuth(req, res, ['caretaker', 'admin']);
    if (!auth) return;

    try {
        const {
            title,
            message,
            type = 'general',
            busNumber = null,
            targetHostel = auth.hostelId || null,
        } = req.body || {};

        if (!title || !message) {
            return res.status(400).json({ error: 'title and message are required' });
        }

        const id = uid('n_');
        await q(
            'INSERT INTO notifications (id, title, message, type, bus_number, target_hostel, is_read, sent_by) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
            [id, title, message, type, busNumber, targetHostel, auth.email]
        );

        const rows = await q(
            `
      SELECT
        id AS _id,
        title,
        message,
        type,
        bus_number AS busNumber,
        target_hostel AS targetHostel,
        DATE_FORMAT(sent_at, '%Y-%m-%dT%H:%i:%sZ') AS sentAt,
        is_read AS isRead
      FROM notifications
      WHERE id = ?
      LIMIT 1
      `,
            [id]
        );

        const created = rows[0];
        return res.json({ ...created, isRead: !!created.isRead });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.post('/api/update-location', async (req, res) => {
    const clientKey = req.header('x-api-key');
    if (clientKey !== API_SECRET_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const { device_id, bus_id, lat, lng, speed, accuracy, ts, status } = req.body || {};
        if (lat === undefined || lng === undefined) {
            return res.status(400).json({ error: 'Invalid payload. lat/lng are required.' });
        }

        const latNum = Number(lat);
        const lngNum = Number(lng);
        const speedNum = Number(speed || 0);
        const accuracyNum = Number(accuracy || 1.0);
        const normalizedStatus = status || 'idle';

        await q(
            'INSERT INTO telemetry (device_id, bus_id, lat, lng, speed, accuracy, ts, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [device_id || null, bus_id?.toString() || null, latNum, lngNum, speedNum, accuracyNum, ts || null, normalizedStatus]
        );

        const busNumber = Number(String(bus_id || '').replace(/[^0-9]/g, ''));
        if (!Number.isNaN(busNumber) && busNumber > 0) {
            await q(
                'UPDATE buses SET latitude = ?, longitude = ?, speed = ?, status = ? WHERE bus_number = ?',
                [latNum, lngNum, speedNum, normalizedStatus, busNumber]
            );
        }

        return res.status(200).json({ message: 'Data received successfully', status: 'success' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.get('/api/location/latest', async (_req, res) => {
    try {
        const rows = await q(
            `
      SELECT
        device_id,
        bus_id,
        lat,
        lng,
        speed,
        accuracy,
        ts,
        status,
        DATE_FORMAT(received_at, '%Y-%m-%dT%H:%i:%sZ') AS received_at
      FROM telemetry
      ORDER BY received_at DESC
      LIMIT 1
      `
        );

        if (!rows.length) {
            return res.json({
                status: 'success',
                data: {
                    deviceId: 'ESP32-Device-1',
                    busId: 'Bus 5',
                    lat: 23.7271,
                    lng: 92.7176,
                    speed: 0,
                    accuracy: 1.0,
                    timestamp: new Date().toISOString(),
                    status: 'idle',
                },
            });
        }

        const latest = rows[0];
        const busRaw = latest.bus_id || '5';
        const busDigits = String(busRaw).replace(/[^0-9]/g, '');
        const busId = busDigits ? `Bus ${busDigits}` : String(busRaw);

        return res.json({
            status: 'success',
            data: {
                deviceId: latest.device_id || 'ESP32-Device-1',
                busId,
                lat: Number(latest.lat),
                lng: Number(latest.lng),
                speed: Number(latest.speed || 0),
                accuracy: Number(latest.accuracy || 1.0),
                timestamp: latest.ts || latest.received_at,
                status: latest.status || 'idle',
            },
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.post('/update-gps', async (req, res) => {
    try {
        const { lat, lng } = req.body || {};
        if (lat === undefined || lng === undefined) {
            return res.status(400).json({ status: 'Error', message: 'Invalid Data' });
        }

        await q(
            'INSERT INTO telemetry (device_id, bus_id, lat, lng, speed, accuracy, ts, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            ['ESP32-legacy', null, Number(lat), Number(lng), 0, 1.0, null, 'idle']
        );

        return res.status(200).json({ status: 'Success', message: 'Location Updated' });
    } catch (error) {
        return res.status(500).json({ status: 'Error', message: error.message });
    }
});

app.get('/get-location', async (_req, res) => {
    try {
        const rows = await q(
            `
      SELECT lat, lng, DATE_FORMAT(received_at, '%Y-%m-%dT%H:%i:%sZ') AS received_at
      FROM telemetry
      ORDER BY received_at DESC
      LIMIT 1
      `
        );

        const latest = rows[0] || { lat: 23.7271, lng: 92.7176, received_at: new Date().toISOString() };
        return res.json({ latitude: Number(latest.lat), longitude: Number(latest.lng), timestamp: latest.received_at });
    } catch (error) {
        return res.status(500).json({ status: 'Error', message: error.message });
    }
});

async function start() {
    try {
        await initializeDatabase();
        app.listen(port, '0.0.0.0', () => {
            console.log(`Server running on port ${port}`);
            console.log(`MySQL: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}`);
            console.log('Seed logins:');
            console.log('  Student: student@nitmz.ac.in / student123');
            console.log('  Caretaker BH1: caretaker-bh1@nitmz.ac.in / caretaker123');
            console.log('  Caretaker GH1: caretaker-gh1@nitmz.ac.in / caretaker123');
            console.log(`ESP32 secure endpoint: http://<YOUR_PC_IP>:${port}/api/update-location`);
            console.log(`Flutter latest endpoint: http://<YOUR_PC_IP>:${port}/api/location/latest`);
        });
    } catch (error) {
        console.error('Failed to start server:', error.message);
        process.exit(1);
    }
}

start();
