-- 1. hostels
CREATE TABLE IF NOT EXISTS hostels (
  id VARCHAR(10) PRIMARY KEY,
  name VARCHAR(20) NOT NULL,
  type VARCHAR(20) NOT NULL,
  full_name VARCHAR(100) NOT NULL
);

-- 2. users (password_hash instead of password!)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(40) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'student',
  hostel_id VARCHAR(10) REFERENCES hostels(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. buses
CREATE TABLE IF NOT EXISTS buses (
  bus_number INT PRIMARY KEY,
  assigned_hostel VARCHAR(10) NOT NULL REFERENCES hostels(id),
  status VARCHAR(20) NOT NULL DEFAULT 'idle',
  latitude NUMERIC(10,6) NOT NULL DEFAULT 23.7271,
  longitude NUMERIC(10,6) NOT NULL DEFAULT 92.7176,
  speed NUMERIC(8,2) NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  route VARCHAR(120) NOT NULL DEFAULT 'Hostel ↔ MBSE',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. drivers (1:1 with bus)
CREATE TABLE IF NOT EXISTS drivers (
  id VARCHAR(40) PRIMARY KEY,
  bus_number INT NOT NULL UNIQUE REFERENCES buses(bus_number) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- 5. schedules
CREATE TABLE IF NOT EXISTS schedules (
  id VARCHAR(40) PRIMARY KEY,
  bus_number INT NOT NULL REFERENCES buses(bus_number) ON DELETE CASCADE,
  date DATE NOT NULL,
  from_hostel_time VARCHAR(20) NOT NULL,
  from_mbse_time VARCHAR(20) NOT NULL,
  special_note VARCHAR(255),
  updated_by VARCHAR(120),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bus_number, date)
);

-- 6. notifications
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(40) PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'general',
  bus_number INT,
  target_hostel VARCHAR(10) REFERENCES hostels(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  is_read BOOLEAN NOT NULL DEFAULT false,
  sent_by VARCHAR(120)
);

-- 7. telemetry (stores full ESP32 diagnostic payload)
CREATE TABLE IF NOT EXISTS telemetry (
  id BIGSERIAL PRIMARY KEY,
  device_id VARCHAR(60),
  bus_id VARCHAR(40),
  lat NUMERIC(10,6) NOT NULL,
  lng NUMERIC(10,6) NOT NULL,
  speed NUMERIC(8,2) NOT NULL DEFAULT 0,
  accuracy NUMERIC(8,2) NOT NULL DEFAULT 1.0,
  has_fix BOOLEAN DEFAULT false,
  satellites INT DEFAULT 0,
  hdop NUMERIC(6,2) DEFAULT 99.9,
  net_type VARCHAR(20) DEFAULT 'unknown',
  ts VARCHAR(64),
  status VARCHAR(20) NOT NULL DEFAULT 'idle',
  received_at TIMESTAMPTZ DEFAULT NOW()
);
