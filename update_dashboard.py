import re

with open('/home/dilip_sahu/nitmz-bus-tracker/templates/index.html', 'r') as f:
    content = f.read()

# 1. Update variables
content = content.replace(
    'let map, busMarker, userMarker, userAccCircle, routePolyline;',
    'let map, busMarkers = new Map(), userMarker, userAccCircle, routePolyline;\nS.selectedBusId = null;'
)

# 2. Remove init busMarker
content = content.replace(
    "  busMarker = L.marker(DEFAULT_CENTER, { icon: buildBusIcon(0), zIndexOffset: 1000 }).addTo(map);\n  busMarker.bindPopup('<strong>Bus 1</strong><br>Main Campus Route');",
    ""
)

# 3. Modify rotateBusMarker & setPulse to take busId
content = re.sub(
    r'function rotateBusMarker\(deg\) \{([^}]+)\}',
    r'function rotateBusMarker(busId, deg) {\n  const marker = busMarkers.get(busId);\n  const el = marker && marker.getElement();\n  if (!el) return;\n  const svg = el.querySelector("#busIconSvg");\n  if (svg) svg.style.transform = `rotate(${deg}deg)`;\n  if (busId === S.selectedBusId) S.bearing = deg;\n}',
    content
)

content = re.sub(
    r'function setPulse\(moving\) \{([^}]+)\}',
    r'function setPulse(busId, moving) {\n  const marker = busMarkers.get(busId);\n  const el = marker && marker.getElement();\n  if (!el) return;\n  const p = el.querySelector(".bus-pulse");\n  if (p) { if(moving) p.classList.add("on"); else p.classList.remove("on"); }\n}',
    content
)

# 4. Modify animBus
content = re.sub(
    r'function animBus\(targetLat, targetLng, dur\) \{.*?\n\}',
    '''function animBus(busId, targetLat, targetLng, dur) {
  const marker = busMarkers.get(busId);
  if (!marker) return;
  const cur = marker.getLatLng();
  const dLat = targetLat - cur.lat;
  const dLng = targetLng - cur.lng;
  if (Math.abs(dLat)<0.000001 && Math.abs(dLng)<0.000001) return;
  
  const start = performance.now();
  requestAnimationFrame(function step(now) {
    const p = Math.min((now - start)/dur, 1);
    const ease = easeOutCubic(p);
    const cLat = cur.lat + dLat*ease;
    const cLng = cur.lng + dLng*ease;
    marker.setLatLng([cLat, cLng]);
    if (busId === S.selectedBusId && S.tracking && !S.panning) {
      map.panTo([cLat, cLng], { animate:false });
    }
    if (p < 1) requestAnimationFrame(step);
  });
}''',
    content, flags=re.DOTALL
)

# 5. Modify onBusData to take busId
content = re.sub(
    r'function onBusData\(d\) \{.*?\n\}',
    '''function onBusData(busId, d, status) {
  if (!busMarkers.has(busId)) {
    const m = L.marker([d.latitude, d.longitude], { icon: buildBusIcon(0), zIndexOffset: 1000 }).addTo(map);
    m.on('click', () => {
      S.selectedBusId = busId;
      document.getElementById('statusText').innerHTML = `Bus ${busId} <span style="font-size:10px;color:var(--muted)">(${status})</span>`;
      if (S.tracking) map.setView(m.getLatLng(), 16);
      updateStatusUI(busId, d);
    });
    busMarkers.set(busId, m);
  }
  
  const marker = busMarkers.get(busId);
  
  const wasMoving = marker._wasMoving || false;
  const isMoving = (d.speed_kmh > 2);
  setPulse(busId, isMoving);
  marker._wasMoving = isMoving;
  
  if (isMoving) {
    const cur = marker.getLatLng();
    const deg = calcHeading(cur.lat, cur.lng, d.latitude, d.longitude);
    rotateBusMarker(busId, deg);
  }
  
  animBus(busId, d.latitude, d.longitude, POLL_MS);
  
  if (busId === S.selectedBusId) {
    updateStatusUI(busId, d);
  }
}

function updateStatusUI(busId, d) {
  setConn('live');
  updateStatusBig(d.has_fix, d.speed_kmh);
  document.getElementById('rawJson').textContent = JSON.stringify(d, null, 2);
  
  if (S.userLoc) {
    const marker = busMarkers.get(busId);
    if (marker) {
      const busPos = marker.getLatLng();
      const dist = map.distance(S.userLoc, busPos);
      document.getElementById('userDistDisplay').textContent = fmtDist(dist) + ' away';
      if (!S.etaTimer) {
        S.etaTimer = setInterval(() => {
          if(!S.userLoc) return;
          const dist2 = map.distance(S.userLoc, marker.getLatLng());
          document.getElementById('userDistDisplay').textContent = fmtDist(dist2) + ' away';
        }, 2000);
      }
    }
  }
}''',
    content, flags=re.DOTALL
)

# 6. Replace fetchBus
content = re.sub(
    r'function fetchBus\(\) \{.*?\n\}',
    '''function fetchBus() {
  fetch('/api/public/buses')
    .then(r => { if(!r.ok) throw new Error(); return r.json(); })
    .then(json => {
      const buses = json.data || [];
      buses.forEach(b => {
        const mapped = {
          latitude: b.lat, longitude: b.lng, speed_kmh: b.speed,
          has_fix: b.hasFix, satellites: b.satellites, hdop: b.hdop, net_type: b.netType
        };
        onBusData(b.busNumber, mapped, b.status);
      });
      if (!S.selectedBusId && buses.length > 0) {
        // auto-select first bus just so the UI isn't empty
        S.selectedBusId = buses[0].busNumber;
        document.getElementById('statusText').innerHTML = `Bus ${S.selectedBusId} <span style="font-size:10px;color:var(--muted)">(${buses[0].status})</span>`;
      }
    })
    .catch(() => {
      setConn('offline');
      updateStatusBig(false, false);
    });
}''',
    content, flags=re.DOTALL
)

# 7. FollowBtn usage
content = content.replace(
    'if (!busMarker) return;',
    'const marker = busMarkers.get(S.selectedBusId);\n  if (!marker) return;'
)
content = content.replace(
    'const pos = busMarker.getLatLng();',
    'const pos = marker.getLatLng();'
)
content = content.replace(
    'if (!S.userLoc || !busMarker) return;',
    'const marker = busMarkers.get(S.selectedBusId);\n  if (!S.userLoc || !marker) return;'
)
content = content.replace(
    'const busPos = busMarker.getLatLng();',
    'const busPos = marker.getLatLng();'
)


with open('/home/dilip_sahu/nitmz-bus-tracker/templates/index.html', 'w') as f:
    f.write(content)
print("Updated index.html successfully.")
