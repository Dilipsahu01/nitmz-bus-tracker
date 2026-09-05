import urllib.request
import json
import time
import random
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
import os

API_ENDPOINT = "https://nitmz-bus-tracker.onrender.com/api/update-location"
API_KEY = "NITMZ_ESP32_SECURE_API_KEY_2026"
CAMPUS_CENTER = (23.7271, 92.7176)

# List of all active bus numbers
ALL_BUSES = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22]

# Initialize random starting positions for each bus around the campus
buses_state = {}
for bus in ALL_BUSES:
    buses_state[bus] = {
        "lat": CAMPUS_CENTER[0] + random.uniform(-0.02, 0.02),
        "lng": CAMPUS_CENTER[1] + random.uniform(-0.02, 0.02),
        "speed": random.uniform(15.0, 40.0),
        "is_sos": False
    }

def send_telemetry(bus_id, state):
    payload = {
        "device_id": f"ESP32-Device-SIM-{bus_id}",
        "bus_id": f"{bus_id}", 
        "has_fix": True,
        "latitude": state["lat"],
        "longitude": state["lng"],
        "speed_kmh": state["speed"],
        "satellites": random.randint(7, 12),
        "hdop": round(random.uniform(0.8, 2.0), 1),
        "timestamp": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        "status": "running",
        "is_sos": state["is_sos"],
        "net_type": "WiFi"
    }

    req = urllib.request.Request(API_ENDPOINT)
    req.add_header('Content-Type', 'application/json')
    req.add_header('x-api-key', API_KEY)
    
    data = json.dumps(payload).encode('utf-8')
    try:
        with urllib.request.urlopen(req, data=data) as response:
            pass # Silently succeed to keep logs clean
    except Exception as e:
        print(f"Bus {bus_id} -> Failed: {e}")

# List of active buses to simulate (Set to [5] for Bus 5 focus)
ACTIVE_BUSES = [5]

def run_simulation():
    print("=== NIT-MZ Bus Tracker ESP32 Simulator ===")
    print(f"Targeting: {API_ENDPOINT}")
    print(f"Actively simulating Bus 5 at 1-second intervals...\n")
    
    while True:
        for bus_id in ACTIVE_BUSES:
            if bus_id in buses_state:
                state = buses_state[bus_id]
                state["lat"] += random.uniform(-0.0001, 0.0001)
                state["lng"] += random.uniform(-0.0001, 0.0001)
                state["speed"] = random.uniform(15.0, 40.0)
                state["is_sos"] = False

                send_telemetry(bus_id, state)
            
        time.sleep(1)

class DummyHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()
        self.wfile.write(b"Simulator is running and transmitting data!")

if __name__ == "__main__":
    # 1. Start the continuous simulation in a background thread
    sim_thread = threading.Thread(target=run_simulation, daemon=True)
    sim_thread.start()
    
    # 2. Start a dummy web server to trick Render into hosting this for free
    port = int(os.environ.get("PORT", 8080))
    server = HTTPServer(('0.0.0.0', port), DummyHandler)
    print(f"Dummy Web Server listening on port {port} (Required for Free Render Tier)")
    server.serve_forever()
