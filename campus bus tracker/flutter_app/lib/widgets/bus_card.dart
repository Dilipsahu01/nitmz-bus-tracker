import 'package:flutter/material.dart';
import '../models/models.dart';

class BusCard extends StatelessWidget {
  final BusModel bus;
  final bool compact;
  final bool showDetails;

  const BusCard({super.key, required this.bus, this.compact = false, this.showDetails = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.07), blurRadius: 10, offset: const Offset(0, 3))],
        border: Border.all(color: bus.statusColor.withValues(alpha: 0.25), width: 1),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                // Bus number circle
                Container(
                  width: 52, height: 52,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: [bus.statusColor.withValues(alpha: 0.9), bus.statusColor], begin: Alignment.topLeft, end: Alignment.bottomRight),
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [BoxShadow(color: bus.statusColor.withValues(alpha: 0.3), blurRadius: 8, offset: const Offset(0, 3))],
                  ),
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Text('${bus.busNumber}', style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                    Text('BUS', style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 8, fontWeight: FontWeight.w500)),
                  ]),
                ),
                const SizedBox(width: 12),

                // Info
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Text('Bus ${bus.busNumber}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    const SizedBox(width: 8),
                    Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(color: bus.statusColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          Container(width: 6, height: 6, decoration: BoxDecoration(color: bus.statusColor, shape: BoxShape.circle)),
                          const SizedBox(width: 4),
                          Text(bus.statusLabel, style: TextStyle(color: bus.statusColor, fontSize: 11, fontWeight: FontWeight.w600)),
                        ])),
                  ]),
                  const SizedBox(height: 3),
                  if (bus.driver != null) Row(children: [
                    const Icon(Icons.person_outline, size: 13, color: Colors.grey),
                    const SizedBox(width: 4),
                    Text(bus.driver!.name, style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                  ]),
                  const SizedBox(height: 3),
                  Row(children: [
                    const Icon(Icons.home_outlined, size: 13, color: Colors.grey),
                    const SizedBox(width: 4),
                    Text(bus.assignedHostel, style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                    if (bus.speed > 0) ...[
                      const SizedBox(width: 8),
                      const Icon(Icons.speed, size: 13, color: Colors.grey),
                      const SizedBox(width: 4),
                      Text('${bus.speed.round()} km/h', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                    ],
                  ]),
                ])),

                // Call button
                if (bus.driver?.phone.isNotEmpty == true)
                  Container(
                    width: 40, height: 40,
                    decoration: BoxDecoration(color: const Color(0xFF4CAF50).withValues(alpha: 0.1), shape: BoxShape.circle),
                    child: IconButton(padding: EdgeInsets.zero, icon: const Icon(Icons.phone, size: 20, color: Color(0xFF4CAF50)), onPressed: () {}),
                  ),
              ],
            ),
          ),

          // Schedule info
          if (bus.schedule != null)
            Container(
              decoration: BoxDecoration(
                color: const Color(0xFFF8F9FA),
                borderRadius: const BorderRadius.vertical(bottom: Radius.circular(16)),
              ),
              padding: const EdgeInsets.all(12),
              child: Column(children: [
                Row(children: [
                  _timeChip(Icons.arrow_upward, 'Hostel', bus.schedule!.fromHostelTime, const Color(0xFF1565C0)),
                  const SizedBox(width: 8),
                  _timeChip(Icons.arrow_downward, 'MBSE', bus.schedule!.fromMBSETime, const Color(0xFF4CAF50)),
                  if (bus.status == 'running') ...[
                    const SizedBox(width: 8),
                    Expanded(child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(color: const Color(0xFFFF9800).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
                      child: Column(children: [
                        const Icon(Icons.timer, size: 14, color: Color(0xFFFF9800)),
                        const SizedBox(height: 2),
                        const Text('ETA', style: TextStyle(fontSize: 10, color: Color(0xFFFF9800))),
                        const Text('~5 min', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFFFF9800))),
                      ]),
                    )),
                  ],
                ]),
                if (bus.schedule!.specialNote.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(color: Colors.orange.shade50, borderRadius: BorderRadius.circular(8)),
                    child: Text('📍 ${bus.schedule!.specialNote}', style: const TextStyle(fontSize: 11, color: Colors.orange)),
                  ),
                ],
              ]),
            ),
        ],
      ),
    );
  }

  Widget _timeChip(IconData icon, String label, String time, Color color) {
    return Expanded(child: Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
      child: Column(children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(height: 2),
        Text(label, style: TextStyle(fontSize: 10, color: color)),
        Text(time, style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: color)),
      ]),
    ));
  }
}
