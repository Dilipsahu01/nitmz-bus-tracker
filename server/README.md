# NITMZ Bus Tracker — Server

Central backend server for the NIT Mizoram Bus Tracking System. Serves both the **Flutter mobile app** and the **web dashboard** with a unified REST API.

## Tech Stack

| Component | Technology |
|---|---|
| Runtime | Node.js (Express v5) |
| Database | Supabase (PostgreSQL) |
| Auth | JWT + bcrypt |
| Deployment | Render.com |

## Quick Start

### 1. Prerequisites

- Node.js 18+ installed
- A [Supabase](https://supabase.com) project (free tier works)

### 2. Setup

```bash
cd server
cp .env.example .env
# Edit .env with your Supabase credentials
npm install
```

### 3. Seed the Database

This creates all tables and populates them with NIT MZ hostel/bus data:

```bash
npm run seed
```

### 4. Run

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Server starts at `http://localhost:3000`

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: 3000) |
| `JWT_SECRET` | **Yes** | Secret key for signing JWT tokens |
| `API_SECRET_KEY` | **Yes** | Secret for ESP32 telemetry endpoint |
| `DATABASE_URL` | **Yes*** | Full Supabase PostgreSQL connection string |
| `DB_HOST` | Alt* | Database host |
| `DB_PORT` | Alt* | Database port (default: 5432) |
| `DB_USER` | Alt* | Database user |
| `DB_PASSWORD` | Alt* | Database password |
| `DB_NAME` | Alt* | Database name |
| `DB_SSL` | No | Enable SSL (default: true for DATABASE_URL) |

*Provide either `DATABASE_URL` OR the individual `DB_*` params.

---

## Test Accounts (Seeded)

| Role | Email | Password |
|---|---|---|
| Student | `student@nitmz.ac.in` | `student123` |
| Caretaker (BH1) | `caretaker-bh1@nitmz.ac.in` | `caretaker123` |
| Caretaker (GH1) | `caretaker-gh1@nitmz.ac.in` | `caretaker123` |

---

## API Endpoints

### Public

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Root health check |
| GET | `/api/health` | DB status + counts |
| GET | `/api/hostels` | List all hostels |
| GET | `/api/location/latest` | Latest GPS telemetry |
| GET | `/get-location` | Legacy GPS endpoint |

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login → get JWT |
| GET | `/api/me` | Current user profile |

### Protected (Bearer JWT)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/buses` | List buses (raw array) |
| GET | `/api/all-buses` | List buses (wrapped) |
| GET | `/api/buses/:busNumber` | Single bus details |
| POST | `/api/buses` | Create bus (caretaker/admin) |
| PATCH | `/api/buses/:busNumber` | Update bus (caretaker/admin) |
| PATCH | `/api/buses/:busNumber/driver` | Update driver |
| GET | `/api/schedules` | List schedules |
| POST | `/api/schedules` | Create/update schedule |
| GET | `/api/notifications` | List notifications |
| POST | `/api/notifications/send` | Send notification |

### ESP32 Telemetry (x-api-key)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/update-location` | GPS telemetry ingestion |
| POST | `/update-gps` | Legacy GPS POST |

---

## Sample curl Commands

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student@nitmz.ac.in","password":"student123"}'
```

### Get Buses (use token from login)

```bash
curl http://localhost:3000/api/buses \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Send ESP32 Telemetry

```bash
curl -X POST http://localhost:3000/api/update-location \
  -H "Content-Type: application/json" \
  -H "x-api-key: BUSTRACKESP1SECRETKEY" \
  -d '{"device_id":"ESP32-1","bus_id":"Bus 5","lat":23.7271,"lng":92.7176,"speed":18.5,"status":"moving"}'
```

### Test with ESP32 Simulator

```bash
npm run test:esp32
# Or with custom options:
python3 scripts/esp32_simulator.py --bus-id "Bus 7" --interval 2
```

---

## ESP32 Firmware Configuration

Set these in your ESP32 firmware:

```c
const char* apiEndpoint = "https://your-server.onrender.com/api/update-location";
const char* secretKey   = "YOUR_API_SECRET_KEY";
```

Required header: `x-api-key: YOUR_API_SECRET_KEY`

Payload format:
```json
{
  "device_id": "ESP32-1",
  "bus_id": "Bus 5",
  "lat": 23.7271,
  "lng": 92.7176,
  "speed": 18.5,
  "accuracy": 1.1,
  "ts": "2026-09-05T08:12:00Z",
  "status": "moving"
}
```

---

## Deployment (Render.com)

1. Push to GitHub
2. Create a new **Web Service** on Render
3. Set **Root Directory**: `server`
4. Set **Build Command**: `npm install`
5. Set **Start Command**: `npm start`
6. Add all environment variables in the Render dashboard
7. Deploy!
