import logging
import requests
from datetime import datetime, timezone
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s', datefmt='%H:%M:%S')
logger = logging.getLogger(__name__)

app = Flask(__name__, template_folder='templates')
CORS(app) 

# Security Keys
API_SECRET_KEY = "NITMZ_Bus_Super_Secret_2026!" 
FRIEND_API_KEY = "BUSTRACKESP1SECRETKEY"

# Friend's Webhook URL
FRIEND_WEBHOOK_URL = "https://matador-unneeded-synergy.ngrok-free.dev/api/update-location"

latest_bus_data = {
    "latitude": 00.0000, 
    "longitude": 00.0000,
    "speed_kmh": 0.0,
    "satellites": 0,
    "hdop": 100.0,
    "has_fix": False,
    "net_type": "unknown"
}

@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')

@app.route('/endpoint', methods=['POST'])
def receive_gps_data():
    global latest_bus_data
    
    # --- SECURITY CHECK (For render server) ---
    client_key = request.headers.get('x-api-key')
    if client_key != API_SECRET_KEY:
        logger.warning("Unauthorized POST attempt blocked!")
        return jsonify({"status": "error", "message": "Unauthorized"}), 401

    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"status": "error"}), 400

        # Update global state
        latest_bus_data['latitude'] = data.get('latitude', latest_bus_data['latitude'])
        latest_bus_data['longitude'] = data.get('longitude', latest_bus_data['longitude'])
        latest_bus_data['speed_kmh'] = data.get('speed_kmh', 0.0)
        latest_bus_data['satellites'] = data.get('satellites', 0)
        latest_bus_data['hdop'] = data.get('hdop', 1.0)
        latest_bus_data['has_fix'] = data.get('has_fix', latest_bus_data['has_fix'])
        latest_bus_data['net_type'] = data.get('net_type', latest_bus_data['net_type'])
        # --- FORWARD DATA TO FRIEND'S NGROK ---
        forward_data_to_friend()

        return jsonify({"status": "success"}), 200

    except Exception as e:
        logger.error(f"Error processing ESP32 data: {e}")
        return jsonify({"status": "error"}), 500

def forward_data_to_friend():
    """Formats the data and sends it to the friend's endpoint"""
    try:
        # Determine if bus is moving based on speed
        bus_status = "moving" if latest_bus_data['speed_kmh'] > 2.0 else "stopped"
        
        # Generate current UTC timestamp in the requested format
        current_time = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        # Format the exact payload your friend requested
        payload = {
            "status": "success",
            "data": {
                "deviceId": "ESP32-Device-1",
                "busId": "Bus 5",
                "lat": latest_bus_data['latitude'],
                "lng": latest_bus_data['longitude'],
                "speed": latest_bus_data['speed_kmh'],
                "accuracy": latest_bus_data['hdop'],
                "timestamp": current_time,
                "status": bus_status,
                "net_type": latest_bus_data['net_type']
            }
        }

        # Add the specific headers required by his endpoint
        headers = {
            "Content-Type": "application/json",
            "x-api-key": FRIEND_API_KEY
        }

        # Send the POST request. 
        # We use a short timeout (2 seconds) so if his server goes offline, 
        # it doesn't crash or slow down main Render server.
        requests.post(FRIEND_WEBHOOK_URL, json=payload, headers=headers, timeout=2)
        logger.info("Successfully forwarded data to friend's ngrok.")

    except requests.exceptions.RequestException as e:
        logger.error(f"Could not reach friend's server: {e}")
    except Exception as e:
        logger.error(f"Error formatting data for friend: {e}")

@app.route('/location', methods=['GET'])
def get_bus_location():
    return jsonify(latest_bus_data), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
