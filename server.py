import logging
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s', datefmt='%H:%M:%S')
logger = logging.getLogger(__name__)

app = Flask(__name__, template_folder='templates')
CORS(app) 

# Security Key
API_SECRET_KEY = "NITMZ_Bus_Super_Secret_2026!" 

latest_bus_data = {
    "latitude": 23.7271, 
    "longitude": 92.7176,
    "speed_kmh": 0.0,
    "satellites": 0,
    "hdop": 99.9,
    "has_fix": False
}

@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')

@app.route('/endpoint', methods=['POST'])
def receive_gps_data():
    global latest_bus_data
    
    # --- SECURITY CHECK ---
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
        latest_bus_data['hdop'] = data.get('hdop', 99.9)
        latest_bus_data['has_fix'] = data.get('has_fix', False)

        return jsonify({"status": "success"}), 200

    except Exception as e:
        return jsonify({"status": "error"}), 500

@app.route('/location', methods=['GET'])
def get_bus_location():
    return jsonify(latest_bus_data), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
