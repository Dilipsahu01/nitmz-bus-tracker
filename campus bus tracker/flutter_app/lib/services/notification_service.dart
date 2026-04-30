import 'package:flutter/foundation.dart';
import '../models/models.dart';
import 'api_service.dart';

class NotificationService extends ChangeNotifier {
  List<NotificationModel> _notifications = [];
  bool _isLoading = false;

  List<NotificationModel> get notifications => _notifications;
  bool get isLoading => _isLoading;
  int get unreadCount => _notifications.where((n) => !n.isRead).length;

  Future<void> loadNotifications(ApiService api, {String? hostel, String? token}) async {
    _isLoading = true;
    notifyListeners();

    try {
      final data = await api.getNotifications(hostel: hostel, token: token);
      _notifications = data.map((n) => NotificationModel.fromJson(n as Map<String, dynamic>)).toList();
    } catch (e) {
      if (kDebugMode) debugPrint('Notification load error: $e');
    }

    _isLoading = false;
    notifyListeners();
  }

  Future<bool> sendNotification({
    required String title,
    required String message,
    required String type,
    int? busNumber,
    String? targetHostel,
    required ApiService api,
    required String token,
  }) async {
    try {
      final data = await api.sendNotification({
        'title': title,
        'message': message,
        'type': type,
        'busNumber': busNumber,
        'targetHostel': targetHostel,
      }, token);

      _notifications.insert(0, NotificationModel.fromJson(data));
      notifyListeners();
      return true;
    } catch (e) {
      return false;
    }
  }

  void markAsRead(String id) {
    final idx = _notifications.indexWhere((n) => n.id == id);
    if (idx != -1) {
      _notifications[idx].isRead = true;
      notifyListeners();
    }
  }

  void markAllAsRead() {
    for (var n in _notifications) { n.isRead = true; }
    notifyListeners();
  }

  void addLocalNotification(NotificationModel notification) {
    _notifications.insert(0, notification);
    notifyListeners();
  }
}
