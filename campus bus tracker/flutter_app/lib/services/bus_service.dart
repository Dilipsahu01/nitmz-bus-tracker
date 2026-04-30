import 'dart:async';
import 'dart:math';
import 'package:flutter/foundation.dart';
import '../models/models.dart';
import 'api_service.dart';

class BusService extends ChangeNotifier {
  List<BusModel> _buses = [];
  List<ScheduleModel> _schedules = [];
  bool _isLoading = false;
  String? _error;

  List<BusModel> get buses => _buses;
  List<ScheduleModel> get schedules => _schedules;
  bool get isLoading => _isLoading;
  String? get error => _error;

  List<BusModel> getBusesByHostel(String hostel) =>
      _buses.where((b) => b.assignedHostel == hostel).toList();

  BusModel? getBusByNumber(int number) {
    try { return _buses.firstWhere((b) => b.busNumber == number); } catch (e) { return null; }
  }

  int get runningBusCount => _buses.where((b) => b.status == 'running').length;
  int get maintenanceBusCount => _buses.where((b) => b.status == 'maintenance').length;
  int get totalBusCount => _buses.length;

  Future<void> loadBuses(ApiService api, {String? hostel, String? token}) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final data = await api.getBuses(hostel: hostel, token: token);
      _buses = data.map((b) => BusModel.fromJson(b as Map<String, dynamic>)).toList();
    } catch (e) {
      _error = e.toString();
    }

    _isLoading = false;
    notifyListeners();
  }

  Future<void> loadSchedules(ApiService api, {String? hostel, String? token}) async {
    try {
      final data = await api.getSchedules(hostel: hostel, token: token);
      _schedules = data.map((s) => ScheduleModel.fromJson(s as Map<String, dynamic>)).toList();
      notifyListeners();
    } catch (e) {
      if (kDebugMode) debugPrint('Schedule load error: $e');
    }
  }

  Future<bool> updateSchedule(ScheduleModel schedule, ApiService api, String token) async {
    try {
      await api.updateSchedule(schedule.toJson(), token);
      final idx = _schedules.indexWhere((s) => s.busNumber == schedule.busNumber && s.date == schedule.date);
      if (idx != -1) {
        _schedules[idx] = schedule;
      } else {
        _schedules.add(schedule);
      }
      notifyListeners();
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<bool> updateBusStatus(int busNumber, String status, ApiService api, String token) async {
    try {
      final response = await api.updateBusStatus(busNumber, status, token);
      final idx = _buses.indexWhere((b) => b.busNumber == busNumber);
      if (idx != -1) {
        final bus = _buses[idx];
        final updatedBus = response['data'] is Map<String, dynamic>
            ? response['data'] as Map<String, dynamic>
            : response;
        _buses[idx] = BusModel(
          busNumber: (updatedBus['busNumber'] ?? bus.busNumber) as int,
          assignedHostel: (updatedBus['assignedHostel'] ?? bus.assignedHostel).toString(),
          status: (updatedBus['status'] ?? status).toString(),
          latitude: ((updatedBus['latitude'] ?? bus.latitude) as num).toDouble(),
          longitude: ((updatedBus['longitude'] ?? bus.longitude) as num).toDouble(),
          speed: ((updatedBus['speed'] ?? bus.speed) as num).toDouble(),
          isEnabled: updatedBus['isEnabled'] is bool
              ? updatedBus['isEnabled'] as bool
              : bus.isEnabled,
          driver: bus.driver,
          schedule: bus.schedule,
          route: (updatedBus['route'] ?? bus.route).toString(),
        );
        notifyListeners();
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  String calculateETA(BusModel bus, double hostLat, double hostLng) {
    final dist = _haversine(bus.latitude, bus.longitude, hostLat, hostLng);
    if (bus.status != 'running') return 'Not running';
    final speed = bus.speed > 0 ? bus.speed : 30;
    final minutes = (dist / speed * 60).round();
    if (minutes < 2) return 'Arriving now';
    return '$minutes min';
  }

  double _haversine(double lat1, double lng1, double lat2, double lng2) {
    const r = 6371.0;
    final dLat = _toRad(lat2 - lat1);
    final dLng = _toRad(lng2 - lng1);
    final a = sin(dLat / 2) * sin(dLat / 2) +
        cos(_toRad(lat1)) * cos(_toRad(lat2)) * sin(dLng / 2) * sin(dLng / 2);
    return r * 2 * atan2(sqrt(a), sqrt(1 - a));
  }

  double _toRad(double deg) => deg * pi / 180;

}
