const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.mpqqsfiucgdhhiqsgypn:nitmizoram%402009@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
  ssl: { rejectUnauthorized: false }
});

async function runUpdate() {
  try {
    await client.connect();
    console.log('Connected to Supabase DB.');
    
    const updates = [
      { range: [1, 2, 3], hostel: 'GH1' },
      { range: [4, 22], hostel: 'GH2' },
      { range: [5, 6, 7, 8, 9, 10, 11, 12], hostel: 'BH1' },
      { range: [13, 14, 15], hostel: 'BH2' },
      { range: [16, 17, 18, 19, 20], hostel: 'BH3' },
      { range: [21], hostel: 'BH4' }
    ];

    for (const group of updates) {
      for (const bus of group.range) {
        await client.query(`
          UPDATE buses SET assigned_hostel = $2 WHERE bus_number = $1
        `, [bus, group.hostel]);
      }
    }

    // Remove the extra buses that were created
    await client.query(`DELETE FROM buses WHERE bus_number IN (23, 25, 26)`);
    
    console.log('Successfully reverted bus hostel assignments to original state!');
    
  } catch (err) {
    console.error('Update failed:', err.message);
  } finally {
    await client.end();
  }
}

runUpdate();
