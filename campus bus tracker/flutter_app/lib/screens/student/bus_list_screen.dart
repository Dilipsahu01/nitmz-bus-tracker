import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/bus_service.dart';
import '../../services/auth_service.dart';
import '../../widgets/bus_card.dart';

class BusListScreen extends StatefulWidget {
  const BusListScreen({super.key});

  @override
  State<BusListScreen> createState() => _BusListScreenState();
}

class _BusListScreenState extends State<BusListScreen> {
  final TextEditingController _searchCtrl = TextEditingController();
  String _searchQuery = '';
  String _filterStatus = 'all';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bus = context.watch<BusService>();
    final auth = context.watch<AuthService>();
    final hostel = auth.currentUser?.hostelId ?? '';
    var buses = bus.getBusesByHostel(hostel);

    if (_searchQuery.isNotEmpty) {
      buses = buses.where((b) => b.busNumber.toString().contains(_searchQuery) || (b.driver?.name.toLowerCase().contains(_searchQuery.toLowerCase()) ?? false)).toList();
    }
    if (_filterStatus != 'all') {
      buses = buses.where((b) => b.status == _filterStatus).toList();
    }

    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text('My Buses'),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.filter_list),
            onSelected: (v) => setState(() => _filterStatus = v),
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'all', child: Text('All Buses')),
              const PopupMenuItem(value: 'running', child: Text('Running')),
              const PopupMenuItem(value: 'idle', child: Text('Idle')),
              const PopupMenuItem(value: 'maintenance', child: Text('Maintenance')),
            ],
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(60),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: TextField(
              controller: _searchCtrl,
              onChanged: (v) => setState(() => _searchQuery = v),
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'Search by bus number or driver...',
                hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.7)),
                prefixIcon: const Icon(Icons.search, color: Colors.white),
                filled: true, fillColor: Colors.white.withValues(alpha: 0.2),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                suffixIcon: _searchQuery.isNotEmpty ? IconButton(icon: const Icon(Icons.clear, color: Colors.white), onPressed: () { _searchCtrl.clear(); setState(() => _searchQuery = ''); }) : null,
              ),
            ),
          ),
        ),
      ),
      body: buses.isEmpty
          ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              const Icon(Icons.search_off, size: 64, color: Colors.grey),
              const SizedBox(height: 12),
              Text(_searchQuery.isNotEmpty ? 'No buses found for "$_searchQuery"' : 'No buses available', style: const TextStyle(color: Colors.grey, fontSize: 16)),
            ]))
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: buses.length,
              itemBuilder: (_, i) => Padding(padding: const EdgeInsets.only(bottom: 12), child: BusCard(bus: buses[i], compact: false, showDetails: true)),
            ),
    );
  }
}
