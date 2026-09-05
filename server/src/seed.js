const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

async function runSeed() {
  const client = await pool.connect();
  try {
    console.log('Starting seed process...');
    
    // 1. Run schema.sql
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    const statements = schemaSql.split(';').map(s => s.trim()).filter(s => s.length > 0);
    
    console.log('Executing schema...');
    for (const stmt of statements) {
      await client.query(stmt);
    }
    
    // 2. Seed hostels
    console.log('Seeding hostels...');
    const hostels = [
      ['GH1', 'GH1', 'Girls', "Girls' Hostel 1"],
      ['GH2', 'GH2', 'Girls', "Girls' Hostel 2"],
      ['BH1', 'BH1', 'Boys', "Boys' Hostel 1"],
      ['BH2', 'BH2', 'Boys', "Boys' Hostel 2"],
      ['BH3', 'BH3', 'Boys', "Boys' Hostel 3"],
      ['BH4', 'BH4', 'Boys', "Boys' Hostel 4"]
    ];
    
    for (const [id, name, type, fullName] of hostels) {
      await client.query(
        `INSERT INTO hostels (id, name, type, full_name) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
        [id, name, type, fullName]
      );
    }
    
    // 3. Seed users
    console.log('Seeding users...');
    const users = [
      ['caretaker-gh1', 'GH1 Caretaker', 'caretaker-gh1@nitmz.ac.in', 'caretaker123', 'caretaker', 'GH1'],
      ['caretaker-gh2', 'GH2 Caretaker', 'caretaker-gh2@nitmz.ac.in', 'caretaker123', 'caretaker', 'GH2'],
      ['caretaker-bh1', 'BH1 Caretaker', 'caretaker-bh1@nitmz.ac.in', 'caretaker123', 'caretaker', 'BH1'],
      ['caretaker-bh2', 'BH2 Caretaker', 'caretaker-bh2@nitmz.ac.in', 'caretaker123', 'caretaker', 'BH2'],
      ['caretaker-bh3', 'BH3 Caretaker', 'caretaker-bh3@nitmz.ac.in', 'caretaker123', 'caretaker', 'BH3'],
      ['caretaker-bh4', 'BH4 Caretaker', 'caretaker-bh4@nitmz.ac.in', 'caretaker123', 'caretaker', 'BH4'],
      ['student-bh1', 'Anshul Student', 'student@nitmz.ac.in', 'student123', 'student', 'BH1']
    ];
    
    for (const [id, name, email, password, role, hostelId] of users) {
      const hash = await bcrypt.hash(password, 10);
      await client.query(
        `INSERT INTO users (id, name, email, password_hash, role, hostel_id) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (email) DO NOTHING`,
        [id, name, email, hash, role, hostelId]
      );
    }
    
    // 4. Seed buses, drivers, schedules
    console.log('Seeding buses, drivers, and schedules...');
    const busesData = [
      [1, 'GH1', 'Pa Hlutea', '9436168711', 23.7285, 92.7180, 'idle', '8:30 AM', '1:30 PM'],
      [2, 'GH1', 'Pu Stephen', '8787778119', 23.7260, 92.7165, 'running', '9:15 AM', '4:30 PM'],
      [3, 'GH1', 'Mawizuala', '8131811729', 23.7290, 92.7200, 'idle', '8:30 AM', '5:30 PM'],
      [4, 'GH2', 'Hruaia', '6909101103', 23.7240, 92.7150, 'running', '8:15 AM', '4:30 PM'],
      [5, 'BH1', 'Chhuanga', '9862369186', 23.7275, 92.7185, 'running', '8:15 AM', '5:30 PM'],
      [6, 'BH1', 'Pa Dina', '9615408299', 23.7265, 92.7170, 'idle', '8:15 AM', '7:00 PM'],
      [7, 'BH1', 'Vk-a', '7005367693', 23.7280, 92.7195, 'running', '8:15 PM', '5:30 PM'],
      [8, 'BH1', 'Dama', '7005364878', 23.7255, 92.7160, 'idle', '6:30 AM', '12:30 PM'],
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
      [22, 'GH2', 'Saka', '9378074359', 23.7245, 92.7152, 'running', '8:25 AM', '5:30 PM']
    ];
    
    const today = new Date().toISOString().split('T')[0];
    
    for (const data of busesData) {
      const [busNumber, hostel, driverName, driverPhone, lat, lng, status, time1, time2] = data;
      
      // Bus
      await client.query(
        `INSERT INTO buses (bus_number, assigned_hostel, status, latitude, longitude) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (bus_number) DO UPDATE SET status = EXCLUDED.status, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude`,
        [busNumber, hostel, status, lat, lng]
      );
      
      // Driver
      await client.query(
        `INSERT INTO drivers (id, bus_number, name, phone) VALUES ($1, $2, $3, $4) ON CONFLICT (bus_number) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone`,
        [`drv${busNumber}`, busNumber, driverName, driverPhone]
      );
      
      // Schedule
      await client.query(
        `INSERT INTO schedules (id, bus_number, date, from_hostel_time, from_mbse_time, updated_by) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (bus_number, date) DO UPDATE SET from_hostel_time = EXCLUDED.from_hostel_time, from_mbse_time = EXCLUDED.from_mbse_time`,
        [`sch${busNumber}-${today}`, busNumber, today, time1, time2, 'system']
      );
    }
    
    // 5. Seed notifications
    console.log('Seeding notifications...');
    const notifications = [
      ['n1', 'Bus 5 Departure Alert', 'Bus 5 will depart from BH1 at 8:15 AM. Please be ready!', 'departure', 5, 'BH1'],
      ['n2', 'Bus 7 Schedule Update', 'Bus 7 schedule updated. From Hostel: 8:15 PM, From MBSE: 5:30 PM', 'general', 7, 'BH1'],
      ['n3', 'Bus 2 Arriving Soon', 'Bus 2 (GH1) is 1 km away from hostel. ETA: 5 minutes!', 'arrival', 2, 'GH1'],
      ['n4', 'Bus 9 Maintenance', 'Bus 9 is under maintenance today. Please use alternate buses.', 'delay', 9, 'BH1']
    ];
    
    for (const [id, title, message, type, busNumber, targetHostel] of notifications) {
      await client.query(
        `INSERT INTO notifications (id, title, message, type, bus_number, target_hostel) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
        [id, title, message, type, busNumber, targetHostel]
      );
    }
    
    // 6. Seed telemetry
    console.log('Seeding telemetry...');
    await client.query(
      `INSERT INTO telemetry (device_id, bus_id, lat, lng, speed, accuracy, has_fix, satellites, hdop, net_type, ts, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      ['ESP32-1', '5', 23.7275, 92.7185, 0, 1.0, true, 7, 1.2, 'WiFi', new Date().toISOString(), 'idle']
    );
    
    console.log('Seed completed successfully!');
  } catch (error) {
    console.error('Seed error:', error);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

runSeed();
