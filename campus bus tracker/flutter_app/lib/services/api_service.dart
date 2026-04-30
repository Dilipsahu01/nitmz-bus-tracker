import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter/foundation.dart';
import '../models/bus_location.dart';

class ApiService {
  // Main app backend base URL (auth, schedules, etc.)
  static const String _apiHostOverride = String.fromEnvironment(
    'API_HOST',
    defaultValue: '',
  );
  static const String apiPort = String.fromEnvironment(
    'API_PORT',
    defaultValue: '3000',
  );
  static String get apiHost =>
      _apiHostOverride.isNotEmpty ? _apiHostOverride : defaultApiHost;
  static String get baseUrl => 'http://$apiHost:$apiPort/api';
  // ESP32 telemetry server base URL (Flask)
  static const String _trackingHostOverride = String.fromEnvironment(
    'TRACKING_HOST',
    defaultValue: '',
  );
  static const String _trackingBaseUrlOverride = String.fromEnvironment(
    'TRACKING_BASE_URL',
    defaultValue: '',
  );
  static const String _trackingPublicUrlOverride = String.fromEnvironment(
    'TRACKING_PUBLIC_URL',
    defaultValue: 'https://matador-unneeded-synergy.ngrok-free.dev',
  );
  static const String trackingPort = String.fromEnvironment(
    'TRACKING_PORT',
    defaultValue: '5000',
  );
  static String get trackingHost =>
      _trackingHostOverride.isNotEmpty ? _trackingHostOverride : apiHost;
  static String get trackingBaseUrl {
    if (_trackingBaseUrlOverride.isNotEmpty) {
      return _normalizeApiBase(_trackingBaseUrlOverride);
    }

    if (kIsWeb && _trackingPublicUrlOverride.isNotEmpty) {
      return _normalizeApiBase(_trackingPublicUrlOverride);
    }

    final host = trackingHost.trim();
    final hostHasScheme =
        host.startsWith('http://') || host.startsWith('https://');

    if (hostHasScheme) {
      return _normalizeApiBase(host);
    }

    return _normalizeApiBase('http://$host:$trackingPort');
  }

  static String get trackingLatestEndpoint => '$trackingBaseUrl/location/latest';
  static const Duration _telemetryEndpointBackoff = Duration(seconds: 45);
  static final Map<String, DateTime> _telemetryBackoffUntil = {};

  static String _normalizeApiBase(String rawBase) {
    var base = rawBase.trim();
    if (base.endsWith('/')) {
      base = base.substring(0, base.length - 1);
    }
    if (!base.endsWith('/api')) {
      base = '$base/api';
    }
    return base;
  }

  static String get defaultApiHost {
    if (kIsWeb) return 'localhost';
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return '10.0.2.2';
      case TargetPlatform.iOS:
      case TargetPlatform.linux:
      case TargetPlatform.macOS:
      case TargetPlatform.windows:
      case TargetPlatform.fuchsia:
        return 'localhost';
    }
  }

  static Future<BusLocation?> fetchLatestLocation() async {
    final rawEndpoints = [
      // Prefer live ESP32 tracker feed first; use Node endpoint only as fallback.
      '$trackingBaseUrl/location/latest',
      if (_trackingPublicUrlOverride.isNotEmpty)
        '${_normalizeApiBase(_trackingPublicUrlOverride)}/location/latest',
      '$baseUrl/location/latest',
    ];

    final endpoints = <String>[];
    final seen = <String>{};
    for (final endpoint in rawEndpoints) {
      if (seen.add(endpoint)) endpoints.add(endpoint);
    }

    final now = DateTime.now();

    for (final endpoint in endpoints) {
      final backoffUntil = _telemetryBackoffUntil[endpoint];
      if (backoffUntil != null && now.isBefore(backoffUntil)) {
        continue;
      }

      try {
        final response = await http
            .get(Uri.parse(endpoint))
            .timeout(const Duration(seconds: 4));
        if (kDebugMode) {
          debugPrint('Telemetry GET $endpoint -> ${response.statusCode}');
        }
        if (response.statusCode == 200) {
          final data = jsonDecode(response.body);
          if (data is Map<String, dynamic>) {
            _telemetryBackoffUntil.remove(endpoint);
            final payload = data['data'] is Map<String, dynamic>
                ? data['data'] as Map<String, dynamic>
                : data;
            final location = BusLocation.fromJson(payload);
            if (kDebugMode) {
              debugPrint(
                'Telemetry parsed from $endpoint: '
                'bus=${location.busId}, lat=${location.lat}, lng=${location.lng}, speed=${location.speed}',
              );
            }
            return location;
          }
        }

        _telemetryBackoffUntil[endpoint] = DateTime.now().add(
          _telemetryEndpointBackoff,
        );
      } catch (e) {
        _telemetryBackoffUntil[endpoint] = DateTime.now().add(
          _telemetryEndpointBackoff,
        );
        if (kDebugMode) {
          debugPrint('Telemetry fetch failed for $endpoint: $e');
        }
        // Try next endpoint.
      }
    }

    return null;
  }

  static Future<List<BusLocation>> getAllBusesLocations() async {
    try {
      // Try to fetch from server endpoint first
      final endpoints = [
        '$baseUrl/buses',
        '$baseUrl/all-buses',
        '$trackingBaseUrl/buses',
      ];

      for (final endpoint in endpoints) {
        try {
          final response = await http
              .get(Uri.parse(endpoint))
              .timeout(const Duration(seconds: 5));
          if (response.statusCode == 200) {
            final data = jsonDecode(response.body);
            final List<dynamic> busesData = data is List ? data : data['data'] ?? [];
            
            return busesData.map((bus) {
              final busMap = bus is Map<String, dynamic> ? bus : {};
              final busNumber = busMap['busNumber']?.toString() ?? 'Unknown';
              final lat = (busMap['latitude'] ?? busMap['lat'] ?? 23.7271) as num;
              final lng = (busMap['longitude'] ?? busMap['lng'] ?? 92.7176) as num;
              
              return BusLocation(
                busId: 'Bus $busNumber',
                deviceId: busMap['deviceId'] ?? 'device-$busNumber',
                lat: lat.toDouble(),
                lng: lng.toDouble(),
                speed: ((busMap['speed'] ?? 0) as num).toDouble(),
                accuracy: ((busMap['accuracy'] ?? busMap['hdop'] ?? 1.0) as num).toDouble(),
                status: (busMap['status'] ?? 'idle').toString().toLowerCase(),
                timestamp: DateTime.now(),
              );
            }).toList();
          }
        } catch (_) {
          // Try next endpoint
        }
      }
    } catch (_) {
      // Fallback to demo data
    }

    // Fallback: use demo data with slight random position variations
    final demoInstance = ApiService();
    final demoBuses = demoInstance._getDemoBuses(null);
    final now = DateTime.now();
    
    return demoBuses.map((bus) {
      final busNumber = bus['busNumber'].toString();
      var lat = (bus['latitude'] as num).toDouble();
      var lng = (bus['longitude'] as num).toDouble();
      
      // Add slight wobble to simulate live updates
      if (bus['status'] == 'running') {
        final wobble = (now.second % 10) / 10000;
        lat += wobble;
        lng += wobble;
      }
      
      return BusLocation(
        busId: 'Bus $busNumber',
        deviceId: 'ESP32-${busNumber.padRight(3, '0')}',
        lat: lat,
        lng: lng,
        speed: ((bus['speed'] ?? 0) as num).toDouble(),
        accuracy: 0.95,
        status: (bus['status'] ?? 'idle').toString().toLowerCase(),
        timestamp: now,
      );
    }).toList();
  }


  Map<String, String> _headers([String? token]) {
    final headers = {'Content-Type': 'application/json'};
    if (token != null) headers['Authorization'] = 'Bearer $token';
    return headers;
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/login'),
        headers: _headers(),
        body: jsonEncode({'email': email, 'password': password}),
      ).timeout(const Duration(seconds: 10));
      final data = jsonDecode(response.body);
      if (response.statusCode == 200) return data;
      throw Exception(data['error'] ?? 'Login failed');
    } catch (e) {
      // Only use demo credentials when backend is unreachable.
      if (e is TimeoutException || e is http.ClientException) {
        return _demoLogin(email, password);
      }
      rethrow;
    }
  }

  Future<Map<String, dynamic>> getCurrentUser(String token) async {
    final response = await http
        .get(Uri.parse('$baseUrl/me'), headers: _headers(token))
        .timeout(const Duration(seconds: 8));

    final data = response.body.isNotEmpty ? jsonDecode(response.body) : null;
    if (response.statusCode == 200 && data is Map<String, dynamic>) {
      final user = data['user'];
      if (user is Map<String, dynamic>) return user;
      throw Exception('Invalid user response');
    }

    final message = data is Map<String, dynamic>
        ? (data['error']?.toString() ?? 'Session invalid')
        : 'Session invalid';
    throw Exception(message);
  }

  Map<String, dynamic> _demoLogin(String email, String password) {
    if (email == 'admin@nitmz.ac.in' && password == 'admin123') {
      return {
        'token': 'demo_admin_token',
        'user': {'id': 'admin1', 'name': 'Hostel Caretaker', 'email': email, 'role': 'admin', 'hostelId': null}
      };
    } else if (email == 'caretaker-bh1@nitmz.ac.in' && password == 'caretaker123') {
      return {
        'token': 'demo_caretaker_token',
        'user': {'id': 'caretaker1', 'name': 'BH1 Caretaker', 'email': email, 'role': 'caretaker', 'hostelId': 'BH1'}
      };
    } else if (email == 'student@nitmz.ac.in' && password == 'student123') {
      return {
        'token': 'demo_student_token',
        'user': {'id': 'student1', 'name': 'Anshul Student', 'email': email, 'role': 'student', 'hostelId': 'BH1'}
      };
    }
    throw Exception('Invalid credentials. Use caretaker-bh1@nitmz.ac.in/caretaker123 or student@nitmz.ac.in/student123');
  }

  Future<Map<String, dynamic>> register(String name, String email, String password, String hostelId) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/register'),
        headers: _headers(),
        body: jsonEncode({'name': name, 'email': email, 'password': password, 'hostelId': hostelId}),
      ).timeout(const Duration(seconds: 10));
      final data = jsonDecode(response.body);
      if (response.statusCode == 200) return data;
      throw Exception(data['error'] ?? 'Registration failed');
    } catch (e) {
      throw Exception('Registration failed: $e');
    }
  }

  Future<List<dynamic>> getBuses({String? hostel, String? token}) async {
    final url = hostel != null ? '$baseUrl/buses?hostel=$hostel' : '$baseUrl/buses';
    try {
      final response = await http.get(Uri.parse(url), headers: _headers(token)).timeout(const Duration(seconds: 8));

      if (response.statusCode == 200) {
        final parsed = jsonDecode(response.body);
        final buses = parsed is List ? List<dynamic>.from(parsed) : <dynamic>[];
        return _applyLiveBus5FromGps(buses);
      }

      final body = response.body.isNotEmpty ? jsonDecode(response.body) : null;
      final message = body is Map<String, dynamic>
          ? (body['error']?.toString() ?? 'Failed to load buses')
          : 'Failed to load buses';

      if (token != null && token.startsWith('demo_')) {
        return _getDemoBuses(hostel);
      }

      throw Exception(message);
    } catch (e) {
      if (kDebugMode) {
        debugPrint('Bus fetch failed for $url: $e');
      }
      return _getDemoBuses(hostel);
    }
  }

  Future<List<dynamic>> _applyLiveBus5FromGps(List<dynamic> buses) async {
    final latest = await fetchLatestLocation();
    if (latest == null) return buses;

    final liveBusNumber = int.tryParse(latest.busId.replaceAll(RegExp(r'[^0-9]'), ''));
    if (liveBusNumber != 5) return buses;

    final normalizedStatus = latest.status.toString().toLowerCase();
    final merged = List<dynamic>.from(buses);
    final index = merged.indexWhere((b) {
      if (b is! Map<String, dynamic>) return false;
      return (b['busNumber'] ?? 0) == 5;
    });

    if (index != -1 && merged[index] is Map<String, dynamic>) {
      final current = Map<String, dynamic>.from(merged[index] as Map<String, dynamic>);
      current['latitude'] = latest.lat;
      current['longitude'] = latest.lng;
      current['speed'] = latest.speed;
      current['status'] = normalizedStatus;
      merged[index] = current;
    }

    return merged;
  }

  Future<Map<String, dynamic>?> getBus(int busNumber, {String? token}) async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/buses/$busNumber'), headers: _headers(token)).timeout(const Duration(seconds: 8));
      if (response.statusCode == 200) return jsonDecode(response.body);
    } catch (e) {
      // ignore
    }
    final demo = _getDemoBuses(null);
    return demo.firstWhere((b) => b['busNumber'] == busNumber, orElse: () => {}) as Map<String, dynamic>?;
  }

  Future<List<dynamic>> getSchedules({String? hostel, String? date, String? token}) async {
    try {
      String url = '$baseUrl/schedules?';
      if (date != null) url += 'date=$date&';
      if (hostel != null) url += 'hostel=$hostel';
      final response = await http.get(Uri.parse(url), headers: _headers(token)).timeout(const Duration(seconds: 8));
      if (response.statusCode == 200) return jsonDecode(response.body);
    } catch (e) {
      // ignore
    }
    return _getDemoSchedules(hostel);
  }

  Future<Map<String, dynamic>> updateSchedule(Map<String, dynamic> data, String token) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/schedules'),
        headers: _headers(token),
        body: jsonEncode(data),
      ).timeout(const Duration(seconds: 10));
      if (response.statusCode == 200) return jsonDecode(response.body);
    } catch (e) {
      // ignore
    }
    return data;
  }

  Future<Map<String, dynamic>> updateBusStatus(int busNumber, String status, String token) async {
    final response = await http.patch(
      Uri.parse('$baseUrl/buses/$busNumber'),
      headers: _headers(token),
      body: jsonEncode({'status': status}),
    ).timeout(const Duration(seconds: 10));

    final data = response.body.isNotEmpty ? jsonDecode(response.body) : <String, dynamic>{};
    if (response.statusCode == 200) {
      return data is Map<String, dynamic> ? data : <String, dynamic>{'data': data};
    }

    throw Exception(data is Map<String, dynamic> ? data['error'] ?? 'Failed to update bus status' : 'Failed to update bus status');
  }

  Future<Map<String, dynamic>> addBus({
    required int busNumber,
    required String assignedHostel,
    required String driverName,
    required String driverPhone,
    required String token,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/buses'),
      headers: _headers(token),
      body: jsonEncode({
        'busNumber': busNumber,
        'assignedHostel': assignedHostel,
        'driverName': driverName,
        'driverPhone': driverPhone,
      }),
    ).timeout(const Duration(seconds: 10));

    final data = jsonDecode(response.body);
    if (response.statusCode == 200 || response.statusCode == 201) {
      return data is Map<String, dynamic> ? data : <String, dynamic>{};
    }

    throw Exception(data is Map<String, dynamic> ? data['error'] ?? 'Failed to add bus' : 'Failed to add bus');
  }

  Future<Map<String, dynamic>> updateBusDriver({
    required int busNumber,
    required String driverName,
    required String driverPhone,
    required String token,
  }) async {
    final response = await http.patch(
      Uri.parse('$baseUrl/buses/$busNumber/driver'),
      headers: _headers(token),
      body: jsonEncode({
        'name': driverName,
        'phone': driverPhone,
      }),
    ).timeout(const Duration(seconds: 10));

    final data = jsonDecode(response.body);
    if (response.statusCode == 200) {
      return data is Map<String, dynamic> ? data : <String, dynamic>{};
    }

    throw Exception(data is Map<String, dynamic> ? data['error'] ?? 'Failed to update driver' : 'Failed to update driver');
  }

  Future<List<dynamic>> getNotifications({String? hostel, String? token}) async {
    try {
      final url = hostel != null ? '$baseUrl/notifications?hostel=$hostel' : '$baseUrl/notifications';
      final response = await http.get(Uri.parse(url), headers: _headers(token)).timeout(const Duration(seconds: 8));
      if (response.statusCode == 200) return jsonDecode(response.body);
    } catch (e) {
      // ignore
    }
    return _getDemoNotifications();
  }

  Future<Map<String, dynamic>> sendNotification(Map<String, dynamic> data, String token) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/notifications/send'),
        headers: _headers(token),
        body: jsonEncode(data),
      ).timeout(const Duration(seconds: 10));
      if (response.statusCode == 200) return jsonDecode(response.body);
    } catch (e) {
      // ignore
    }
    return {...data, '_id': DateTime.now().millisecondsSinceEpoch.toString(), 'sentAt': DateTime.now().toIso8601String()};
  }

  // ============ DEMO DATA ============
  List<Map<String, dynamic>> _getDemoBuses(String? hostelFilter) {
    final today = DateTime.now().toIso8601String().split('T')[0];
    final allBuses = [
      _bus(1, 'GH1', 'Pa Hlutea', '9436168711', 23.7285, 92.7180, 'idle', today, '8:30 AM', '1:30 PM'),
      _bus(2, 'GH1', 'Pu Stephen', '8787778119', 23.7260, 92.7165, 'running', today, '9:15 AM', '4:30 PM'),
      _bus(3, 'GH1', 'Mawizuala', '8131811729', 23.7290, 92.7200, 'idle', today, '8:30 AM', '5:30 PM'),
      _bus(4, 'GH2', 'Hruaia', '6909101103', 23.7240, 92.7150, 'running', today, '8:15 AM', '4:30 PM'),
      _bus(5, 'BH1', 'Chhuanga', '9862369186', 23.7275, 92.7185, 'running', today, '8:15 AM', '5:30 PM'),
      _bus(6, 'BH1', 'Pa Dina', '9615408299', 23.7265, 92.7170, 'idle', today, '8:15 AM', '7:00 PM'),
      _bus(7, 'BH1', 'Vk-a', '7005367693', 23.7280, 92.7195, 'running', today, '8:15 PM', '5:30 PM'),
      _bus(8, 'BH1', 'Dama', '7005364878', 23.7255, 92.7160, 'idle', today, '6:30 AM', '12:30 PM', note: 'IoN Digital Centre Mualpui'),
      _bus(9, 'BH1', 'Mala', '6009425695', 23.7295, 92.7205, 'maintenance', today, '1:00 PM', '4:30 PM'),
      _bus(10, 'BH1', 'Rinkima', '7005616947', 23.7270, 92.7175, 'idle', today, '9:15 AM', '1:30 PM'),
      _bus(11, 'BH1', 'Pa Dika', '6909470121', 23.7250, 92.7155, 'running', today, '9:15 AM', '1:30 PM'),
      _bus(12, 'BH1', 'Ramtea', '8729985255', 23.7285, 92.7190, 'idle', today, '10:15 AM', '2:30 PM'),
      _bus(13, 'BH2', 'Lalrammawia', '9862411234', 23.7260, 92.7165, 'running', today, '9:20 AM', '2:00 PM'),
      _bus(14, 'BH2', 'Vanlalruata', '8014567890', 23.7245, 92.7148, 'idle', today, '8:20 AM', '3:20 PM'),
      _bus(15, 'BH2', 'Zohmingliana', '7005223344', 23.7300, 92.7210, 'running', today, '8:20 AM', '11:15 AM'),
      _bus(16, 'BH3', 'Lalduhawma', '9856112233', 23.7230, 92.7140, 'idle', today, '8:00 AM', '4:00 PM'),
      _bus(17, 'BH3', 'Vanlalngaia', '6009334455', 23.7315, 92.7215, 'running', today, '9:00 AM', '5:00 PM'),
      _bus(18, 'BH3', 'Hmingthansanga', '7005556677', 23.7240, 92.7155, 'idle', today, '8:30 AM', '3:30 PM'),
      _bus(19, 'BH3', 'Lalremruata', '8259667788', 23.7305, 92.7205, 'idle', today, '9:30 AM', '4:30 PM'),
      _bus(20, 'BH3', 'Thangmawia', '9612778899', 23.7235, 92.7145, 'running', today, '10:00 AM', '2:00 PM'),
      _bus(21, 'BH4', 'Kaptluanga', '9862990011', 23.7320, 92.7220, 'idle', today, '8:45 AM', '5:00 PM'),
      _bus(22, 'GH2', 'Saka', '9378074359', 23.7245, 92.7152, 'running', today, '8:25 AM', '5:30 PM'),
    ];
    if (hostelFilter != null) return allBuses.where((b) => b['assignedHostel'] == hostelFilter).toList();
    return allBuses;
  }

  Map<String, dynamic> _bus(int num, String hostel, String driver, String phone, double lat, double lng, String status, String date, String fromHostel, String fromMBSE, {String note = ''}) {
    return {
      'busNumber': num,
      'assignedHostel': hostel,
      'status': status,
      'latitude': lat,
      'longitude': lng,
      'speed': status == 'running' ? 25.0 : 0.0,
      'isEnabled': true,
      'route': 'Hostel ↔ MBSE',
      'driver': {'_id': 'drv$num', 'name': driver, 'phone': phone, 'busNumber': num, 'isActive': true},
      'schedule': {'_id': 'sch$num', 'busNumber': num, 'date': date, 'fromHostelTime': fromHostel, 'fromMBSETime': fromMBSE, 'specialNote': note, 'updatedBy': 'admin@nitmz.ac.in'},
    };
  }

  List<Map<String, dynamic>> _getDemoSchedules(String? hostelFilter) {
    return _getDemoBuses(hostelFilter).map((b) => b['schedule'] as Map<String, dynamic>).toList();
  }

  List<Map<String, dynamic>> _getDemoNotifications() {
    return [
      {'_id': 'n1', 'title': 'Bus 5 Departure Alert', 'message': 'Bus 5 will depart from BH1 at 8:15 AM. Please be ready!', 'type': 'departure', 'busNumber': 5, 'targetHostel': 'BH1', 'sentAt': DateTime.now().subtract(const Duration(minutes: 30)).toIso8601String(), 'isRead': false},
      {'_id': 'n2', 'title': 'Bus 7 Schedule Update', 'message': 'Bus 7 schedule updated. From Hostel: 8:15 PM, From MBSE: 5:30 PM', 'type': 'general', 'busNumber': 7, 'targetHostel': 'BH1', 'sentAt': DateTime.now().subtract(const Duration(hours: 2)).toIso8601String(), 'isRead': false},
      {'_id': 'n3', 'title': 'Bus 2 Arriving Soon', 'message': 'Bus 2 (GH1) is 1 km away from hostel. ETA: 5 minutes!', 'type': 'arrival', 'busNumber': 2, 'targetHostel': 'GH1', 'sentAt': DateTime.now().subtract(const Duration(hours: 3)).toIso8601String(), 'isRead': true},
      {'_id': 'n4', 'title': 'Bus 9 Maintenance', 'message': 'Bus 9 is under maintenance today. Please use alternate buses.', 'type': 'delay', 'busNumber': 9, 'targetHostel': 'BH1', 'sentAt': DateTime.now().subtract(const Duration(hours: 5)).toIso8601String(), 'isRead': true},
    ];
  }
}
