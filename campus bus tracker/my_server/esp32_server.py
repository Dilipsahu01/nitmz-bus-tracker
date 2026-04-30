from datetime import datetime, timezone
from flask import Flask, request, jsonify

app = Flask(__name__)


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, x-api-key"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return response

# --- Configuration (Must match ESP32 firmware) ---
API_SECRET_KEY = "BUSTRACKESP1SECRETKEY"
API_PATH = "/api/update-location"
LATEST_PATH = "/api/location/latest"

# In-memory store of latest telemetry packet.
latest_location = {
    "device_id": None,
    "bus_id": None,
    "lat": 23.7271,
    "lng": 92.7176,
    "speed": 0.0,
    "accuracy": 1.0,
    "net_type": "unknown",
    "ts": None,
    "status": "idle",
    "received_at": None,
}


@app.route(API_PATH, methods=["POST"])
def update_location():
    client_key = request.headers.get("x-api-key")

    if client_key != API_SECRET_KEY:
        print(f"[!] Unauthorized access attempt. Key provided: {client_key}")
        return jsonify({"error": "Unauthorized"}), 401

    try:
        incoming = request.get_json(silent=True)
        if not incoming:
            return jsonify({"error": "No JSON payload found"}), 400

        # Accept either direct telemetry payload or wrapped webhook payload.
        # Example wrapped payload:
        # {"status":"success","data":{...telemetry...}}
        data = incoming.get("data") if isinstance(incoming.get("data"), dict) else incoming

        # Accept both snake_case and camelCase keys from different senders.
        device_id = data.get("device_id") or data.get("deviceId")
        bus_id = data.get("bus_id") or data.get("busId")
        lat = data.get("lat", data.get("latitude"))
        lng = data.get("lng", data.get("longitude"))
        speed = data.get("speed", 0.0)
        accuracy = data.get("accuracy", data.get("hdop", 1.0))
        net_type = data.get("net_type") or data.get("netType") or data.get("network_type") or "unknown"
        ts = data.get("ts") or data.get("timestamp")
        status = data.get("status") or "idle"

        if lat is None or lng is None:
            return jsonify({"error": "lat/lng (or latitude/longitude) required"}), 400

        latest_location["device_id"] = device_id
        latest_location["bus_id"] = bus_id
        latest_location["lat"] = lat
        latest_location["lng"] = lng
        latest_location["speed"] = speed
        latest_location["accuracy"] = accuracy
        latest_location["net_type"] = net_type
        latest_location["ts"] = ts
        latest_location["status"] = status
        latest_location["received_at"] = datetime.now(timezone.utc).isoformat()

        print("\n" + "=" * 50)
        print(f"[+] TELEMETRY RECEIVED | {latest_location['bus_id']} ({latest_location['device_id']})")
        print("=" * 50)
        print(f"    Location  : {latest_location['lat']}, {latest_location['lng']}")
        print(f"    Speed     : {latest_location['speed']} km/h")
        print(f"    Accuracy  : {latest_location['accuracy']} HDOP")
        print(f"    Net Type  : {latest_location['net_type']}")
        print(f"    Timestamp : {latest_location['ts']}")
        print(f"    Status    : {latest_location['status']}")
        print("=" * 50 + "\n")

        return jsonify({"message": "Data received successfully", "status": "success"}), 200

    except Exception as exc:
        print(f"[!] Server Error: {str(exc)}")
        return jsonify({"error": "Internal Server Error"}), 500


@app.route(LATEST_PATH, methods=["GET"])
def get_latest_location():
    if latest_location["lat"] is None or latest_location["lng"] is None:
        return jsonify({"error": "No telemetry yet"}), 404

    payload = {
        "deviceId": latest_location["device_id"] or "unknown-device",
        "busId": latest_location["bus_id"] or "Bus-Unknown",
        "lat": float(latest_location["lat"]),
        "lng": float(latest_location["lng"]),
        "speed": float(latest_location["speed"] or 0.0),
        "accuracy": float(latest_location["accuracy"] or 1.0),
        "net_type": latest_location["net_type"] or "unknown",
        "timestamp": latest_location["ts"] or latest_location["received_at"],
        "status": latest_location["status"] or "idle",
    }
    return jsonify({"status": "success", "data": payload}), 200


if __name__ == "__main__":
    print("Starting Fleet Monitoring Server on port 5000...")
    print("POST telemetry to /api/update-location with header x-api-key")
    print("GET latest location from /api/location/latest")
    app.run(host="0.0.0.0", port=5000, debug=True)
