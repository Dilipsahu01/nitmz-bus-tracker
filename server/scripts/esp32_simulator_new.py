#!/usr/bin/env python3
"""
Hyper-Realistic ESP32 GPS Telemetry Fleet Simulator for NITMZ Bus Tracker.

Simulates 22 ESP32 nodes using asyncio, full state machines, realistic hardware
behaviors (cold starts, multipath jitter, NO_FIX), motion physics (traffic, acceleration),
and robust network handling (dead zones, exponential backoff).
"""
import argparse
import json
import random
import os
import time
import asyncio
import math
from datetime import datetime, timezone, timedelta
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
BLUE = "\033[94m"

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
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

def get_point_along_route(route_coords, t):
    if not route_coords: return (0, 0)
    if t <= 0: return route_coords[0]
    if t >= 1.0: return route_coords[-1]
    
    total_segments = len(route_coords) - 1
    exact_idx = t * total_segments
    base_idx = int(exact_idx)
    remainder = exact_idx - base_idx
    
    if base_idx >= total_segments: return route_coords[-1]
    return lerp(route_coords[base_idx], route_coords[base_idx + 1], remainder)

def haversine(lat1, lon1, lat2, lon2):
    """Calculate distance in meters"""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def sync_send_packet(url, api_key, payload, timeout=6.0):
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

class FleetManager:
    def __init__(self, min_active=1, max_active=3):
        self.nodes = []
        self.min_active = min_active
        self.max_active = max_active
        self.current_day = datetime.now(timezone.utc).day
        self.is_holiday = False
        self.peak_multiplier = 1.0
        
    def roll_daily_schedule(self):
        self.is_holiday = random.random() < 0.1 # 10% chance of a Sunday/Holiday
        if self.is_holiday:
            print(f"\n{CYAN}📅 FLEET SCHEDULER: Today is a Holiday! Fleet operating at minimum capacity.{RESET}")
        else:
            print(f"\n{CYAN}📅 FLEET SCHEDULER: New Day! Re-rolling active fleet distributions...{RESET}")
            
        hostel_pools = {}
        for node in self.nodes:
            if node.hostel not in hostel_pools:
                hostel_pools[node.hostel] = []
            hostel_pools[node.hostel].append(node)
            
        total_active = 0
        for hostel, pool in hostel_pools.items():
            pool_size = len(pool)
            if self.is_holiday:
                target_active = 0 if pool_size == 1 else 1
            else:
                target_active = min(pool_size, random.randint(self.min_active, self.max_active))
                if pool_size == 1: target_active = 1
                
            active_buses = random.sample(pool, target_active)
            for node in pool:
                if node in active_buses:
                    node.force_state("ACTIVE")
                else:
                    node.force_state("SLEEP")
            total_active += target_active
            print(f"   [{hostel}] {target_active}/{pool_size} buses active.")
            
        print(f"{CYAN}   Total Fleet Active: {total_active}/{len(self.nodes)}{RESET}\n")

    def update_time_of_day(self):
        now = datetime.now(timezone.utc)
        if now.day != self.current_day:
            self.current_day = now.day
            self.roll_daily_schedule()
            
        # Peak hours: 7:30-9:30 AM (UTC+5:30 -> UTC 2:00-4:00) and 4:00-6:00 PM (UTC 10:30-12:30)
        # Simplified for simulation: just randomly modulate peak multiplier
        hour = now.hour
        is_peak = (2 <= hour <= 4) or (10 <= hour <= 12)
        self.peak_multiplier = 1.5 if is_peak and not self.is_holiday else 1.0

class ESP32Node:
    def __init__(self, bus_number, hostel, url, api_key, fleet_mgr):
        self.bus_number = bus_number
        self.hostel = hostel
        self.url = url
        self.api_key = api_key
        self.fleet_mgr = fleet_mgr
        
        # Hardware Config
        self.report_interval = random.choice([3.0, 5.0, 7.0, 10.0]) # Firmware config variance
        self.battery_pct = random.randint(30, 100)
        self.state = "OFF"
        self.is_offline = False
        self.buffer = deque(maxlen=20)
        self.backoff_time = 1.0
        
        # GPS/Location
        self.lat, self.lng = HOSTELS[self.hostel]
        self.has_fix = False
        self.satellites = 0
        self.hdop = 99.9
        self.route = ROUTES.get(self.hostel, [])
        self.hostel_coords = HOSTELS[self.hostel]
        
        # Physics
        self.sub_t = 0.0
        self.direction = 1
        self.current_speed = 0.0
        self.target_speed = 0.0
        self.traffic_pause_until = 0
        self.layover_end_time = 0

    def force_state(self, new_state):
        if self.state != new_state:
            self.state = new_state
            if new_state == "ACTIVE":
                self.sub_t = random.uniform(0.1, 0.9)
                self.direction = random.choice([-1, 1])
                self.state = "ACQUIRING" # Hardware boots up
            else:
                self.sub_t = 0.0
                self.current_speed = 0.0

    async def send_payload(self, payload, is_flush=False):
        """Send data with geographic dead zones and exponential backoff."""
        # Geographic Dead Zone (near middle of route in hills)
        in_dead_zone = 0.4 < self.sub_t < 0.6
        drop_chance = 0.60 if in_dead_zone else 0.02
        
        if random.random() < drop_chance:
            self.is_offline = True

        if self.is_offline:
            self.buffer.append(payload)
            if not in_dead_zone and random.random() < 0.3: # Recover faster outside dead zone
                self.is_offline = False
                self.backoff_time = 1.0
            else:
                # Exponential backoff on retries (simulating modem reconnection)
                await asyncio.sleep(self.backoff_time)
                self.backoff_time = min(16.0, self.backoff_time * 2)
            return False

        # Flush Buffer (Preserving original timestamps!)
        if len(self.buffer) > 0 and not is_flush:
            print(f"{CYAN}[Bus {self.bus_number}] 🔄 Modem Reconnected - Flushing {len(self.buffer)} packets{RESET}")
            while self.buffer:
                old_payload = self.buffer.popleft()
                old_payload["buffered_packets"] = len(self.buffer)
                await asyncio.to_thread(sync_send_packet, self.url, self.api_key, old_payload)
                await asyncio.sleep(0.1)

        status, _ = await asyncio.to_thread(sync_send_packet, self.url, self.api_key, payload)
        if status != 200:
            return False
        return True

    def calculate_gps(self):
        """Simulate NEO-6M module physics."""
        if self.state in ["OFF", "SLEEP"]:
            self.has_fix = False
            self.satellites = 0
            self.hdop = 99.9
            return

        if self.state == "ACQUIRING":
            self.has_fix = False
            self.satellites = random.randint(0, 3)
            self.hdop = round(random.uniform(10.0, 20.0), 1)
            return

        # Active Fix
        self.has_fix = True
        
        # Tree cover / tunnels drop satellites
        in_tunnel = 0.48 < self.sub_t < 0.52
        if in_tunnel:
            self.satellites = random.randint(2, 4)
            self.has_fix = False
        else:
            self.satellites = random.randint(7, 12)
            
        # Correlate HDOP directly to Satellites
        if self.satellites < 4:
            self.hdop = round(random.uniform(5.0, 15.0), 1)
        elif self.satellites < 7:
            self.hdop = round(random.uniform(2.0, 4.9), 1)
        else:
            self.hdop = round(random.uniform(0.7, 1.9), 1)

    async def run(self):
        print(f"{DIM}[Bus {self.bus_number}] SIM800L Module Initialized. Interval: {self.report_interval}s{RESET}")
        
        while True:
            current_time = time.time()
            
            # 1. Brownout / Reboot simulation (0.1% chance)
            if random.random() < 0.001 and self.state == "ACTIVE":
                print(f"{RED}🔌 [Bus {self.bus_number}] BROWNOUT! Hardware crashed. Rebooting...{RESET}")
                self.state = "OFF"
                self.current_speed = 0.0
                await asyncio.sleep(15) # Boot delay
                self.state = "ACQUIRING"
            
            # 2. State Machine Processing
            if self.state == "OFF":
                await asyncio.sleep(10)
                continue
                
            elif self.state == "ACQUIRING":
                # Takes 15-45s to get a cold fix
                await asyncio.sleep(random.randint(5, 15))
                self.state = "ACTIVE"
                print(f"{BLUE}🛰️  [Bus {self.bus_number}] NEO-6M 3D Fix Acquired (Sats: 8){RESET}")
                continue

            elif self.state == "SLEEP":
                self.lat, self.lng = self.hostel_coords
                self.current_speed = 0.0
                # Charging logic
                if self.battery_pct < 100:
                    self.battery_pct += 2
                    
                self.calculate_gps()
                payload = self.build_payload("idle")
                await self.send_payload(payload)
                await asyncio.sleep(300) # 5 min heartbeat
                continue
                
            elif self.state == "LAYOVER":
                self.current_speed = 0.0
                at_mbse = self.sub_t >= 1.0
                self.lat, self.lng = self.mbse_coords if at_mbse else self.hostel_coords
                
                if current_time >= self.layover_end_time:
                    self.state = "ACTIVE"
                    loc = "MBSE" if at_mbse else self.hostel
                    print(f"{GREEN}[Bus {self.bus_number}] 🚌 Departing {loc}.{RESET}")
                else:
                    self.calculate_gps()
                    await self.send_payload(self.build_payload("idle"))
                    await asyncio.sleep(30)
                continue

            elif self.state == "ACTIVE":
                # Physics: Traffic & Intermediate Stops
                if current_time < self.traffic_pause_until:
                    self.target_speed = 0.0
                else:
                    # Occasional traffic stop or student pickup (5% chance)
                    if random.random() < 0.05:
                        pause_time = random.randint(10, 30)
                        self.traffic_pause_until = current_time + pause_time
                        self.target_speed = 0.0
                    else:
                        # Hilly segments = slower speeds
                        is_hilly = 0.2 < self.sub_t < 0.8
                        max_spd = 25.0 if is_hilly else 40.0
                        self.target_speed = random.uniform(15.0, max_spd)

                # Smooth acceleration/deceleration
                if self.current_speed < self.target_speed:
                    self.current_speed = min(self.target_speed, self.current_speed + 5.0)
                elif self.current_speed > self.target_speed:
                    self.current_speed = max(self.target_speed, self.current_speed - 10.0) # Brake faster

                # Move along route
                delta = (self.current_speed / 40.0) * random.uniform(0.010, 0.025) * self.direction
                self.sub_t += delta
                
                # Check Endpoints
                if self.sub_t >= 1.0 or self.sub_t <= 0.0:
                    at_mbse = self.sub_t >= 1.0
                    self.sub_t = 1.0 if at_mbse else 0.0
                    self.direction *= -1
                    self.state = "LAYOVER"
                    self.current_speed = 0.0
                    
                    loc = "MBSE" if at_mbse else self.hostel
                    self.layover_end_time = current_time + random.randint(120, 180)
                    
                    # Shift Swap Logic (Only at Hostel)
                    if not at_mbse:
                        same_hostel_nodes = [n for n in self.fleet_mgr.nodes if n.hostel == self.hostel and n.state == "SLEEP"]
                        if same_hostel_nodes and random.random() < 0.6:
                            swap_node = random.choice(same_hostel_nodes)
                            swap_node.force_state("ACTIVE")
                            self.force_state("SLEEP")
                            print(f"{MAGENTA}🔄 SHIFT SWAP [{self.hostel}]: Bus {self.bus_number} parked. Woke up Bus {swap_node.bus_number}!{RESET}")
                            continue # Sleep immediately

                # Update Coords
                if self.route:
                    self.lat, self.lng = get_point_along_route(self.route, self.sub_t)
                else:
                    self.lat, self.lng = lerp(self.hostel_coords, MBSE_COORDS, self.sub_t)
                
                # Battery drain
                if random.random() < 0.1:
                    self.battery_pct = max(0, self.battery_pct - 1)

                self.calculate_gps()
                
                # Multipath Jitter (1% chance of a bad coordinate reading)
                noise_lat, noise_lng = 0, 0
                if self.has_fix and random.random() < 0.01:
                    noise_lat = random.uniform(-0.001, 0.001)
                    noise_lng = random.uniform(-0.001, 0.001)

                payload = self.build_payload("active", noise_lat, noise_lng)
                
                success = await self.send_payload(payload)
                if success:
                    # Low battery limits reporting frequency
                    if self.battery_pct < 15:
                        print(f"{YELLOW}🔋 [Bus {self.bus_number}] LOW BATTERY ({self.battery_pct}%). Power saving mode active.{RESET}")
                        await asyncio.sleep(20.0)
                    else:
                        await asyncio.sleep(self.report_interval)


    def build_payload(self, status_text, noise_lat=0, noise_lng=0):
        # Strict Honesty Checks
        if status_text == "idle":
            assert self.current_speed == 0.0
            
        reported_lat = round(self.lat + noise_lat, 6) if self.has_fix else round(self.lat, 6)
        reported_lng = round(self.lng + noise_lng, 6) if self.has_fix else round(self.lng, 6)

        return {
            "device_id": f"ESP32-BUS-{self.bus_number}",
            "bus_id": str(self.bus_number),
            "has_fix": self.has_fix,
            "latitude": reported_lat,
            "longitude": reported_lng,
            "speed_kmh": round(self.current_speed, 1),
            "satellites": self.satellites,
            "hdop": self.hdop,
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "status": status_text,
            "net_type": random.choice(["GSM", "WiFi"]),
            "state": self.state,
            "battery_pct": self.battery_pct,
            "buffered_packets": len(self.buffer)
        }

async def dummy_health_server(port):
    """Dummy HTTP server to satisfy Render Web Service checks."""
    async def handle_client(reader, writer):
        request = (await reader.read(1024)).decode('utf8')
        response = "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nSimulator Active"
        writer.write(response.encode('utf8'))
        await writer.drain()
        writer.close()
    
    server = await asyncio.start_server(handle_client, '0.0.0.0', port)
    print(f"{CYAN}🩺 Dummy Health Server listening on port {port}{RESET}")
    async with server:
        await server.serve_forever()

async def fleet_clock(mgr):
    """Background task to simulate time passing and schedule changes."""
    while True:
        mgr.update_time_of_day()
        await asyncio.sleep(60) # Check scheduler every minute

async def main_loop():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=3000)
    parser.add_argument("--https", action="store_true")
    parser.add_argument("--api-key", default="BUSTRACKESP1SECRETKEY")
    parser.add_argument("--active-per-hostel-min", type=int, default=1)
    parser.add_argument("--active-per-hostel-max", type=int, default=3)
    args = parser.parse_args()

    protocol = "https" if args.https else "http"
    render_env_port = os.environ.get("PORT")
    
    if render_env_port and args.host == "127.0.0.1":
        url = "https://nitmz-bus-tracker.onrender.com/api/update-location"
    else:
        url = f"{protocol}://{args.host}:{args.port}/api/update-location"
    
    print(f"{MAGENTA}=========================================={RESET}")
    print(f"{MAGENTA} 🛰️  NITMZ Hyper-Realistic Fleet Simulator{RESET}")
    print(f"{MAGENTA}=========================================={RESET}")
    print(f" Endpoint: {url}\n")
    
    mgr = FleetManager(args.active_per_hostel_min, args.active_per_hostel_max)

    for bus_num, hostel in BUSES.items():
        node = ESP32Node(bus_num, hostel, url, args.api_key, mgr)
        mgr.nodes.append(node)

    # Initial Schedule Roll
    mgr.roll_daily_schedule()

    tasks = [asyncio.create_task(node.run()) for node in mgr.nodes]
    tasks.append(asyncio.create_task(fleet_clock(mgr)))
    
    if render_env_port:
        tasks.append(asyncio.create_task(dummy_health_server(int(render_env_port))))
        
    await asyncio.gather(*tasks)

if __name__ == "__main__":
    try:
        asyncio.run(main_loop())
    except KeyboardInterrupt:
        print(f"\n{RED}✅ Simulation halted safely.{RESET}")
