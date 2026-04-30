import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/models.dart';
import 'api_service.dart';

class AuthService extends ChangeNotifier {
  UserModel? _currentUser;
  bool _isLoading = false;
  String? _error;

  UserModel? get currentUser => _currentUser;
  bool get isLoading => _isLoading;
  String? get error => _error;
  bool get isLoggedIn => _currentUser != null;
  bool get isAdmin => _currentUser?.isAdmin ?? false;

  Future<void> checkAuthState(ApiService api) async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    final email = prefs.getString('email');
    final name = prefs.getString('name');
    final role = prefs.getString('role');
    final hostelId = prefs.getString('hostelId');
    final userId = prefs.getString('userId');

    if (token != null && email != null) {
      try {
        final remoteUser = await api.getCurrentUser(token);
        _currentUser = UserModel(
          id: (remoteUser['id'] ?? userId ?? '').toString(),
          name: (remoteUser['name'] ?? name ?? '').toString(),
          email: (remoteUser['email'] ?? email).toString(),
          role: (remoteUser['role'] ?? role ?? 'student').toString(),
          hostelId: remoteUser['hostelId']?.toString() ?? hostelId,
          token: token,
        );

        await prefs.setString('email', _currentUser!.email);
        await prefs.setString('name', _currentUser!.name);
        await prefs.setString('role', _currentUser!.role);
        await prefs.setString('userId', _currentUser!.id);
        if (_currentUser!.hostelId != null && _currentUser!.hostelId!.isNotEmpty) {
          await prefs.setString('hostelId', _currentUser!.hostelId!);
        }
      } catch (_) {
        _currentUser = null;
        await prefs.clear();
      }

      notifyListeners();
    }
  }

  Future<bool> login(String email, String password, ApiService api) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final data = await api.login(email, password);
      final userJson = data['user'] as Map<String, dynamic>;
      userJson['token'] = data['token'];
      _currentUser = UserModel.fromJson(userJson);
      _currentUser!.token = data['token'];

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('token', data['token']);
      await prefs.setString('email', _currentUser!.email);
      await prefs.setString('name', _currentUser!.name);
      await prefs.setString('role', _currentUser!.role);
      await prefs.setString('userId', _currentUser!.id);
      if (_currentUser!.hostelId != null) {
        await prefs.setString('hostelId', _currentUser!.hostelId!);
      }

      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString().replaceAll('Exception: ', '');
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> register(String name, String email, String password, String hostelId, ApiService api) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final data = await api.register(name, email, password, hostelId);
      final userJson = data['user'] as Map<String, dynamic>;
      userJson['token'] = data['token'];
      _currentUser = UserModel.fromJson(userJson);

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('token', data['token']);
      await prefs.setString('email', _currentUser!.email);
      await prefs.setString('name', _currentUser!.name);
      await prefs.setString('role', _currentUser!.role);
      await prefs.setString('userId', _currentUser!.id);
      if (_currentUser!.hostelId != null) {
        await prefs.setString('hostelId', _currentUser!.hostelId!);
      }

      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString().replaceAll('Exception: ', '');
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    _currentUser = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
    notifyListeners();
  }
}
