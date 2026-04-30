import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/auth_service.dart';
import '../../services/bus_service.dart';
import '../../services/api_service.dart';
import '../../services/notification_service.dart';
import '../student/map_screen.dart';
import '../notifications_screen.dart';
import 'admin_dashboard.dart';
import 'schedule_editor.dart';
import 'bus_management.dart';

class AdminHome extends StatefulWidget {
  const AdminHome({super.key});

  @override
  State<AdminHome> createState() => _AdminHomeState();
}

class _AdminHomeState extends State<AdminHome> {
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadData());
  }

  Future<void> _loadData() async {
    final auth = context.read<AuthService>();
    final bus = context.read<BusService>();
    final notif = context.read<NotificationService>();
    final api = context.read<ApiService>();
    await bus.loadBuses(api, token: auth.currentUser?.token);
    await bus.loadSchedules(api, token: auth.currentUser?.token);
    await notif.loadNotifications(api, token: auth.currentUser?.token);
  }

  @override
  Widget build(BuildContext context) {
    final notif = context.watch<NotificationService>();

    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: const [
          AdminDashboard(),
          BusManagementScreen(),
          ScheduleEditor(),
          MapScreen(),
          NotificationsScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (i) => setState(() => _currentIndex = i),
        backgroundColor: Colors.white,
        elevation: 8,
        destinations: [
          const NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'Dashboard'),
          const NavigationDestination(icon: Icon(Icons.directions_bus_outlined), selectedIcon: Icon(Icons.directions_bus), label: 'Buses'),
          const NavigationDestination(icon: Icon(Icons.schedule_outlined), selectedIcon: Icon(Icons.schedule), label: 'Schedule'),
          const NavigationDestination(icon: Icon(Icons.map_outlined), selectedIcon: Icon(Icons.map), label: 'Live Map'),
          NavigationDestination(
            icon: Badge(isLabelVisible: notif.unreadCount > 0, label: Text('${notif.unreadCount}'), child: const Icon(Icons.notifications_outlined)),
            selectedIcon: const Icon(Icons.notifications),
            label: 'Alerts',
          ),
        ],
      ),
    );
  }
}
