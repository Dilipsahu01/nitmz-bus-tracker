class BusLocation {
  final String busId;
  final String deviceId;
  final double lat;
  final double lng;
  final double speed;
  final double accuracy;
  final String status;
  final DateTime timestamp;

  const BusLocation({
    required this.busId,
    required this.deviceId,
    required this.lat,
    required this.lng,
    required this.speed,
    required this.accuracy,
    required this.status,
    required this.timestamp,
  });

  factory BusLocation.fromJson(Map<String, dynamic> json) {
    double toDouble(dynamic value, double fallback) {
      if (value is num) return value.toDouble();
      if (value is String) return double.tryParse(value) ?? fallback;
      return fallback;
    }

    DateTime parseTimestamp(dynamic value) {
      if (value is String) {
        return DateTime.tryParse(value) ?? DateTime.now();
      }
      return DateTime.now();
    }

    return BusLocation(
      busId: (json['busId'] ?? json['bus_id'] ?? json['busNumber'] ?? 'Bus-1').toString(),
      deviceId: (json['deviceId'] ?? json['device_id'] ?? 'device-1').toString(),
      lat: toDouble(json['lat'] ?? json['latitude'], 23.7271),
      lng: toDouble(json['lng'] ?? json['longitude'], 92.7176),
      speed: toDouble(json['speed'], 0),
      accuracy: toDouble(json['accuracy'] ?? json['hdop'], 1.0),
      status: (json['status'] ?? 'idle').toString(),
      timestamp: parseTimestamp(json['timestamp'] ?? json['ts'] ?? json['received_at']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'busId': busId,
      'deviceId': deviceId,
      'lat': lat,
      'lng': lng,
      'speed': speed,
      'accuracy': accuracy,
      'status': status,
      'timestamp': timestamp.toIso8601String(),
    };
  }
}
