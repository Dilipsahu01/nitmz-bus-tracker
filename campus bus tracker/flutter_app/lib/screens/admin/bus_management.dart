import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/auth_service.dart';
import '../../services/bus_service.dart';
import '../../services/api_service.dart';
import '../../models/models.dart';

class BusManagementScreen extends StatefulWidget {
  const BusManagementScreen({super.key});

  @override
  State<BusManagementScreen> createState() => _BusManagementScreenState();
}

class _BusManagementScreenState extends State<BusManagementScreen> {
  String? _selectedHostel;

  @override
  Widget build(BuildContext context) {
    final bus = context.watch<BusService>();
    final auth = context.watch<AuthService>();

    var buses = _selectedHostel != null ? bus.getBusesByHostel(_selectedHostel!) : bus.buses;

    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text('Bus Management'),
        actions: [
          PopupMenuButton<String?>(
            icon: const Icon(Icons.filter_list),
            onSelected: (v) => setState(() => _selectedHostel = v),
            itemBuilder: (_) => [
              const PopupMenuItem(value: null, child: Text('All Hostels')),
              ...HostelModel.allHostels.map((h) => PopupMenuItem(value: h.id, child: Text(h.fullName))),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          // Filter chips
          SizedBox(
            height: 50,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              children: [
                _filterChip('All', null),
                ...HostelModel.allHostels.map((h) => _filterChip(h.name, h.id)),
              ],
            ),
          ),

          Expanded(
            child: bus.isLoading
                ? const Center(child: CircularProgressIndicator())
                : buses.isEmpty
                    ? const Center(child: Text('No buses found'))
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: buses.length,
                        itemBuilder: (_, i) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _AdminBusCard(bus: buses[i]),
                        ),
                      ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showAddBusSheet(context),
        icon: const Icon(Icons.add),
        label: const Text('Add Bus'),
      ),
    );
  }

  void _showAddBusSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _AddBusSheet(),
    );
  }

  Widget _filterChip(String label, String? value) {
    final selected = _selectedHostel == value;
    return GestureDetector(
      onTap: () => setState(() => _selectedHostel = value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFF1565C0) : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: selected ? const Color(0xFF1565C0) : Colors.grey.shade300),
        ),
        child: Text(label, style: TextStyle(color: selected ? Colors.white : Colors.grey.shade700, fontWeight: selected ? FontWeight.bold : FontWeight.normal, fontSize: 13)),
      ),
    );
  }
}

class _AdminBusCard extends StatelessWidget {
  final BusModel bus;

  const _AdminBusCard({required this.bus});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 8)],
      ),
      child: Column(children: [
        // Header
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: bus.statusColor.withValues(alpha: 0.08),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
          ),
          child: Row(children: [
            Container(width: 44, height: 44, decoration: BoxDecoration(color: bus.statusColor.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)),
                child: Center(child: Text('${bus.busNumber}', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: bus.statusColor)))),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Bus ${bus.busNumber}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              Text(bus.assignedHostel, style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
            ])),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: bus.statusColor, borderRadius: BorderRadius.circular(20)),
              child: Text(bus.statusLabel, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
            ),
          ]),
        ),

        // Details
        Padding(
          padding: const EdgeInsets.all(14),
          child: Column(children: [
            // Driver info
            Row(children: [
              const Icon(Icons.person, size: 18, color: Color(0xFF1565C0)),
              const SizedBox(width: 8),
              Expanded(child: Text(bus.driver?.name ?? 'Unknown', style: const TextStyle(fontWeight: FontWeight.w500))),
              GestureDetector(
                onTap: () {},
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: const Color(0xFF4CAF50).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.phone, size: 14, color: Color(0xFF4CAF50)),
                    const SizedBox(width: 4),
                    Text(bus.driver?.phone ?? '', style: const TextStyle(color: Color(0xFF4CAF50), fontSize: 12, fontWeight: FontWeight.w600)),
                  ]),
                ),
              ),
            ]),

            if (bus.schedule != null) ...[
              const SizedBox(height: 10),
              const Divider(height: 1),
              const SizedBox(height: 10),
              Row(children: [
                _scheduleInfo(Icons.arrow_upward, 'From Hostel', bus.schedule!.fromHostelTime, const Color(0xFF1565C0)),
                const SizedBox(width: 8),
                _scheduleInfo(Icons.arrow_downward, 'From MBSE', bus.schedule!.fromMBSETime, const Color(0xFF4CAF50)),
              ]),
              if (bus.schedule!.specialNote.isNotEmpty) ...[
                const SizedBox(height: 8),
                Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: Colors.orange.shade50, borderRadius: BorderRadius.circular(8)),
                    child: Row(children: [
                      const Icon(Icons.info_outline, size: 16, color: Colors.orange),
                      const SizedBox(width: 6),
                      Expanded(child: Text(bus.schedule!.specialNote, style: const TextStyle(fontSize: 12, color: Colors.orange))),
                    ])),
              ],
            ],

            const SizedBox(height: 10),

            // Admin actions
            Column(children: [
              Row(children: [
                Expanded(child: OutlinedButton.icon(
                icon: const Icon(Icons.edit, size: 16),
                label: const Text('Edit Schedule'),
                onPressed: () => _showEditSchedule(context, bus),
                style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 8), foregroundColor: const Color(0xFF1565C0), side: const BorderSide(color: Color(0xFF1565C0))),
              )),
                const SizedBox(width: 8),
                Expanded(child: OutlinedButton.icon(
                icon: Icon(bus.status == 'maintenance' ? Icons.check_circle : Icons.build, size: 16),
                label: Text(bus.status == 'maintenance' ? 'Set Running' : 'Set Maint.'),
                onPressed: () => _toggleStatus(context, bus),
                style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 8), foregroundColor: bus.status == 'maintenance' ? const Color(0xFF4CAF50) : const Color(0xFFFF5722), side: BorderSide(color: bus.status == 'maintenance' ? const Color(0xFF4CAF50) : const Color(0xFFFF5722))),
              )),
              ]),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.manage_accounts, size: 16),
                  label: const Text('Edit Driver + Mobile'),
                  onPressed: () => _showEditDriverSheet(context, bus),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    foregroundColor: const Color(0xFF6A1B9A),
                    side: const BorderSide(color: Color(0xFF6A1B9A)),
                  ),
                ),
              ),
            ]),
          ]),
        ),
      ]),
    );
  }

  Widget _scheduleInfo(IconData icon, String label, String value, Color color) {
    return Expanded(child: Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
      child: Column(children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(height: 2),
        Text(label, style: TextStyle(fontSize: 10, color: color)),
        Text(value, style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: color)),
      ]),
    ));
  }

  void _showEditSchedule(BuildContext context, BusModel bus) {
    showModalBottomSheet(context: context, isScrollControlled: true, backgroundColor: Colors.transparent,
        builder: (_) => _EditScheduleSheet(bus: bus));
  }

  void _toggleStatus(BuildContext context, BusModel bus) {
    final newStatus = bus.status == 'maintenance' ? 'running' : 'maintenance';
    final auth = context.read<AuthService>();
    final api = context.read<ApiService>();
    context.read<BusService>().updateBusStatus(bus.busNumber, newStatus, api, auth.currentUser?.token ?? '');
  }

  void _showEditDriverSheet(BuildContext context, BusModel bus) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _EditDriverSheet(bus: bus),
    );
  }
}

class _EditDriverSheet extends StatefulWidget {
  final BusModel bus;

  const _EditDriverSheet({required this.bus});

  @override
  State<_EditDriverSheet> createState() => _EditDriverSheetState();
}

class _EditDriverSheetState extends State<_EditDriverSheet> {
  late TextEditingController _driverNameCtrl;
  late TextEditingController _driverPhoneCtrl;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _driverNameCtrl = TextEditingController(text: widget.bus.driver?.name ?? '');
    _driverPhoneCtrl = TextEditingController(text: widget.bus.driver?.phone ?? '');
  }

  @override
  void dispose() {
    _driverNameCtrl.dispose();
    _driverPhoneCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 16),
          Text('Edit Bus ${widget.bus.busNumber} Driver', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          Text(widget.bus.assignedHostel, style: TextStyle(color: Colors.grey.shade600)),
          const SizedBox(height: 16),
          TextField(
            controller: _driverNameCtrl,
            decoration: InputDecoration(
              labelText: 'Driver Name',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _driverPhoneCtrl,
            keyboardType: TextInputType.phone,
            decoration: InputDecoration(
              labelText: 'Mobile Number',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton.icon(
              icon: _saving ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.save),
              label: Text(_saving ? 'Saving...' : 'Save Driver'),
              onPressed: _saving ? null : () => _saveDriver(context),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _saveDriver(BuildContext context) async {
    final name = _driverNameCtrl.text.trim();
    final phone = _driverPhoneCtrl.text.trim();
    if (name.isEmpty || phone.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please enter driver name and mobile number')));
      return;
    }

    final auth = context.read<AuthService>();
    final api = context.read<ApiService>();
    final token = auth.currentUser?.token ?? '';

    setState(() => _saving = true);
    try {
      await api.updateBusDriver(
        busNumber: widget.bus.busNumber,
        driverName: name,
        driverPhone: phone,
        token: token,
      );
      if (!context.mounted) return;
      await context.read<BusService>().loadBuses(api, token: token);
      if (!context.mounted) return;
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Driver updated successfully'), backgroundColor: Color(0xFF4CAF50)));
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed: $e')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class _AddBusSheet extends StatefulWidget {
  const _AddBusSheet();

  @override
  State<_AddBusSheet> createState() => _AddBusSheetState();
}

class _AddBusSheetState extends State<_AddBusSheet> {
  final _busNumberCtrl = TextEditingController();
  final _driverNameCtrl = TextEditingController();
  final _driverPhoneCtrl = TextEditingController();
  String _hostelId = 'BH1';
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final auth = context.read<AuthService>();
    if (auth.currentUser?.hostelId != null && auth.currentUser!.hostelId!.isNotEmpty) {
      _hostelId = auth.currentUser!.hostelId!;
    }
  }

  @override
  void dispose() {
    _busNumberCtrl.dispose();
    _driverNameCtrl.dispose();
    _driverPhoneCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final isCaretaker = auth.currentUser?.role == 'caretaker';

    return Container(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 16),
          const Text('Add New Bus', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          TextField(
            controller: _busNumberCtrl,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
              labelText: 'Bus Number',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _driverNameCtrl,
            decoration: InputDecoration(
              labelText: 'Driver Name',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _driverPhoneCtrl,
            keyboardType: TextInputType.phone,
            decoration: InputDecoration(
              labelText: 'Mobile Number',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _hostelId,
            decoration: InputDecoration(
              labelText: 'Assigned Hostel',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            ),
            items: HostelModel.allHostels
                .map((h) => DropdownMenuItem<String>(value: h.id, child: Text(h.fullName)))
                .toList(),
            onChanged: isCaretaker
                ? null
                : (v) {
                    if (v != null) setState(() => _hostelId = v);
                  },
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton.icon(
              icon: _saving ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.add),
              label: Text(_saving ? 'Adding...' : 'Add Bus'),
              onPressed: _saving ? null : () => _addBus(context),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _addBus(BuildContext context) async {
    final busNumber = int.tryParse(_busNumberCtrl.text.trim());
    final driverName = _driverNameCtrl.text.trim();
    final driverPhone = _driverPhoneCtrl.text.trim();
    if (busNumber == null || driverName.isEmpty || driverPhone.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter valid bus number, driver name, and mobile number')));
      return;
    }

    final auth = context.read<AuthService>();
    final api = context.read<ApiService>();
    final token = auth.currentUser?.token ?? '';

    setState(() => _saving = true);
    try {
      await api.addBus(
        busNumber: busNumber,
        assignedHostel: _hostelId,
        driverName: driverName,
        driverPhone: driverPhone,
        token: token,
      );

      if (!context.mounted) return;
      await context.read<BusService>().loadBuses(api, token: token);
      if (!context.mounted) return;
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Bus added successfully'), backgroundColor: Color(0xFF4CAF50)));
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed: $e')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class _EditScheduleSheet extends StatefulWidget {
  final BusModel bus;

  const _EditScheduleSheet({required this.bus});

  @override
  State<_EditScheduleSheet> createState() => _EditScheduleSheetState();
}

class _EditScheduleSheetState extends State<_EditScheduleSheet> {
  late TextEditingController _fromHostelCtrl;
  late TextEditingController _fromMBSECtrl;
  late TextEditingController _noteCtrl;

  @override
  void initState() {
    super.initState();
    _fromHostelCtrl = TextEditingController(text: widget.bus.schedule?.fromHostelTime ?? '');
    _fromMBSECtrl = TextEditingController(text: widget.bus.schedule?.fromMBSETime ?? '');
    _noteCtrl = TextEditingController(text: widget.bus.schedule?.specialNote ?? '');
  }

  @override
  void dispose() { _fromHostelCtrl.dispose(); _fromMBSECtrl.dispose(); _noteCtrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)))),
        const SizedBox(height: 16),
        Text('Edit Bus ${widget.bus.busNumber} Schedule', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        Text('${widget.bus.assignedHostel} • ${widget.bus.driver?.name ?? ""}', style: TextStyle(color: Colors.grey.shade500)),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: TextField(controller: _fromHostelCtrl, decoration: InputDecoration(labelText: 'From Hostel Time', hintText: 'e.g. 8:15 AM', border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)), prefixIcon: const Icon(Icons.arrow_upward, color: Color(0xFF1565C0))))),
          const SizedBox(width: 10),
          Expanded(child: TextField(controller: _fromMBSECtrl, decoration: InputDecoration(labelText: 'From MBSE Time', hintText: 'e.g. 5:30 PM', border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)), prefixIcon: const Icon(Icons.arrow_downward, color: Color(0xFF4CAF50))))),
        ]),
        const SizedBox(height: 12),
        TextField(controller: _noteCtrl, decoration: InputDecoration(labelText: 'Special Note (optional)', border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)), hintText: 'e.g. Special route, IoN Digital Centre...')),
        const SizedBox(height: 16),
        SizedBox(width: double.infinity, height: 48,
          child: ElevatedButton.icon(
            icon: const Icon(Icons.save),
            label: const Text('Save Schedule'),
            onPressed: () async {
              final auth = context.read<AuthService>();
              final api = context.read<ApiService>();
              final today = DateTime.now().toIso8601String().split('T')[0];
              final schedule = ScheduleModel(
                id: widget.bus.schedule?.id ?? '',
                busNumber: widget.bus.busNumber,
                date: today,
                fromHostelTime: _fromHostelCtrl.text,
                fromMBSETime: _fromMBSECtrl.text,
                specialNote: _noteCtrl.text,
                updatedBy: auth.currentUser?.email ?? '',
              );
              await context.read<BusService>().updateSchedule(schedule, api, auth.currentUser?.token ?? '');
              if (context.mounted) {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Schedule updated!'), backgroundColor: Color(0xFF4CAF50)));
              }
            },
          ),
        ),
      ]),
    );
  }
}
