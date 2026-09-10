const fs = require('fs');
const path = require('path');
const https = require('https');

const MBSE = [23.749966, 92.722865];

const HOSTELS = {
  'BH1': [23.792917, 92.727789],
  'BH2': [23.794311, 92.728146],
  'BH3': [23.767378, 92.737712],
  'BH4': [23.769835, 92.737959],
  'GH1': [23.775578, 92.731044],
  'GH2': [23.784357, 92.728380]
};

const outDir = path.join(__dirname, '../data');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function fetchRoute(fLat, fLng, tLat, tLng) {
  return new Promise((resolve, reject) => {
    // Note: OSRM expects longitude,latitude
    const url = `https://router.project-osrm.org/route/v1/driving/${fLng},${fLat};${tLng},${tLat}?overview=full&geometries=geojson`;
    const options = {
      headers: {
        'User-Agent': 'NITMZ-Bus-Tracker/1.0 (Node.js)'
      }
    };
    
    https.get(url, options, (res) => {
      let data = '';
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP Status ${res.statusCode}`));
      }
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.code === 'Ok' && parsed.routes.length > 0) {
            // Convert back to [lat, lng] format for our usage
            const coords = parsed.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
            resolve(coords);
          } else {
            reject(new Error('No route found in OSRM response'));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  const routes = {};
  console.log('Fetching high-quality road coordinates from OSRM...');
  
  for (const [hostelId, coords] of Object.entries(HOSTELS)) {
    try {
      console.log(`Fetching route: ${hostelId} -> MBSE...`);
      // Add a small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 1000));
      const routeCoords = await fetchRoute(coords[0], coords[1], MBSE[0], MBSE[1]);
      routes[hostelId] = routeCoords;
      console.log(`✅ ${hostelId}: Got ${routeCoords.length} coordinate points`);
    } catch (err) {
      console.error(`❌ Failed to fetch route for ${hostelId}:`, err.message);
    }
  }

  const outFile = path.join(outDir, 'routes.json');
  fs.writeFileSync(outFile, JSON.stringify(routes, null, 2));
  console.log(`\n🎉 Saved all routes to: ${outFile}`);
  console.log('You can now use this JSON file for map-matching or high-accuracy simulation!');
}

main();
