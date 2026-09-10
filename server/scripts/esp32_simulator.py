#!/usr/bin/env python3
"""
Advanced ESP32 GPS Telemetry Fleet Simulator for NITMZ Bus Tracker.

Simulates 22 ESP32 nodes using asyncio, full state machines (SLEEP, ACTIVE, LAYOVER),
battery management logic, realistic route interpolation, and network outages with a 10-packet local buffer.
"""
import argparse
import json
import random
import os
import time
import asyncio
from datetime import datetime, timezone
from urllib import error, request
from collections import deque

# --- ANSI Colors for Terminal ---
RESET = "\033[0m"
DIM = "\033[2m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
MAGENTA = "\033[95m"

MBSE_COORDS = (23.749966, 92.722865)
HOSTELS = {
    'BH1': (23.792917, 92.727789), 'BH2': (23.794311, 92.728146),
    'BH3': (23.767378, 92.737712), 'BH4': (23.769835, 92.737959),
    'GH1': (23.775578, 92.731044), 'GH2': (23.784357, 92.728380)
}

BUSES = {
    1: 'GH1', 2: 'GH1', 3: 'GH1', 4: 'GH2', 
    5: 'BH1', 6: 'BH1', 7: 'BH1', 8: 'BH1', 9: 'BH1', 10: 'BH1', 11: 'BH1', 12: 'BH1', 
    13: 'BH2', 14: 'BH2', 15: 'BH2', 
    16: 'BH3', 17: 'BH3', 18: 'BH3', 19: 'BH3', 20: 'BH3', 
    21: 'BH4', 22: 'GH2'
}

ROUTES = {}
routes_path = os.path.join(os.path.dirname(__file__), '../data/routes.json')
if os.path.exists(routes_path):
    try:
        with open(routes_path, 'r') as f:
            ROUTES = json.load(f)
    except Exception as e:
        print(f"{RED}Failed to load routes.json: {e}{RESET}")

def lerp(a, b, t):
    """Fallback linear interpolation."""
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

def get_point_along_route(route_coords, t):
    """Interpolate precisely along a polyline of coordinates."""
    if not route_coords: return (0, 0)
    if t <= 0: return route_coords[0]
    if t >= 1.0: return route_coords[-1]
    
    total_segments = len(route_coords) - 1
    exact_idx = t * total_segments
    base_idx = int(exact_idx)
    remainder = exact_idx - base_idx
    
    if base_idx >= total_segments: return route_coords[-1]
    return lerp(route_coords[base_idx], route_coords[base_idx + 1], remainder)

def sync_send_packet(url, api_key, payload, timeout=6.0):
    """Synchronous HTTP POST via urllib."""
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json", "x-api-key": api_key,
    })
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8")
    except error.HTTPError as http_err:
        return http_err.code, http_err.read().decode("utf-8", errors="ignore")
    except Exception as exc:
        return 0, str(exc)

class ESP32Node:
    def __init__(self, bus_number, hostel, is_active, url, api_key):
        self.bus_number = bus_number
        self.hostel = hostel
        self.url = url
        self.api_key = api_key
        
        # State Machine
        self.state = "ACTIVE" if is_active else "SLEEP"
        self.route = ROUTES.get(self.hostel, [])
        self.hostel_coords = HOSTELS[self.hostel]
        self.mbse_coords = MBSE_COORDS
        
        # Physics & Hardware Simulation
        self.sub_t = random.uniform(0.0, 1.0) if self.state == "ACTIVE" else 0.0
        self.direction = random.choice([1, -1]) if self.state == "ACTIVE" else 1
        self.lat, self.lng = self.hostel_coords
        self.battery_pct = random.randint(70, 100)
        
        # Network Outage Buffer (10 packets max circular buffer)
        self.is_offline = False
        self.buffer = deque(maxlen=10)
        
        # Timers
        self.layover_end_time = 0

    async def send_payload(self, payload, is_flush=False):
        """Asynchronously sends data and handles simulated network drops."""
        # 5% chance of network failure in the hills!
        if random.random() < 0.05:
            self.is_offline = True

        if self.is_offline:
            # Buffer the payload
            self.buffer.append(payload)
            print(f"{RED}[Bus {self.bus_number}] 📶 NETWORK DROP - Buffered packet ({len(self.buffer)}/10) | State: {self.state}{RESET}")
            
            # 20% chance to reconnect on the next tick
            if random.random() < 0.20:
                self.is_offline = False
            return False

        # If we reconnected and have a buffer, flush it first!
        if len(self.buffer) > 0 and not is_flush:
            print(f"{CYAN}[Bus {self.bus_number}] 🔄 RECONNECTED - Flushing {len(self.buffer)} buffered packets!{RESET}")
            while self.buffer:
                old_payload = self.buffer.popleft()
                old_payload["buffered_packets"] = len(self.buffer)
                await asyncio.to_thread(sync_send_packet, self.url, self.api_key, old_payload)
                await asyncio.sleep(0.1) # small delay between rapid bursts

        # Send Live Payload
        status, _ = await asyncio.to_thread(sync_send_packet, self.url, self.api_key, payload)
        if status != 200:
            print(f"{RED}[Bus {self.bus_number}] ❌ API Error {status}{RESET}")
            return False
        return True

    async def run(self):
        """Main async loop for this specific ESP32 node."""
        while True:
            current_time = time.time()
            speed_kmh = 0.0
            status_text = "idle"
            
            # STATE: SLEEP
            if self.state == "SLEEP":
                self.lat, self.lng = self.hostel_coords
                noise_lat = random.uniform(-0.00001, 0.00001)
                noise_lng = random.uniform(-0.00001, 0.00001)
                await asyncio.sleep(300) # Deep sleep for 5 minutes
                print(f"{DIM}[Bus {self.bus_number}] 💤 Heartbeat (Parked at {self.hostel}){RESET}")
            
            # STATE: LAYOVER
            elif self.state == "LAYOVER":
                self.lat, self.lng = self.mbse_coords if self.sub_t >= 1.0 else self.hostel_coords
                noise_lat = random.uniform(-0.00002, 0.00002)
                noise_lng = random.uniform(-0.00002, 0.00002)
                
                if current_time >= self.layover_end_time:
                    self.state = "ACTIVE"
                    print(f"{GREEN}[Bus {self.bus_number}] 🚌 Layover ended. Resuming route!{RESET}")
                else:
                    await asyncio.sleep(5)
                    continue # Wait out the layover without sending high-freq packets

            # STATE: ACTIVE
            elif self.state == "ACTIVE":
                speed_kmh = random.uniform(15.0, 40.0)
                delta = random.uniform(0.015, 0.04) * self.direction
                self.sub_t += delta
                
                # Check for Arrival / Layover Transition
                if self.sub_t >= 1.0 or self.sub_t <= 0.0:
                    self.sub_t = 1.0 if self.sub_t >= 1.0 else 0.0
                    self.direction *= -1
                    self.state = "LAYOVER"
                    # Wait 2-3 minutes
                    layover_seconds = random.randint(120, 180)
                    self.layover_end_time = current_time + layover_seconds
                    loc_name = "MBSE" if self.sub_t == 1.0 else self.hostel
                    print(f"{YELLOW}[Bus {self.bus_number}] 🛑 Arrived at {loc_name}. Layover for {layover_seconds}s.{RESET}")
                
                if self.route:
                    self.lat, self.lng = get_point_along_route(self.route, self.sub_t)
                else:
                    self.lat, self.lng = lerp(self.hostel_coords, self.mbse_coords, self.sub_t)
                
                noise_lat = random.uniform(-0.00005, 0.00005)
                noise_lng = random.uniform(-0.00005, 0.00005)
                status_text = "active"
                
                # Drain battery slowly while active
                if random.random() < 0.1:
                    self.battery_pct = max(0, self.battery_pct - 1)

            # Build Payload (Matches telemetry.js schema exactly, while fulfilling prompt's extra requirements)
            payload = {
                "device_id": f"ESP32-BUS-{self.bus_number}",
                "bus_id": str(self.bus_number),
                "has_fix": True,
                "latitude": round(self.lat + noise_lat, 6),
                "longitude": round(self.lng + noise_lng, 6),
                "speed_kmh": round(speed_kmh, 1),
                "satellites": random.randint(8, 12),
                "hdop": round(random.uniform(0.7, 1.2), 1),
                "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "status": status_text,
                "net_type": random.choice(["GSM", "WiFi"]),
                
                # Extra requested fields 
                "state": self.state,
                "battery_pct": self.battery_pct,
                "buffered_packets": len(self.buffer)
            }

            # Attempt transmission
            success = await self.send_payload(payload)
            if success and self.state == "ACTIVE":
                print(f"{GREEN}[Bus {self.bus_number}] 📡 LIVE | {payload['latitude']:.5f}, {payload['longitude']:.5f} | {payload['speed_kmh']}km/h | {self.battery_pct}%{RESET}")
            
            # Active buses update every 3-5 seconds
            if self.state == "ACTIVE":
                await asyncio.sleep(random.uniform(3.0, 5.0))

async def main_loop():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=3000)
    parser.add_argument("--https", action="store_true")
    parser.add_argument("--api-key", default="BUSTRACKESP1SECRETKEY")
    parser.add_argument("--active-count", type=int, default=6)
    args = parser.parse_args()

    protocol = "https" if args.https else "http"
    url = f"{protocol}://{args.host}:{args.port}/api/update-location"
    
    print(f"{MAGENTA}=========================================={RESET}")
    print(f"{MAGENTA} 🛰️  NITMZ Fleet Architecture Simulator{RESET}")
    print(f"{MAGENTA}=========================================={RESET}")
    print(f" Endpoint: {url}")
    print(f" Total Nodes: {len(BUSES)} | Active: {args.active_count}")
    
    active_bus_ids = random.sample(list(BUSES.keys()), min(args.active_count, len(BUSES)))
    print(f" Active IDs: {', '.join(map(str, active_bus_ids))}\n")

    nodes = []
    for bus_num, hostel in BUSES.items():
        is_active = bus_num in active_bus_ids
        nodes.append(ESP32Node(bus_num, hostel, is_active, url, args.api_key))

    # Run all node async loops concurrently
    tasks = [asyncio.create_task(node.run()) for node in nodes]
    await asyncio.gather(*tasks)

if __name__ == "__main__":
    try:
        asyncio.run(main_loop())
    except KeyboardInterrupt:
        print(f"\n{RED}✅ Simulation halted safely.{RESET}")
