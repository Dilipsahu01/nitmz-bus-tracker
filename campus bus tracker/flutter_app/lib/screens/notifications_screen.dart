import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/notification_service.dart';
import '../models/models.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  @override
  Widget build(BuildContext context) {
    final notif = context.watch<NotificationService>();
    final notifications = notif.notifications;

    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Notifications'),
          if (notif.unreadCount > 0) Text('${notif.unreadCount} unread', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.normal)),
        ]),
        actions: [
          if (notif.unreadCount > 0)
            TextButton(
              onPressed: notif.markAllAsRead,
              child: const Text('Mark all read', style: TextStyle(color: Colors.white, fontSize: 12)),
            ),
        ],
      ),
      body: notifications.isEmpty
          ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              const Icon(Icons.notifications_none, size: 64, color: Colors.grey),
              const SizedBox(height: 12),
              const Text('No notifications yet', style: TextStyle(color: Colors.grey, fontSize: 16)),
              const SizedBox(height: 8),
              Text('You\'ll get updates about your buses here', style: TextStyle(color: Colors.grey.shade400, fontSize: 13)),
            ]))
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: notifications.length,
              itemBuilder: (_, i) {
                final n = notifications[i];
                return _NotificationTile(notification: n, onTap: () => notif.markAsRead(n.id));
              },
            ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  final NotificationModel notification;
  final VoidCallback onTap;

  const _NotificationTile({required this.notification, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(
          color: notification.isRead ? Colors.white : notification.typeColor.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: notification.isRead ? Colors.transparent : notification.typeColor.withValues(alpha: 0.3),
            width: 1.5,
          ),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 44, height: 44,
              decoration: BoxDecoration(color: notification.typeColor.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
              child: Icon(notification.typeIcon, color: notification.typeColor, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(notification.title, style: TextStyle(fontWeight: notification.isRead ? FontWeight.w500 : FontWeight.bold, fontSize: 14))),
                if (!notification.isRead) Container(width: 8, height: 8, decoration: BoxDecoration(color: notification.typeColor, shape: BoxShape.circle)),
              ]),
              const SizedBox(height: 4),
              Text(notification.message, style: TextStyle(color: Colors.grey.shade600, fontSize: 13, height: 1.3)),
              const SizedBox(height: 6),
              Row(children: [
                Icon(Icons.access_time, size: 12, color: Colors.grey.shade400),
                const SizedBox(width: 4),
                Text(_formatTime(notification.sentAt), style: TextStyle(color: Colors.grey.shade400, fontSize: 11)),
                if (notification.busNumber != null) ...[
                  const SizedBox(width: 8),
                  Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(color: const Color(0xFF1565C0).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
                      child: Text('Bus ${notification.busNumber}', style: const TextStyle(color: Color(0xFF1565C0), fontSize: 11, fontWeight: FontWeight.w600))),
                ],
              ]),
            ])),
          ]),
        ),
      ),
    );
  }

  String _formatTime(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }
}
