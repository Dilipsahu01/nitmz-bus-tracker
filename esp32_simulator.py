import urllib.request
import json
import time
import random

API_ENDPOINT = "https://nitmz-bus-tracker.onrender.com/api/update-location"
API_KEY = "NITMZ_ESP32_SECURE_API_KEY_2026"
CAMPUS_CENTER = (23.7271, 92.7176)

def send_telemetry(lat, lng, speed, is_sos=False, status="active"):
    payload = {
        "device_id": "ESP32-Device-SIM",
        "bus_id": "Bus 5",
        "has_fix": True,
        "latitude": lat,
        "longitude": lng,
        "speed_kmh": speed,
        "satellites": random.randint(5, 12),
        "hdop": round(random.uniform(0.8, 2.0), 1),
        "timestamp": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        "status": status,
        "is_sos": is_sos,
        "net_type": "WiFi"
    }

    req = urllib.request.Request(API_ENDPOINT, method="POST")
    req.add_header('Content-Type', 'application/json')
    req.add_header('x-api-key', API_KEY)
    
    data = json.dumps(payload).encode('utf-8')
    
    try:
        print(f"Sending Payload: {payload}")
        with urllib.request.urlopen(req, data=data) as response:
            res_data = response.read().decode('utf-8')
            print(f"Server Response ({response.status}): {res_data}\n")
    except urllib.error.URLError as e:
        print(f"Failed to connect: {e}\n")

if __name__ == "__main__":
    print("=== NIT-MZ Bus Tracker ESP32 Simulator ===")
    print(f"Targeting: {API_ENDPOINT}\n")
    
    # 1. Normal Ping (At Campus)
    print("--- 1. Normal Ping (At Campus) ---")
    send_telemetry(CAMPUS_CENTER[0] + 0.001, CAMPUS_CENTER[1] + 0.001, 15.5)
    time.sleep(2)
    
    # 2. SOS Alert Ping
    print("--- 2. SOS Alert Ping ---")
    send_telemetry(CAMPUS_CENTER[0] + 0.002, CAMPUS_CENTER[1] + 0.002, 22.0, is_sos=True)
    time.sleep(2)
    
    # 3. Route Deviation Ping (> 4km away)
    # Roughly 1 degree lat is ~111km, so 0.05 degrees is ~5.5km
    print("--- 3. Route Deviation Geofence Ping (> 4km away) ---")
    send_telemetry(CAMPUS_CENTER[0] + 0.05, CAMPUS_CENTER[1], 45.0)
    
    print("Simulation Complete!")
