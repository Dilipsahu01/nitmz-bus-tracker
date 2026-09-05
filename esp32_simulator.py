import urllib.request
import json
import time
import random

API_ENDPOINT = "http://localhost:3000/api/update-location"
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
    print("Starting continuous live transmission... (Press Ctrl+C to stop)")
    
    current_lat = CAMPUS_CENTER[0]
    current_lng = CAMPUS_CENTER[1]
    
    step = 0
    while True:
        step += 1
        # Simulate moving slightly North-East
        current_lat += 0.0001
        current_lng += 0.0001
        
        # Trigger an SOS alert every 20 seconds
        trigger_sos = (step % 20 == 0)
        
        # The bus will naturally trigger the 4km Geofence deviation after ~400 steps
        
        print(f"\n--- Ping #{step} ---")
        if trigger_sos:
            print(">> SIMULATING EMERGENCY SOS BUTTON PRESS <<")
            
        send_telemetry(current_lat, current_lng, speed=25.0, is_sos=trigger_sos)
        time.sleep(1) # Send every 1 second just like the real ESP32
