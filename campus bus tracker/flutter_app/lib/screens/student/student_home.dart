import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/auth_service.dart';
import '../../services/bus_service.dart';
import '../../services/api_service.dart';
import '../../services/notification_service.dart';
import '../../models/models.dart';
import '../auth/login_screen.dart';
import 'bus_list_screen.dart';
import 'map_screen.dart';
import '../notifications_screen.dart';
import '../../widgets/bus_card.dart';
import '../../widgets/stat_card.dart';

class StudentHome extends StatefulWidget {
  const StudentHome({super.key});

  @override
  State<StudentHome> createState() => _StudentHomeState();
}

class _StudentHomeState extends State<StudentHome> {
  int _currentIndex = 0;
  final TextEditingController _searchCtrl = TextEditingController();

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
    await bus.loadBuses(api, hostel: auth.currentUser?.hostelId, token: auth.currentUser?.token);
    await bus.loadSchedules(api, hostel: auth.currentUser?.hostelId, token: auth.currentUser?.token);
    await notif.loadNotifications(api, hostel: auth.currentUser?.hostelId, token: auth.currentUser?.token);
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final notif = context.watch<NotificationService>();

    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: const [
          _StudentDashboard(),
          BusListScreen(),
          MapScreen(),
          NotificationsScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (i) => setState(() => _currentIndex = i),
        backgroundColor: Colors.white,
        elevation: 8,
        shadowColor: Colors.black26,
        destinations: [
          const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          const NavigationDestination(icon: Icon(Icons.directions_bus_outlined), selectedIcon: Icon(Icons.directions_bus), label: 'Buses'),
          const NavigationDestination(icon: Icon(Icons.map_outlined), selectedIcon: Icon(Icons.map), label: 'Live Map'),
          NavigationDestination(
            icon: Badge(isLabelVisible: notif.unreadCount > 0, label: Text('${notif.unreadCount}'), child: const Icon(Icons.notifications_outlined)),
            selectedIcon: Badge(isLabelVisible: notif.unreadCount > 0, label: Text('${notif.unreadCount}'), child: const Icon(Icons.notifications)),
            label: 'Alerts',
          ),
        ],
      ),
    );
  }
}

class _StudentDashboard extends StatelessWidget {
  const _StudentDashboard();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final bus = context.watch<BusService>();
    final hostel = auth.currentUser?.hostelId ?? '';
    final hostelBuses = bus.getBusesByHostel(hostel);
    final runningBuses = hostelBuses.where((b) => b.status == 'running').toList();
    final now = DateTime.now();
    final greeting = now.hour < 12 ? 'Good Morning' : now.hour < 17 ? 'Good Afternoon' : 'Good Evening';

    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      body: RefreshIndicator(
        onRefresh: () async {
          final api = context.read<ApiService>();
          await context.read<BusService>().loadBuses(api, hostel: hostel, token: auth.currentUser?.token);
        },
        child: CustomScrollView(
          slivers: [
            // App Bar
            SliverAppBar(
              expandedHeight: 180,
              pinned: true,
              flexibleSpace: FlexibleSpaceBar(
                background: Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFF0D47A1), Color(0xFF1565C0), Color(0xFF1976D2)],
                    ),
                  ),
                  child: SafeArea(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          Row(children: [
                            CircleAvatar(backgroundColor: Colors.white.withValues(alpha: 0.2), radius: 20,
                                child: const Icon(Icons.person, color: Colors.white, size: 22)),
                            const SizedBox(width: 10),
                            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text('$greeting,', style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 13)),
                              Text(auth.currentUser?.name ?? 'Student', style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
                            ])),
                            _LogoutButton(),
                          ]),
                          const SizedBox(height: 12),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: Colors.white.withValues(alpha: 0.3))),
                            child: Row(children: [
                              const Icon(Icons.home_outlined, color: Colors.white, size: 16),
                              const SizedBox(width: 6),
                              Text('$hostel • ${HostelModel.allHostels.firstWhere((h) => h.id == hostel, orElse: () => const HostelModel(id: '', name: '', type: '', fullName: '')).fullName}',
                                  style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500)),
                            ]),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              title: const Text('Campus Bus Tracker', style: TextStyle(fontSize: 16)),
            ),

            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

                  // Stats Row
                  Row(children: [
                    Expanded(child: StatCard(label: 'My Buses', value: '${hostelBuses.length}', icon: Icons.directions_bus, color: const Color(0xFF1565C0))),
                    const SizedBox(width: 10),
                    Expanded(child: StatCard(label: 'Running', value: '${runningBuses.length}', icon: Icons.play_circle, color: const Color(0xFF4CAF50))),
                    const SizedBox(width: 10),
                    Expanded(child: StatCard(label: 'Today', value: _formatDate(now), icon: Icons.calendar_today, color: const Color(0xFF9C27B0))),
                  ]),
                  const SizedBox(height: 20),

                  // Running buses
                  if (runningBuses.isNotEmpty) ...[
                    const Row(children: [
                      Icon(Icons.circle, size: 10, color: Color(0xFF4CAF50)),
                      SizedBox(width: 6),
                      Text('Live Buses', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    ]),
                    const SizedBox(height: 10),
                    ...runningBuses.take(3).map((b) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: BusCard(bus: b, compact: false),
                    )),
                    const SizedBox(height: 10),
                  ],

                  // Today's Schedule
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    const Text("Today's Schedule", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    Text(_formatFullDate(now), style: const TextStyle(fontSize: 12, color: Colors.grey)),
                  ]),
                  const SizedBox(height: 10),

                  if (bus.isLoading)
                    const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()))
                  else if (hostelBuses.isEmpty)
                    _EmptyState()
                  else
                    ...hostelBuses.map((b) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: BusCard(bus: b, compact: false),
                    )),
                  const SizedBox(height: 80),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime dt) {
    final months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${dt.day} ${months[dt.month - 1]}';
  }

  String _formatFullDate(DateTime dt) {
    final days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    final months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return '${days[dt.weekday - 1]}, ${dt.day} ${months[dt.month - 1]} ${dt.year}';
  }
}

class _EmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
      child: const Column(children: [
        Icon(Icons.directions_bus_outlined, size: 48, color: Colors.grey),
        SizedBox(height: 12),
        Text('No buses found for your hostel', style: TextStyle(color: Colors.grey)),
        Text('Pull to refresh', style: TextStyle(color: Colors.grey, fontSize: 12)),
      ]),
    );
  }
}

class _LogoutButton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.logout, color: Colors.white),
      onPressed: () async {
        await context.read<AuthService>().logout();
        if (context.mounted) Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const LoginScreen()));
      },
    );
  }
}
