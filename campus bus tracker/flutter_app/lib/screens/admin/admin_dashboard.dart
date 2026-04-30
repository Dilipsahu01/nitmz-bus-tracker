import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/auth_service.dart';
import '../../services/bus_service.dart';
import '../../services/notification_service.dart';
import '../../services/api_service.dart';
import '../../models/models.dart';
import '../auth/login_screen.dart';

class AdminDashboard extends StatelessWidget {
  const AdminDashboard({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final bus = context.watch<BusService>();
    final notif = context.watch<NotificationService>();
    final now = DateTime.now();
    final roleLabel = auth.currentUser?.role == 'caretaker' ? 'CARETAKER' : 'ADMIN';

    final runningBuses = bus.buses.where((b) => b.status == 'running').toList();

    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 160,
            pinned: true,
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0xFF0D47A1), Color(0xFF1565C0), Color(0xFF283593)],
                    begin: Alignment.topLeft, end: Alignment.bottomRight,
                  ),
                ),
                child: SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.end, children: [
                      Row(children: [
                        Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(color: Colors.orange, borderRadius: BorderRadius.circular(20)),
                          child: Row(children: [const Icon(Icons.admin_panel_settings, size: 14, color: Colors.white), const SizedBox(width: 4), Text(roleLabel, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold))])),
                        const Spacer(),
                        IconButton(icon: const Icon(Icons.logout, color: Colors.white, size: 20), onPressed: () async {
                          await context.read<AuthService>().logout();
                          if (context.mounted) Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const LoginScreen()));
                        }),
                      ]),
                      const SizedBox(height: 8),
                      Text(auth.currentUser?.name ?? 'Admin', style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                      Text('NIT Mizoram • ${_formatDate(now)}', style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 13)),
                    ]),
                  ),
                ),
              ),
            ),
            title: const Text('Admin Dashboard', style: TextStyle(fontSize: 16)),
          ),

          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                if (bus.error != null) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.red.shade200),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.error_outline, color: Colors.red),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            bus.error!.replaceAll('Exception: ', ''),
                            style: const TextStyle(color: Colors.red, fontSize: 13),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ],

                // Stats Grid
                GridView.count(
                  crossAxisCount: 2, crossAxisSpacing: 12, mainAxisSpacing: 12,
                  shrinkWrap: true, physics: const NeverScrollableScrollPhysics(),
                  childAspectRatio: 1.4,
                  children: [
                    _AdminStatCard(label: 'Total Buses', value: '${bus.totalBusCount}', icon: Icons.directions_bus, color: const Color(0xFF1565C0), subtitle: '${bus.totalBusCount} in system'),
                    _AdminStatCard(label: 'Running', value: '${bus.runningBusCount}', icon: Icons.play_circle, color: const Color(0xFF4CAF50), subtitle: 'Live tracking'),
                    _AdminStatCard(label: 'Maintenance', value: '${bus.maintenanceBusCount}', icon: Icons.build, color: const Color(0xFFFF5722), subtitle: 'Off service'),
                    _AdminStatCard(label: 'Notifications', value: '${notif.notifications.length}', icon: Icons.notifications, color: const Color(0xFF9C27B0), subtitle: '${notif.unreadCount} unread'),
                  ],
                ),
                const SizedBox(height: 20),

                // Quick Actions
                const Text('Quick Actions', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(child: _QuickActionBtn(icon: Icons.notification_add, label: 'Send Alert', color: const Color(0xFFFF9800), onTap: () => _showSendNotification(context))),
                  const SizedBox(width: 10),
                  Expanded(child: _QuickActionBtn(icon: Icons.warning_rounded, label: 'Emergency', color: const Color(0xFFFF5722), onTap: () => _showEmergency(context))),
                  const SizedBox(width: 10),
                  Expanded(child: _QuickActionBtn(icon: Icons.refresh, label: bus.isLoading ? 'Loading' : 'Refresh', color: const Color(0xFF1565C0), onTap: () async {
                    if (bus.isLoading) return;
                    final api = context.read<ApiService>();
                    final busService = context.read<BusService>();
                    final notifService = context.read<NotificationService>();
                    final token = auth.currentUser?.token;
                    try {
                      await busService.loadBuses(api, token: token);
                      await busService.loadSchedules(api, token: token);
                      await notifService.loadNotifications(api, token: token);
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Dashboard refreshed')),
                        );
                      }
                    } catch (e) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Refresh failed: $e')),
                        );
                      }
                    }
                  })),
                ]),
                const SizedBox(height: 20),

                // Hostel Bus Summary
                const Text('Hostel Summary', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                ...HostelModel.allHostels.map((h) {
                  final hostelBuses = bus.getBusesByHostel(h.id);
                  final running = hostelBuses.where((b) => b.status == 'running').length;
                  return _HostelRow(hostel: h, totalBuses: hostelBuses.length, runningBuses: running);
                }),
                const SizedBox(height: 20),

                // Running buses
                if (runningBuses.isNotEmpty) ...[
                  const Text('Running Buses', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  ...runningBuses.take(5).map((b) => _BusStatusRow(bus: b)),
                ],
                const SizedBox(height: 80),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(DateTime dt) {
    final months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${dt.day} ${months[dt.month - 1]} ${dt.year}';
  }

  void _showSendNotification(BuildContext context) {
    showModalBottomSheet(context: context, isScrollControlled: true, backgroundColor: Colors.transparent, builder: (_) => const _SendNotificationSheet());
  }

  void _showEmergency(BuildContext context) {
    showDialog(context: context, builder: (_) => AlertDialog(
      title: const Row(children: [Icon(Icons.warning, color: Colors.red), SizedBox(width: 8), Text('Emergency Alert')]),
      content: const Text('Send emergency alert to all students?'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        ElevatedButton(
          style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
          onPressed: () {
            Navigator.pop(context);
            context.read<NotificationService>().sendNotification(
              title: '🚨 EMERGENCY ALERT',
              message: 'Emergency situation. All buses suspended. Contact hostel caretaker immediately.',
              type: 'emergency',
              api: context.read<ApiService>(),
              token: context.read<AuthService>().currentUser?.token ?? '',
            );
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Emergency alert sent!'), backgroundColor: Colors.red));
          },
          child: const Text('Send'),
        ),
      ],
    ));
  }
}

class _AdminStatCard extends StatelessWidget {
  final String label, value, subtitle;
  final IconData icon;
  final Color color;

  const _AdminStatCard({required this.label, required this.value, required this.icon, required this.color, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, color: color, size: 22)),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(value, style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: color)),
          Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          Text(subtitle, style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
        ]),
      ]),
    );
  }
}

class _QuickActionBtn extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _QuickActionBtn({required this.icon, required this.label, required this.color, required this.onTap});

  @override
Widget build(BuildContext context) {
  return GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 26),
          const SizedBox(height: 6),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
            textAlign: TextAlign.center,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    ),
  );
}
}

class _HostelRow extends StatelessWidget {
  final HostelModel hostel;
  final int totalBuses, runningBuses;

  const _HostelRow({required this.hostel, required this.totalBuses, required this.runningBuses});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 6)]),
      child: Row(children: [
        Container(width: 36, height: 36, decoration: BoxDecoration(
          color: hostel.type == 'Girls' ? Colors.pink.shade50 : Colors.blue.shade50,
          borderRadius: BorderRadius.circular(8)),
          child: Center(child: Icon(hostel.type == 'Girls' ? Icons.female : Icons.male,
              color: hostel.type == 'Girls' ? Colors.pink : Colors.blue, size: 20))),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(hostel.fullName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
          Text('${hostel.type} Hostel', style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
        ])),
        Text('$totalBuses buses', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
        const SizedBox(width: 8),
        Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: const Color(0xFF4CAF50).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
            child: Text('$runningBuses live', style: const TextStyle(color: Color(0xFF4CAF50), fontSize: 12, fontWeight: FontWeight.w600))),
      ]),
    );
  }
}

class _BusStatusRow extends StatelessWidget {
  final BusModel bus;

  const _BusStatusRow({required this.bus});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 6)]),
      child: Row(children: [
        Container(width: 40, height: 40, decoration: BoxDecoration(color: bus.statusColor.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
            child: Center(child: Text('${bus.busNumber}', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: bus.statusColor)))),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(bus.driver?.name ?? 'Unknown', style: const TextStyle(fontWeight: FontWeight.w600)),
          Text('${bus.assignedHostel} • ${bus.speed.round()} km/h', style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
        ])),
        Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(color: bus.statusColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
            child: Text(bus.statusLabel, style: TextStyle(color: bus.statusColor, fontSize: 12, fontWeight: FontWeight.w600))),
      ]),
    );
  }
}

class _SendNotificationSheet extends StatefulWidget {
  const _SendNotificationSheet();

  @override
  State<_SendNotificationSheet> createState() => _SendNotificationSheetState();
}

class _SendNotificationSheetState extends State<_SendNotificationSheet> {
  final _titleCtrl = TextEditingController();
  final _msgCtrl = TextEditingController();
  String _type = 'general';
  String? _targetHostel;
  int? _busNumber;

  @override
  void dispose() { _titleCtrl.dispose(); _msgCtrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)))),
        const SizedBox(height: 16),
        const Text('Send Notification', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        TextField(controller: _titleCtrl, decoration: InputDecoration(labelText: 'Title', border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)), contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12))),
        const SizedBox(height: 12),
        TextField(controller: _msgCtrl, maxLines: 3, decoration: InputDecoration(labelText: 'Message', border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)), contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12))),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: DropdownButtonFormField<String>(
            initialValue: _type, decoration: InputDecoration(labelText: 'Type', border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)), contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8)),
            items: ['general','departure','arrival','delay','emergency'].map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
            onChanged: (v) => setState(() => _type = v!),
          )),
          const SizedBox(width: 10),
          Expanded(child: DropdownButtonFormField<String?>(
            initialValue: _targetHostel, decoration: InputDecoration(labelText: 'Hostel (optional)', border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)), contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8)),
            items: [const DropdownMenuItem(value: null, child: Text('All')), ...HostelModel.allHostels.map((h) => DropdownMenuItem(value: h.id, child: Text(h.id)))],
            onChanged: (v) => setState(() => _targetHostel = v),
          )),
        ]),
        const SizedBox(height: 16),
        SizedBox(width: double.infinity, height: 48,
          child: ElevatedButton.icon(
            icon: const Icon(Icons.send),
            label: const Text('Send Notification'),
            onPressed: () async {
              if (_titleCtrl.text.isEmpty || _msgCtrl.text.isEmpty) return;
              final auth = context.read<AuthService>();
              final api = context.read<ApiService>();
              await context.read<NotificationService>().sendNotification(
                title: _titleCtrl.text, message: _msgCtrl.text, type: _type,
                busNumber: _busNumber, targetHostel: _targetHostel,
                api: api, token: auth.currentUser?.token ?? '',
              );
              if (context.mounted) {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Notification sent!')));
              }
            },
          ),
        ),
      ]),
    );
  }
}
