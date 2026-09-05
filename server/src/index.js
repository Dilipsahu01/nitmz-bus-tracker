/**
 * NITMZ Bus Tracker — Central Server
 *
 * Unified Express.js server serving both the Flutter mobile app
 * and the web dashboard. Backed by Supabase (PostgreSQL).
 *
 * Start: npm run dev (development) | npm start (production)
 */

require('dotenv').config();

const REQUIRED_ENVS = ['JWT_SECRET', 'API_SECRET_KEY'];
for (const env of REQUIRED_ENVS) {
  if (!process.env[env]) {
    console.error(`[FATAL] Missing required environment variable: ${env}`);
    console.error('Server cannot start. Please define it in your .env file.');
    process.exit(1); // Fail-fast
  }
}

const express = require('express');
const path = require('path');

// Middleware
const corsMiddleware = require('./middleware/cors');

// Route modules
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const busRoutes = require('./routes/buses');
const scheduleRoutes = require('./routes/schedules');
const notificationRoutes = require('./routes/notifications');
const telemetryRoutes = require('./routes/telemetry');

const app = express();
const PORT = Number(process.env.PORT || 3000);

// ─── Global Middleware ───────────────────────────────────────────
app.use(corsMiddleware);
app.use(express.json());

// ─── Request Logger (dev) ────────────────────────────────────────
app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`[${ts}] ${req.method} ${req.originalUrl}`);
  }
  next();
});

// ─── API Routes ──────────────────────────────────────────────────
app.use(healthRoutes);
app.use(authRoutes);
app.use(busRoutes);
app.use(scheduleRoutes);
app.use(notificationRoutes);
app.use(telemetryRoutes);

// ─── Serve Web Dashboard ─────────────────────────────────────────
// The dashboard files are served from the project root's templates/ dir
const templatesDir = path.join(__dirname, '..', '..', 'templates');
app.use('/static', express.static(templatesDir));

app.get('/', (_req, res) => {
  res.sendFile(path.join(templatesDir, 'index.html'));
});

app.get('/dashboard', (_req, res) => {
  res.redirect('/');
});

app.get('/login', (_req, res) => {
  res.sendFile(path.join(templatesDir, 'login.html'));
});

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(templatesDir, 'admin.html'));
});

// ─── 404 Fallback ────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Global Error Handler ────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.stack || err.message || err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start Server ────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║   NITMZ Bus Tracker — Central Server              ║');
  console.log('╠═══════════════════════════════════════════════════╣');
  console.log(`║   Port       : ${PORT}                              ║`);
  console.log(`║   Dashboard  : http://localhost:${PORT}/dashboard       ║`);
  console.log(`║   API Base   : http://localhost:${PORT}/api             ║`);
  console.log('╠═══════════════════════════════════════════════════╣');
  console.log('║   Seed Logins:                                    ║');
  console.log('║     Student   : student@nitmz.ac.in / student123  ║');
  console.log('║     Caretaker : caretaker-bh1@nitmz.ac.in /       ║');
  console.log('║                 caretaker123                      ║');
  console.log('╠═══════════════════════════════════════════════════╣');
  console.log(`║   ESP32 POST : /api/update-location               ║`);
  console.log(`║   ESP32 GET  : /api/location/latest               ║`);
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log('');
});
