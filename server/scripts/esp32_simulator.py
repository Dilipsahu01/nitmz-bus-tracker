#!/usr/bin/env python3
"""
ESP32 GPS Telemetry Simulator for NITMZ Bus Tracker.

Sends realistic fake GPS coordinates along the Durtlang-Chaltlang route
to the server's /api/update-location endpoint for testing.

Usage:
  python3 esp32_simulator.py                          # defaults: localhost:3000
  python3 esp32_simulator.py --host your-server.com --port 443 --https
  python3 esp32_simulator.py --bus-id "Bus 7" --interval 2
"""
import argparse
import json
import random
import time
import math
from datetime import datetime, timezone
from urllib import error, request


# Approximate route waypoints: Durtlang (hostels) ↔ Chaltlang (MBSE campus)
ROUTE_WAYPOINTS = [
    (23.7590, 92.7270),  # Durtlang hostel area
    (23.7560, 92.7260),
    (23.7530, 92.7250),
    (23.7500, 92.7245),
    (23.7470, 92.7240),
    (23.7440, 92.7235),
    (23.7410, 92.7230),
    (23.7380, 92.7225),
    (23.7350, 92.7220),  # Midpoint
    (23.7320, 92.7215),
    (23.7290, 92.7200),
    (23.7275, 92.7185),  # Chaltlang / MBSE area
]


def lerp(a, b, t):
    """Linear interpolation between two (lat,lng) points."""
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def send_packet(url, api_key, payload, timeout):
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
    with request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read().decode("utf-8")


def main():
    parser = argparse.ArgumentParser(
        description="Simulate ESP32 GPS telemetry for NITMZ Bus Tracker."
    )
    parser.add_argument("--host", default="127.0.0.1", help="Server host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=3000, help="Server port (default: 3000)")
    parser.add_argument("--https", action="store_true", help="Use HTTPS instead of HTTP")
    parser.add_argument("--interval", type=float, default=1.0, help="Seconds between sends (default: 1.0)")
    parser.add_argument("--bus-id", default="Bus 5", help="bus_id value (default: Bus 5)")
    parser.add_argument("--device-id", default="ESP32-Device-1", help="device_id value")
    parser.add_argument("--api-key", default="BUSTRACKESP1SECRETKEY", help="x-api-key header value")
    parser.add_argument("--count", type=int, default=0, help="Number of packets (0 = infinite)")
    parser.add_argument("--timeout", type=float, default=6.0, help="HTTP timeout seconds")
    args = parser.parse_args()

    protocol = "https" if args.https else "http"
    url = f"{protocol}://{args.host}:{args.port}/api/update-location"
    print(f"🛰️  NITMZ Bus Tracker — ESP32 Simulator")
    print(f"   Endpoint : {url}")
    print(f"   Bus ID   : {args.bus_id}")
    print(f"   Device   : {args.device_id}")
    print(f"   Interval : {args.interval}s")
    print(f"   Press Ctrl+C to stop.\n")

    sent = 0
    waypoint_idx = 0
    sub_t = 0.0
    direction = 1  # 1 = hostel→campus, -1 = campus→hostel

    try:
        while True:
            # Interpolate position along route
            if waypoint_idx >= len(ROUTE_WAYPOINTS) - 1:
                direction = -1
                waypoint_idx = len(ROUTE_WAYPOINTS) - 2
                sub_t = 1.0
            elif waypoint_idx < 0:
                direction = 1
                waypoint_idx = 0
                sub_t = 0.0

            wp_a = ROUTE_WAYPOINTS[waypoint_idx]
            wp_b = ROUTE_WAYPOINTS[min(waypoint_idx + 1, len(ROUTE_WAYPOINTS) - 1)]
            lat, lng = lerp(wp_a, wp_b, sub_t)

            # Add small noise
            lat += random.uniform(-0.00005, 0.00005)
            lng += random.uniform(-0.00005, 0.00005)

            speed = round(random.uniform(15.0, 35.0), 1)

            payload = {
                "device_id": args.device_id,
                "bus_id": args.bus_id,
                "has_fix": True,
                "latitude": round(lat, 6),
                "longitude": round(lng, 6),
                "speed_kmh": speed,
                "satellites": random.randint(6, 12),
                "hdop": round(random.uniform(0.7, 1.5), 1),
                "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "status": "active" if speed > 2 else "idle",
                "net_type": random.choice(["GSM", "WiFi"])
            }

            try:
                status, body = send_packet(url, args.api_key, payload, args.timeout)
                ts = datetime.now().strftime("%H:%M:%S")
                print(f"  [{ts}] {status} | lat={payload['latitude']:.6f} lng={payload['longitude']:.6f} speed={payload['speed_kmh']} → {body[:80]}")
            except error.HTTPError as http_err:
                err_body = http_err.read().decode("utf-8", errors="ignore")
                print(f"  ❌ HTTP {http_err.code}: {err_body[:100]}")
            except Exception as exc:
                print(f"  ❌ Send failed: {exc}")

            # Advance along route
            sub_t += random.uniform(0.15, 0.35) * direction
            if sub_t >= 1.0:
                waypoint_idx += 1
                sub_t = 0.0
            elif sub_t <= 0.0:
                waypoint_idx -= 1
                sub_t = 1.0

            sent += 1
            if args.count > 0 and sent >= args.count:
                break

            time.sleep(max(args.interval, 0.2))

    except KeyboardInterrupt:
        print(f"\n✅ Stopped after {sent} packets.")


if __name__ == "__main__":
    main()
