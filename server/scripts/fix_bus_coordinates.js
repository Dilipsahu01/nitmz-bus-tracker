const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { pool } = require('../src/db');

const HOSTEL_COORDS = {
  'BH1': [23.792917, 92.727789],
  'BH2': [23.794311, 92.728146],
  'BH3': [23.767378, 92.737712],
  'BH4': [23.769835, 92.737959],
  'GH1': [23.775578, 92.731044],
  'GH2': [23.784357, 92.728380]
};

async function fixCoordinates() {
  const client = await pool.connect();
  try {
    console.log('Fetching all buses...');
    const result = await client.query('SELECT bus_number, assigned_hostel FROM buses');
    
    for (const bus of result.rows) {
      const hostel = bus.assigned_hostel;
      if (HOSTEL_COORDS[hostel]) {
        const [lat, lng] = HOSTEL_COORDS[hostel];
        await client.query(
          'UPDATE buses SET latitude = $1, longitude = $2, status = $3, speed = 0 WHERE bus_number = $4',
          [lat, lng, 'idle', bus.bus_number]
        );
        console.log(`✅ Snapped Bus ${bus.bus_number} to ${hostel} [${lat}, ${lng}]`);
      } else {
        console.warn(`⚠️ Warning: Unknown hostel '${hostel}' for Bus ${bus.bus_number}`);
      }
    }
    
    console.log('🎉 Successfully fixed all bus coordinates!');
  } catch (err) {
    console.error('❌ Error fixing coordinates:', err);
  } finally {
    client.release();
    pool.end();
  }
}

fixCoordinates();
