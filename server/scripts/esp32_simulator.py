#!/usr/bin/env python3
"""
ESP32 GPS Telemetry Fleet Simulator for NITMZ Bus Tracker.

Simulates the entire fleet of 22 buses. Selects a few to actively run 
routes between their assigned hostels and the MBSE campus, while the rest
remain parked (idle) at their hostels.
"""
import argparse
import json
import random
import time
import threading
from datetime import datetime, timezone
from urllib import error, request

# Coordinates for all locations
MBSE_COORDS = (23.749966, 92.722865)

HOSTELS = {
    'BH1': (23.792917, 92.727789),
    'BH2': (23.794311, 92.728146),
    'BH3': (23.767378, 92.737712),
    'BH4': (23.769835, 92.737959),
    'GH1': (23.775578, 92.731044),
    'GH2': (23.784357, 92.728380)
}

# Bus Number -> Assigned Hostel
BUSES = {
    1: 'GH1', 2: 'GH1', 3: 'GH1', 4: 'GH2', 
    5: 'BH1', 6: 'BH1', 7: 'BH1', 8: 'BH1', 9: 'BH1', 10: 'BH1', 11: 'BH1', 12: 'BH1', 
    13: 'BH2', 14: 'BH2', 15: 'BH2', 
    16: 'BH3', 17: 'BH3', 18: 'BH3', 19: 'BH3', 20: 'BH3', 
    21: 'BH4', 22: 'GH2'
}

def lerp(a, b, t):
    """Linear interpolation between two (lat,lng) points."""
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

def send_packet(url, api_key, payload, timeout=6.0):
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url=url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
        },
    )
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8")
    except error.HTTPError as http_err:
        return http_err.code, http_err.read().decode("utf-8", errors="ignore")
    except Exception as exc:
        return 0, str(exc)

class BusSimulator:
    def __init__(self, bus_number, hostel, is_running):
        self.bus_number = bus_number
        self.hostel = hostel
        self.is_running = is_running
        
        self.hostel_coords = HOSTELS[self.hostel]
        self.mbse_coords = MBSE_COORDS
        
        # Current state
        self.sub_t = random.uniform(0.0, 1.0) if self.is_running else 0.0
        self.direction = random.choice([1, -1]) if self.is_running else 0
        self.lat, self.lng = lerp(self.hostel_coords, self.mbse_coords, self.sub_t)
        
    def tick(self):
        if self.is_running:
            # Move along the route
            speed_kmh = random.uniform(15.0, 35.0)
            
            # Advance interpolation t based on a pseudo-speed 
            # (In reality, we just add a small delta)
            delta = random.uniform(0.02, 0.05) * self.direction
            self.sub_t += delta
            
            if self.sub_t >= 1.0:
                self.sub_t = 1.0
                self.direction = -1
            elif self.sub_t <= 0.0:
                self.sub_t = 0.0
                self.direction = 1
                
            self.lat, self.lng = lerp(self.hostel_coords, self.mbse_coords, self.sub_t)
            
            # Add small noise to simulate GPS drift
            noise_lat = random.uniform(-0.00005, 0.00005)
            noise_lng = random.uniform(-0.00005, 0.00005)
            
            status_text = "active"
        else:
            # Idle at hostel
            self.lat, self.lng = self.hostel_coords
            noise_lat = random.uniform(-0.00002, 0.00002)
            noise_lng = random.uniform(-0.00002, 0.00002)
            speed_kmh = 0.0
            status_text = "idle"

        return {
            "device_id": f"ESP32-BUS-{self.bus_number}",
            "bus_id": str(self.bus_number),
            "has_fix": True,
            "latitude": round(self.lat + noise_lat, 6),
            "longitude": round(self.lng + noise_lng, 6),
            "speed_kmh": round(speed_kmh, 1),
            "satellites": random.randint(6, 12),
            "hdop": round(random.uniform(0.7, 1.5), 1),
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "status": status_text,
            "net_type": random.choice(["GSM", "WiFi"])
        }

def main():
    parser = argparse.ArgumentParser(description="Simulate entire NITMZ Bus Fleet")
    parser.add_argument("--host", default="127.0.0.1", help="Server host")
    parser.add_argument("--port", type=int, default=3000, help="Server port")
    parser.add_argument("--https", action="store_true", help="Use HTTPS")
    parser.add_argument("--interval", type=float, default=2.0, help="Seconds between fleet updates")
    parser.add_argument("--api-key", default="BUSTRACKESP1SECRETKEY", help="x-api-key header")
    parser.add_argument("--active-count", type=int, default=6, help="Number of active buses")
    args = parser.parse_args()

    protocol = "https" if args.https else "http"
    url = f"{protocol}://{args.host}:{args.port}/api/update-location"
    
    print(f"🛰️  NITMZ Fleet Simulator")
    print(f"   Endpoint: {url}")
    print(f"   Total Buses: {len(BUSES)} | Active: {args.active_count}")
    print(f"   Interval: {args.interval}s")
    print(f"   Press Ctrl+C to stop.\n")

    # Pick random buses to be active
    active_bus_ids = random.sample(list(BUSES.keys()), min(args.active_count, len(BUSES)))
    
    simulators = []
    for bus_num, hostel in BUSES.items():
        is_active = bus_num in active_bus_ids
        simulators.append(BusSimulator(bus_num, hostel, is_active))

    print(f"🚌 Active Buses: {', '.join(map(str, active_bus_ids))}\n")

    try:
        while True:
            for sim in simulators:
                payload = sim.tick()
                
                # Send asynchronously in a quick thread so one slow response doesn't block the fleet
                def post_data(p=payload):
                    status, body = send_packet(url, args.api_key, p)
                    if status != 200:
                        print(f"  [Bus {p['bus_id']}] ❌ Error: {status} {body[:50]}")

                threading.Thread(target=post_data, daemon=True).start()
                
                # Tiny stagger between bus requests
                time.sleep(0.05)
            
            ts = datetime.now().strftime("%H:%M:%S")
            print(f"[{ts}] 📡 Broadcasted updates for {len(simulators)} buses")
            time.sleep(args.interval)

    except KeyboardInterrupt:
        print(f"\n✅ Simulation stopped.")

if __name__ == "__main__":
    main()
