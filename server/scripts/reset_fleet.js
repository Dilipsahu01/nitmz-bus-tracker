const { query } = require('../src/db');
const { redisClient, redisSub } = require('../src/redis');

const HOSTELS = {
  'BH1': { lat: 23.792917, lng: 92.727789 },
  'BH2': { lat: 23.794311, lng: 92.728146 },
  'BH3': { lat: 23.767378, lng: 92.737712 },
  'BH4': { lat: 23.769835, lng: 92.737959 },
  'GH1': { lat: 23.775578, lng: 92.731044 },
  'GH2': { lat: 23.784357, lng: 92.728380 }
};

async function resetFleet() {
  console.log('🔄 Initiating full fleet reset...');

  try {
    // 1. Fetch all buses
    const buses = await query('SELECT bus_number, assigned_hostel FROM buses');

    for (const bus of buses) {
      const hostelCoords = HOSTELS[bus.assigned_hostel];
      if (!hostelCoords) {
        console.warn(`⚠️ Warning: Unknown hostel '${bus.assigned_hostel}' for Bus ${bus.bus_number}`);
        continue;
      }

      const { lat, lng } = hostelCoords;

      // 2. Update Database
      await query(
        `UPDATE buses SET latitude = $1, longitude = $2, speed = 0, status = 'idle', updated_at = NOW() WHERE bus_number = $3`,
        [lat, lng, bus.bus_number]
      );

      // 3. Update Redis Hot Cache & Pub/Sub
      const cacheEntry = {
        bus_id: String(bus.bus_number),
        bus_number: bus.bus_number,
        lat: lat,
        lng: lng,
        speed: 0,
        status: 'idle',
        ts: new Date().toISOString()
      };

      if (redisClient && redisClient.isOpen) {
        await redisClient.hSet('hotCache', String(bus.bus_number), JSON.stringify(cacheEntry));
        await redisClient.publish('live_update', JSON.stringify(cacheEntry));
      }

      console.log(`✅ Reset Bus ${bus.bus_number} -> Parked at ${bus.assigned_hostel} (${lat}, ${lng})`);
    }

    console.log('🎉 Fleet reset complete! All buses are now idle at their hostels.');
  } catch (error) {
    console.error('❌ Error resetting fleet:', error);
  } finally {
    process.exit(0);
  }
}

resetFleet();
