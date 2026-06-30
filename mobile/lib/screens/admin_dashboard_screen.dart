import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/app_user.dart';
import '../services/api_client.dart';
import '../ui/rtc_mobile_ui.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({
    super.key,
    required this.api,
    required this.user,
    required this.onBack,
  });

  final ApiClient api;
  final AppUser user;
  final VoidCallback onBack;

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  static const _tabs = [
    'Command',
    'Companies',
    'Packages',
    'Integration',
    'Rooms',
    'Usage',
    'Health',
  ];

  late Future<Map<String, dynamic>> _overview;
  final _appAccessNameController = TextEditingController(
    text: 'Flutter Client App',
  );
  final _sdkCompanyNameController = TextEditingController();
  final _originsController = TextEditingController(text: 'client-preview');
  final _verifySdkTokenController = TextEditingController();
  final _roomNameController = TextEditingController(
    text: 'Mobile preview room',
  );
  final _roomPasswordController = TextEditingController();
  final _roomSeatsController = TextEditingController(text: '8');

  String _activeTab = 'Command';
  String _integrationPlatform = 'web_mobile';
  String _roomType = 'video';
  String _privacyType = 'public';
  String _credentialRotationScope = 'all';
  bool _busy = false;
  bool _lastActionFailed = false;
  String _statusMessage = '';
  Map<String, dynamic>? _lastCredentials;
  Map<String, dynamic>? _lastCredentialEnvelope;
  Map<String, dynamic>? _lastVerification;
  Map<String, dynamic>? _selectedCompanyDetail;
  int? _selectedTenantId;

  @override
  void initState() {
    super.initState();
    _overview = widget.api.adminOverview();
    _verifySdkTokenController.addListener(_handleVerifyTokenChanged);
  }

  void _handleVerifyTokenChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _verifySdkTokenController.removeListener(_handleVerifyTokenChanged);
    _appAccessNameController.dispose();
    _sdkCompanyNameController.dispose();
    _originsController.dispose();
    _verifySdkTokenController.dispose();
    _roomNameController.dispose();
    _roomPasswordController.dispose();
    _roomSeatsController.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    final future = widget.api.adminOverview();
    setState(() {
      _overview = future;
    });
    await future;
  }

  Future<void> _perform(
    String successLabel,
    Future<Map<String, dynamic>> Function() action, {
    void Function(Map<String, dynamic> result)? onSuccess,
    bool refresh = true,
  }) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _lastActionFailed = false;
      _statusMessage = 'Working...';
    });

    try {
      final result = await action();
      onSuccess?.call(result);
      final message = result['message']?.toString();

      if (refresh) {
        final future = widget.api.adminOverview();
        if (mounted) {
          setState(() {
            _overview = future;
            _statusMessage = message?.trim().isNotEmpty == true
                ? message!
                : successLabel;
          });
        }
        await future;
      } else if (mounted) {
        setState(() {
          _statusMessage = message?.trim().isNotEmpty == true
              ? message!
              : successLabel;
        });
      }
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _lastActionFailed = true;
        _statusMessage = apiErrorMessage(error);
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _rememberCredentials(Map<String, dynamic> result) {
    final credentials = _map(result['credentials']);
    final sdkToken = credentials['sdk_token']?.toString().trim() ?? '';
    _lastCredentials = credentials;
    _lastCredentialEnvelope = result;
    if (sdkToken.isNotEmpty) {
      _verifySdkTokenController.text = sdkToken;
      _lastVerification = null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: RtcBackdrop(
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: _refresh,
            child: FutureBuilder<Map<String, dynamic>>(
              future: _overview,
              builder: (context, snapshot) {
                final data = snapshot.data ?? const <String, dynamic>{};
                final scope = data['scope']?.toString() ?? 'client_admin';
                final isSuperAdmin = scope == 'super_admin';
                final enterprise = _map(data['enterprise']);
                final dashboard = _map(data['dashboard']);
                final visibleTabs = isSuperAdmin
                    ? _tabs
                    : _tabs.where((tab) => tab != 'Companies').toList();
                if (!visibleTabs.contains(_activeTab)) {
                  _activeTab = visibleTabs.first;
                }

                return ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    BrandHeader(
                      title: isSuperAdmin
                          ? 'Client Company Dashboard'
                          : 'Company Service Console',
                      subtitle: 'Mobile UI management preview',
                      trailing: RtcIconButton(
                        icon: Icons.arrow_back,
                        tooltip: 'Rooms',
                        onPressed: widget.onBack,
                      ),
                    ),
                    const SizedBox(height: 14),
                    if (snapshot.connectionState != ConnectionState.done)
                      const RtcLoadingPanel(label: 'Loading service console...')
                    else if (snapshot.hasError)
                      RtcMessagePanel(
                        icon: Icons.admin_panel_settings_outlined,
                        title: 'Could not load service console',
                        detail: apiErrorMessage(snapshot.error!),
                        actionLabel: 'Retry',
                        onAction: _refresh,
                      )
                    else ...[
                      _AdminHero(
                        scope: scope,
                        companyName:
                            _map(data['company'])['name']?.toString() ??
                            _map(data['admin'])['tenant_name']?.toString() ??
                            'TalkEachOther',
                        user: widget.user,
                      ),
                      const SizedBox(height: 12),
                      RtcFilterBar(
                        options: visibleTabs,
                        active: _activeTab,
                        onChanged: (tab) => setState(() => _activeTab = tab),
                      ),
                      if (_statusMessage.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        StatusPill(
                          label: _lastActionFailed ? 'Attention' : 'Console',
                          detail: _statusMessage,
                          state: _lastActionFailed
                              ? RtcStatusState.error
                              : _busy
                              ? RtcStatusState.warning
                              : RtcStatusState.good,
                        ),
                      ],
                      const SizedBox(height: 14),
                      _buildTab(
                        data: data,
                        enterprise: enterprise,
                        dashboard: dashboard,
                        isSuperAdmin: isSuperAdmin,
                      ),
                    ],
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTab({
    required Map<String, dynamic> data,
    required Map<String, dynamic> enterprise,
    required Map<String, dynamic> dashboard,
    required bool isSuperAdmin,
  }) {
    return switch (_activeTab) {
      'Companies' => _buildCompanies(enterprise),
      'Packages' => _buildPackages(enterprise, isSuperAdmin),
      'Integration' => _buildIntegration(enterprise, data, isSuperAdmin),
      'Rooms' => _buildRooms(data, enterprise, isSuperAdmin),
      'Usage' => _buildUsage(data, dashboard),
      'Health' => _buildHealth(enterprise, dashboard),
      _ => _buildCommand(data, enterprise, dashboard),
    };
  }

  Widget _buildCommand(
    Map<String, dynamic> data,
    Map<String, dynamic> enterprise,
    Map<String, dynamic> dashboard,
  ) {
    final metrics = _map(dashboard['metrics']);
    final rooms = _map(metrics['rooms']);
    final sessions = _map(metrics['sessions']);
    final usage = _map(metrics['usage']);
    final monthUsage = _map(usage['month']);
    final billing = _map(enterprise['billing']);
    final totals = _map(enterprise['platform_totals']);
    final apps = _list(enterprise['apps']);
    final clients = _list(enterprise['clients']);
    final planRequests = _list(enterprise['plan_requests']);
    final serviceFlow = _list(enterprise['service_flow']);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            MetricChip(
              label: 'Rooms',
              value: _metric(rooms, 'active', 'total'),
            ),
            MetricChip(
              label: 'Sessions',
              value: _number(
                sessions['active'] ?? dashboard['active_sessions'],
              ),
            ),
            MetricChip(
              label: 'Minutes',
              value: _number(
                monthUsage['minutes'] ?? dashboard['minutes_used_this_month'],
              ),
            ),
            MetricChip(
              label: 'Apps',
              value: _number(totals['active_apps'] ?? apps.length),
            ),
          ],
        ),
        const SizedBox(height: 14),
        GlassPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RtcSectionHeader(
                eyebrow: 'Service',
                title: 'UI Control Center',
                detail:
                    _map(enterprise['service_model'])['purpose']?.toString() ??
                    'Rooms, usage, app access, feature controls, and billing.',
              ),
              const SizedBox(height: 12),
              _InfoRow(
                label: 'Current package',
                value:
                    _map(enterprise['current_plan'])['name']?.toString() ??
                    'No package',
              ),
              _InfoRow(
                label: 'Estimated invoice',
                value: _currency(
                  billing['estimated_invoice'] ?? totals['estimated_invoice'],
                ),
              ),
              _InfoRow(
                label: 'Clients',
                value: _number(totals['active_clients'] ?? clients.length),
              ),
              _InfoRow(
                label: 'Pending requests',
                value: _number(
                  planRequests.where((request) {
                    return _map(request)['status'] == 'pending';
                  }).length,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        GlassPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const RtcSectionHeader(
                eyebrow: 'Flow',
                title: 'Company app service flow',
                detail:
                    'The native company-service console follows the same enterprise workflow as the web dashboard.',
              ),
              const SizedBox(height: 12),
              if (serviceFlow.isEmpty)
                const _MutedText(
                  'Preview app access, users, rooms, demo tokens, and usage cards.',
                )
              else
                ...serviceFlow.take(6).map((step) {
                  final row = _map(step);
                  return _InfoRow(
                    label: row['title']?.toString() ?? 'Service step',
                    value: row['status']?.toString() ?? 'ready',
                  );
                }),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildCompanies(Map<String, dynamic> enterprise) {
    final clients = _list(enterprise['clients']);
    final admins = _list(enterprise['admins']);
    final selectedDetail = _selectedCompanyDetail;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GlassPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RtcSectionHeader(
                eyebrow: 'Companies',
                title: '${clients.length} client companies',
                detail:
                    'Review tenant status, select companies for app access, and open company detail payloads.',
              ),
              const SizedBox(height: 12),
              if (clients.isEmpty)
                const _MutedText('No client companies are available yet.')
              else
                ...clients.map((company) {
                  final row = _map(company);
                  final id = _asInt(row['id'] ?? row['tenant_id']);
                  final status = row['status']?.toString() ?? 'active';
                  final selected = _selectedTenantId == id;
                  return _AdminRow(
                    title: row['name']?.toString() ?? 'Client company',
                    subtitle:
                        '${row['tenant_uid'] ?? 'tenant-$id'} · ${_map(row['plan'])['name'] ?? 'No package'}',
                    meta: selected ? 'Selected' : status,
                    children: [
                      _ActionButton(
                        icon: Icons.key_outlined,
                        label: selected ? 'Selected' : 'Use',
                        onPressed: id == 0
                            ? null
                            : () => setState(() => _selectedTenantId = id),
                      ),
                      _ActionButton(
                        icon: Icons.manage_search_outlined,
                        label: 'Details',
                        onPressed: id == 0
                            ? null
                            : () => _perform(
                                'Company detail loaded.',
                                () => widget.api.adminCompanyDetail(id),
                                refresh: false,
                                onSuccess: (result) {
                                  _selectedCompanyDetail = result;
                                },
                              ),
                      ),
                      _ActionButton(
                        icon: status == 'active'
                            ? Icons.pause_circle_outline
                            : Icons.play_circle_outline,
                        label: status == 'active' ? 'Suspend' : 'Activate',
                        onPressed: id == 0
                            ? null
                            : () => _perform(
                                'Company status updated.',
                                () => widget.api.adminUpdateCompanyStatus(
                                  id,
                                  status == 'active' ? 'suspended' : 'active',
                                ),
                              ),
                      ),
                    ],
                  );
                }),
            ],
          ),
        ),
        if (selectedDetail != null) ...[
          const SizedBox(height: 14),
          GlassPanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const RtcSectionHeader(
                  eyebrow: 'Detail',
                  title: 'Selected company payload',
                  detail:
                      'Native service console can fetch the same detailed company data used by web.',
                ),
                const SizedBox(height: 12),
                _InfoRow(
                  label: 'Company',
                  value:
                      _map(selectedDetail['company'])['name']?.toString() ??
                      selectedDetail['name']?.toString() ??
                      'Loaded',
                ),
                _InfoRow(
                  label: 'Rooms',
                  value: _number(_list(selectedDetail['rooms']).length),
                ),
                _InfoRow(
                  label: 'Apps',
                  value: _number(_list(selectedDetail['apps']).length),
                ),
              ],
            ),
          ),
        ],
        if (admins.isNotEmpty) ...[
          const SizedBox(height: 14),
          GlassPanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                RtcSectionHeader(
                  eyebrow: 'Admins',
                  title: '${admins.length} company service admins',
                  detail:
                      'Mirrors the web company-admin list for managed tenants.',
                ),
                const SizedBox(height: 12),
                ...admins.take(8).map((admin) {
                  final row = _map(admin);
                  return _AdminRow(
                    title: row['name']?.toString() ?? 'Company service admin',
                    subtitle:
                        '${row['email'] ?? 'company service account'} · ${row['tenant_name'] ?? 'Company'}',
                    meta: _number(row['active_rooms'] ?? row['total_rooms']),
                  );
                }),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildPackages(Map<String, dynamic> enterprise, bool isSuperAdmin) {
    final plans = _list(enterprise['plans']);
    final requests = _list(enterprise['plan_requests']);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GlassPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RtcSectionHeader(
                eyebrow: 'Packages',
                title: '${plans.length} service plans',
                detail: isSuperAdmin
                    ? 'Approve company package requests and audit plan capacity.'
                    : 'Request the package your company needs for preview growth.',
              ),
              const SizedBox(height: 12),
              if (plans.isEmpty)
                const _MutedText('No service plans were returned.')
              else
                ...plans.map((plan) {
                  final row = _map(plan);
                  final id = _asInt(row['id']);
                  return _AdminRow(
                    title: row['name']?.toString() ?? 'Service package',
                    subtitle:
                        '${_currency(row['monthly_base_price'])}/mo · ${_number(row['monthly_minute_allowance'])} included minutes',
                    meta: row['status']?.toString() ?? 'active',
                    children: [
                      if (!isSuperAdmin)
                        _ActionButton(
                          icon: Icons.shopping_bag_outlined,
                          label: 'Request',
                          onPressed: id == 0
                              ? null
                              : () => _perform(
                                  'Package request sent.',
                                  () => widget.api.adminRequestPlan(
                                    planId: id,
                                    note:
                                        'Requested from Flutter service console.',
                                  ),
                                ),
                        ),
                    ],
                  );
                }),
            ],
          ),
        ),
        const SizedBox(height: 14),
        GlassPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RtcSectionHeader(
                eyebrow: 'Requests',
                title: '${requests.length} package requests',
                detail:
                    'Native review and purchase flow follows the web admin package panel.',
              ),
              const SizedBox(height: 12),
              if (requests.isEmpty)
                const _MutedText('No package requests yet.')
              else
                ...requests.map((request) {
                  final row = _map(request);
                  final id = _asInt(row['id']);
                  final status = row['status']?.toString() ?? 'pending';
                  return _AdminRow(
                    title:
                        _map(row['requested_plan'])['name']?.toString() ??
                        'Requested package',
                    subtitle:
                        '${_map(row['current_plan'])['name'] ?? 'No current package'} · ${row['billing_type'] ?? 'monthly'}',
                    meta: status,
                    children: [
                      if (isSuperAdmin && status == 'pending') ...[
                        _ActionButton(
                          icon: Icons.check_circle_outline,
                          label: 'Approve',
                          onPressed: id == 0
                              ? null
                              : () => _perform(
                                  'Package request approved.',
                                  () => widget.api.adminReviewPlanRequest(
                                    id,
                                    status: 'approved',
                                  ),
                                ),
                        ),
                        _ActionButton(
                          icon: Icons.cancel_outlined,
                          label: 'Reject',
                          onPressed: id == 0
                              ? null
                              : () => _perform(
                                  'Package request rejected.',
                                  () => widget.api.adminReviewPlanRequest(
                                    id,
                                    status: 'rejected',
                                  ),
                                ),
                        ),
                      ],
                    ],
                  );
                }),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildIntegration(
    Map<String, dynamic> enterprise,
    Map<String, dynamic> data,
    bool isSuperAdmin,
  ) {
    final apps = _list(enterprise['apps']);
    final clients = _list(enterprise['clients']);
    final accessStatus = _map(enterprise['sdk_status']);
    final tenantId = _tenantIdForAction(enterprise, data);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GlassPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RtcSectionHeader(
                eyebrow: 'Integration',
                title: 'Generate app demo token',
                detail:
                    accessStatus['auth_flow']?.toString() ??
                    'Create local demo credentials for the client app UI handoff.',
              ),
              const SizedBox(height: 12),
              if (isSuperAdmin && clients.isNotEmpty) ...[
                _CompanySelector(
                  clients: clients,
                  value: tenantId,
                  onChanged: (id) => setState(() => _selectedTenantId = id),
                ),
                const SizedBox(height: 12),
              ],
              if (isSuperAdmin) ...[
                _AdminInput(
                  controller: _sdkCompanyNameController,
                  label: 'Company name',
                  icon: Icons.business_outlined,
                ),
                const SizedBox(height: 10),
              ],
              _AdminInput(
                controller: _appAccessNameController,
                label: 'Client app name',
                icon: Icons.apps_outlined,
              ),
              const SizedBox(height: 10),
              _PlatformSelector(
                value: _integrationPlatform,
                onChanged: (value) =>
                    setState(() => _integrationPlatform = value),
              ),
              const SizedBox(height: 10),
              _AdminInput(
                controller: _originsController,
                label: 'Allowed origins',
                icon: Icons.public_outlined,
              ),
              const SizedBox(height: 12),
              GradientButton(
                onPressed: _busy
                    ? null
                    : () => _perform(
                        'Demo token generated.',
                        () => widget.api.adminCreateSdkToken(
                          appName: _appAccessNameController.text,
                          companyName: isSuperAdmin
                              ? _sdkCompanyNameController.text
                              : '',
                          platform: _integrationPlatform,
                          tenantId:
                              isSuperAdmin &&
                                  _sdkCompanyNameController.text.trim().isEmpty
                              ? tenantId
                              : null,
                          allowedOrigins: _originsController.text,
                        ),
                        onSuccess: (result) {
                          _rememberCredentials(result);
                        },
                      ),
                icon: const Icon(Icons.vpn_key_outlined, color: Colors.white),
                child: const Text('Generate demo token'),
              ),
              if (_lastCredentials != null) ...[
                const SizedBox(height: 12),
                _SecretBox(
                  credentials: _lastCredentials!,
                  app: _map(_lastCredentialEnvelope?['app']),
                  integration: _map(_lastCredentialEnvelope?['integration']),
                  platform: _map(
                    _lastCredentialEnvelope?['app'],
                  )['platform']?.toString(),
                ),
              ],
              const SizedBox(height: 14),
              const RtcSectionHeader(
                eyebrow: 'Verify',
                title: 'Check demo token readiness',
                detail:
                    'Paste a demo token to preview the app, company, package, and feature access states.',
              ),
              const SizedBox(height: 12),
              _AdminInput(
                controller: _verifySdkTokenController,
                label: 'Demo token',
                icon: Icons.verified_user_outlined,
              ),
              const SizedBox(height: 12),
              GradientButton(
                onPressed:
                    _busy || _verifySdkTokenController.text.trim().isEmpty
                    ? null
                    : () => _perform(
                        'Demo token verified.',
                        () => widget.api.adminVerifySdkToken(
                          _verifySdkTokenController.text,
                        ),
                        refresh: false,
                        onSuccess: (result) {
                          _lastVerification = result;
                        },
                      ),
                icon: const Icon(
                  Icons.fact_check_outlined,
                  color: Colors.white,
                ),
                child: const Text('Verify demo token'),
              ),
              if (_lastVerification != null) ...[
                const SizedBox(height: 12),
                _VerificationBox(result: _lastVerification!),
              ],
            ],
          ),
        ),
        const SizedBox(height: 14),
        GlassPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RtcSectionHeader(
                eyebrow: 'Apps',
                title: '${apps.length} client apps',
                detail:
                    'Rotate app keys, suspend access, and review generated integration capacity.',
              ),
              const SizedBox(height: 12),
              RtcFilterBar(
                options: const ['all', 'api_key', 'sdk_token'],
                active: _credentialRotationScope,
                onChanged: (value) =>
                    setState(() => _credentialRotationScope = value),
              ),
              const SizedBox(height: 12),
              if (apps.isEmpty)
                const _MutedText('No apps have been generated yet.')
              else
                ...apps.map((app) {
                  final row = _map(app);
                  final id = _asInt(row['id']);
                  final status = row['status']?.toString() ?? 'active';
                  final sdkMasked = row['sdk_token_masked']?.toString() ?? '';
                  final platform = _platformLabel(row['platform']);
                  final origins = _list(row['allowed_origins'])
                      .map((origin) => origin.toString())
                      .where((origin) => origin.trim().isNotEmpty)
                      .join(', ');
                  return _AdminRow(
                    title: row['name']?.toString() ?? 'Client app',
                    subtitle:
                        '${row['app_key'] ?? 'app key'} · $platform · ${row['tenant_name'] ?? 'Company'}${sdkMasked.isEmpty ? '' : ' · SDK $sdkMasked'}${origins.isEmpty ? '' : ' · $origins'}',
                    meta: status,
                    children: [
                      _ActionButton(
                        icon: Icons.autorenew_outlined,
                        label: 'Rotate',
                        onPressed: id == 0
                            ? null
                            : () => _perform(
                                'Credentials rotated.',
                                () => widget.api.adminRotateClientAppCredentials(
                                  id,
                                  reason:
                                      'Rotated from Flutter service console.',
                                  scope: _credentialRotationScope,
                                ),
                                onSuccess: (result) {
                                  _rememberCredentials(result);
                                },
                              ),
                      ),
                      _ActionButton(
                        icon: status == 'active'
                            ? Icons.block_outlined
                            : Icons.play_arrow_outlined,
                        label: status == 'active' ? 'Suspend' : 'Activate',
                        onPressed: id == 0
                            ? null
                            : () => _perform(
                                'App access updated.',
                                () => widget.api.adminUpdateClientApp(
                                  id,
                                  status: status == 'active'
                                      ? 'suspended'
                                      : 'active',
                                ),
                              ),
                      ),
                    ],
                  );
                }),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildRooms(
    Map<String, dynamic> data,
    Map<String, dynamic> enterprise,
    bool isSuperAdmin,
  ) {
    final rooms = _list(data['rooms']);
    final tenantId = _tenantIdForAction(enterprise, data);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GlassPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const RtcSectionHeader(
                eyebrow: 'Rooms',
                title: 'Create managed preview room',
                detail:
                    'This uses the native service endpoint from the web room management panel.',
              ),
              const SizedBox(height: 12),
              _AdminInput(
                controller: _roomNameController,
                label: 'Room name',
                icon: Icons.meeting_room_outlined,
              ),
              const SizedBox(height: 10),
              RtcFilterBar(
                options: const ['video', 'audio', 'one_to_one_video'],
                active: _roomType,
                onChanged: (value) => setState(() => _roomType = value),
              ),
              const SizedBox(height: 10),
              RtcFilterBar(
                options: const ['public', 'private', 'password'],
                active: _privacyType,
                onChanged: (value) => setState(() => _privacyType = value),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _AdminInput(
                      controller: _roomSeatsController,
                      label: 'Seats',
                      icon: Icons.event_seat_outlined,
                      keyboardType: TextInputType.number,
                    ),
                  ),
                  if (_privacyType == 'password') ...[
                    const SizedBox(width: 10),
                    Expanded(
                      child: _AdminInput(
                        controller: _roomPasswordController,
                        label: 'Password',
                        icon: Icons.lock_outline,
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 12),
              GradientButton(
                onPressed: _busy
                    ? null
                    : () => _perform(
                        'Room created.',
                        () => widget.api.adminCreateRoom(
                          tenantId: isSuperAdmin ? tenantId : null,
                          name: _roomNameController.text,
                          roomType: _roomType,
                          privacyType: _privacyType,
                          password: _roomPasswordController.text,
                          maxMicCount:
                              int.tryParse(_roomSeatsController.text) ?? 8,
                          screenShareEnabled: _roomType.contains('video'),
                        ),
                      ),
                icon: const Icon(Icons.add_home_outlined, color: Colors.white),
                child: const Text('Create preview room'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        GlassPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RtcSectionHeader(
                eyebrow: 'Inventory',
                title: '${rooms.length} managed rooms',
                detail:
                    'Activate, disable, or remove room availability without leaving Flutter.',
              ),
              const SizedBox(height: 12),
              if (rooms.isEmpty)
                const _MutedText('No managed rooms were returned.')
              else
                ...rooms.map((room) {
                  final row = _map(room);
                  final id = _asInt(row['id']);
                  final status = row['status']?.toString() ?? 'active';
                  return _AdminRow(
                    title: row['name']?.toString() ?? 'Room',
                    subtitle:
                        '${row['room_type'] ?? 'video'} · ${_number(row['active_participants'])} people · ${_number(row['billable_minutes'])} min',
                    meta: status,
                    children: [
                      _ActionButton(
                        icon: status == 'active'
                            ? Icons.pause_circle_outline
                            : Icons.play_circle_outline,
                        label: status == 'active' ? 'Disable' : 'Activate',
                        onPressed: id == 0
                            ? null
                            : () => _perform(
                                'Room availability updated.',
                                () => widget.api.adminUpdateRoomStatus(
                                  id,
                                  status == 'active' ? 'disabled' : 'active',
                                ),
                              ),
                      ),
                      _ActionButton(
                        icon: Icons.delete_outline,
                        label: 'Remove',
                        onPressed: id == 0
                            ? null
                            : () => _perform(
                                'Room removed.',
                                () => widget.api.adminDeleteRoom(id),
                              ),
                      ),
                    ],
                  );
                }),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildUsage(
    Map<String, dynamic> data,
    Map<String, dynamic> dashboard,
  ) {
    final dailyUsage = _list(data['daily_usage']);
    final records = _list(data['participant_records']);
    final recentLogs = _list(dashboard['recent_usage_logs']);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GlassPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const RtcSectionHeader(
                eyebrow: 'Usage',
                title: 'Participant-minute billing',
                detail:
                    'The Flutter service console reads the same daily usage and recent log data as web.',
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  MetricChip(
                    label: 'Today',
                    value: _number(dashboard['minutes_used_today']),
                  ),
                  MetricChip(
                    label: 'Month',
                    value: _number(dashboard['minutes_used_this_month']),
                  ),
                  MetricChip(label: 'Records', value: _number(records.length)),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        GlassPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RtcSectionHeader(
                eyebrow: 'Daily',
                title: '${dailyUsage.length} daily usage rows',
                detail: 'Trend data for package usage and billing review.',
              ),
              const SizedBox(height: 12),
              if (dailyUsage.isEmpty)
                const _MutedText('Daily usage is empty.')
              else
                ...dailyUsage.take(10).map((row) {
                  final usage = _map(row);
                  return _InfoRow(
                    label:
                        usage['usage_date']?.toString() ??
                        usage['date']?.toString() ??
                        'Usage date',
                    value:
                        '${_number(usage['billable_minutes'] ?? usage['minutes'])} min',
                  );
                }),
            ],
          ),
        ),
        const SizedBox(height: 14),
        GlassPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RtcSectionHeader(
                eyebrow: 'Logs',
                title: '${recentLogs.length} recent usage logs',
                detail: 'Session usage records that back billing verification.',
              ),
              const SizedBox(height: 12),
              if (recentLogs.isEmpty)
                const _MutedText('No recent usage logs returned.')
              else
                ...recentLogs.take(10).map((log) {
                  final row = _map(log);
                  return _AdminRow(
                    title: row['room_name']?.toString() ?? 'Preview session',
                    subtitle:
                        '${row['user_name'] ?? 'Participant'} · ${row['usage_type'] ?? 'media'}',
                    meta: '${_number(row['billable_minutes'])} min',
                  );
                }),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildHealth(
    Map<String, dynamic> enterprise,
    Map<String, dynamic> dashboard,
  ) {
    final verification = _map(
      _map(dashboard['metrics'])['verification'] ??
          dashboard['usage_verification'],
    );
    final activeMonitor = _map(dashboard['active_sessions_monitor']);
    final sessions = _list(activeMonitor['sessions']);
    final features = _list(enterprise['feature_controls']);
    final service = _map(enterprise['service_model']);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GlassPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const RtcSectionHeader(
                eyebrow: 'Health',
                title: 'Preview service verification',
                detail:
                    'Native status mirrors the web dashboard health, feature, and active-session panels.',
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  StatusPill(
                    label: service['rtc_provider']?.toString() ?? 'online',
                    detail: 'Preview provider',
                    state: service['connection_indicator'] == 'attention'
                        ? RtcStatusState.warning
                        : RtcStatusState.good,
                  ),
                  StatusPill(
                    label: verification['status']?.toString() ?? 'verified',
                    detail: '${_number(verification['issue_count'])} issues',
                    state: _asInt(verification['issue_count']) > 0
                        ? RtcStatusState.warning
                        : RtcStatusState.good,
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        GlassPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RtcSectionHeader(
                eyebrow: 'Sessions',
                title: '${sessions.length} active session rows',
                detail: 'Live capacity, participants, reconnects, and quality.',
              ),
              const SizedBox(height: 12),
              if (sessions.isEmpty)
                const _MutedText('No active sessions right now.')
              else
                ...sessions.take(8).map((session) {
                  final row = _map(session);
                  return _AdminRow(
                    title: row['room_name']?.toString() ?? 'Active session',
                    subtitle:
                        '${_number(row['active_participants'])} participants · ${_number(row['reconnecting'])} reconnecting',
                    meta: row['health']?.toString() ?? 'live',
                  );
                }),
            ],
          ),
        ),
        const SizedBox(height: 14),
        GlassPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RtcSectionHeader(
                eyebrow: 'Features',
                title: '${features.length} feature controls',
                detail:
                    'Package-driven feature flags exposed in the native service console.',
              ),
              const SizedBox(height: 12),
              if (features.isEmpty)
                const _MutedText('No feature controls returned.')
              else
                ...features.take(12).map((feature) {
                  final row = _map(feature);
                  return _InfoRow(
                    label:
                        row['label']?.toString() ??
                        row['key']?.toString() ??
                        'Feature',
                    value: row['enabled'] == true ? 'enabled' : 'off',
                  );
                }),
            ],
          ),
        ),
      ],
    );
  }

  int? _tenantIdForAction(
    Map<String, dynamic> enterprise,
    Map<String, dynamic> data,
  ) {
    if (_selectedTenantId != null && _selectedTenantId! > 0) {
      return _selectedTenantId;
    }
    final clients = _list(enterprise['clients']);
    for (final client in clients) {
      final id = _asInt(_map(client)['id'] ?? _map(client)['tenant_id']);
      if (id > 0) return id;
    }
    final adminTenant = _asInt(_map(data['admin'])['tenant_id']);
    if (adminTenant > 0) return adminTenant;
    return widget.user.tenantId > 0 ? widget.user.tenantId : null;
  }
}

class _AdminHero extends StatelessWidget {
  const _AdminHero({
    required this.scope,
    required this.companyName,
    required this.user,
  });

  final String scope;
  final String companyName;
  final AppUser user;

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      child: Row(
        children: [
          InitialAvatar(user: user, size: 52),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  companyName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  scope == 'super_admin'
                      ? 'Platform service admin scope'
                      : 'Company service admin scope',
                  style: const TextStyle(
                    color: RtcPalette.muted,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CompanySelector extends StatelessWidget {
  const _CompanySelector({
    required this.clients,
    required this.value,
    required this.onChanged,
  });

  final List<Object?> clients;
  final int? value;
  final ValueChanged<int?> onChanged;

  @override
  Widget build(BuildContext context) {
    final items = clients
        .map((client) {
          final row = _map(client);
          final id = _asInt(row['id'] ?? row['tenant_id']);
          if (id == 0) return null;
          return DropdownMenuItem<int>(
            value: id,
            child: Text(
              row['name']?.toString() ?? 'Company #$id',
              overflow: TextOverflow.ellipsis,
            ),
          );
        })
        .whereType<DropdownMenuItem<int>>()
        .toList();
    final selectedValue = items.any((item) => item.value == value)
        ? value
        : null;

    return DropdownButtonFormField<int>(
      initialValue: selectedValue,
      items: items,
      onChanged: onChanged,
      dropdownColor: RtcPalette.surface2,
      decoration: _inputDecoration(
        label: 'Client company',
        icon: Icons.business_outlined,
      ),
      style: const TextStyle(
        color: RtcPalette.text,
        fontWeight: FontWeight.w800,
      ),
    );
  }
}

class _PlatformSelector extends StatelessWidget {
  const _PlatformSelector({required this.value, required this.onChanged});

  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final selectedValue = _integrationPlatformValues.contains(value)
        ? value
        : 'web_mobile';

    return DropdownButtonFormField<String>(
      initialValue: selectedValue,
      items: _integrationPlatformValues
          .map(
            (platform) => DropdownMenuItem<String>(
              value: platform,
              child: Text(
                _platformLabel(platform),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          )
          .toList(),
      onChanged: (value) {
        if (value != null) onChanged(value);
      },
      dropdownColor: RtcPalette.surface2,
      decoration: _inputDecoration(
        label: 'App platform',
        icon: Icons.integration_instructions_outlined,
      ),
      style: const TextStyle(
        color: RtcPalette.text,
        fontWeight: FontWeight.w800,
      ),
    );
  }
}

class _AdminInput extends StatelessWidget {
  const _AdminInput({
    required this.controller,
    required this.label,
    required this.icon,
    this.keyboardType,
  });

  final TextEditingController controller;
  final String label;
  final IconData icon;
  final TextInputType? keyboardType;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: keyboardType,
      style: const TextStyle(
        color: RtcPalette.text,
        fontWeight: FontWeight.w800,
      ),
      decoration: _inputDecoration(label: label, icon: icon),
    );
  }
}

InputDecoration _inputDecoration({
  required String label,
  required IconData icon,
}) {
  return InputDecoration(
    labelText: label,
    prefixIcon: Icon(icon, color: RtcPalette.muted),
    labelStyle: const TextStyle(
      color: RtcPalette.muted,
      fontWeight: FontWeight.w800,
    ),
    filled: true,
    fillColor: RtcPalette.hoverBg,
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(RtcRadius.control),
      borderSide: const BorderSide(color: RtcPalette.line),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(RtcRadius.control),
      borderSide: const BorderSide(color: RtcPalette.focusBorder),
    ),
  );
}

class _SecretBox extends StatelessWidget {
  const _SecretBox({
    required this.credentials,
    this.app = const {},
    this.integration = const {},
    this.platform,
  });

  final Map<String, dynamic> credentials;
  final Map<String, dynamic> app;
  final Map<String, dynamic> integration;
  final String? platform;

  @override
  Widget build(BuildContext context) {
    final platformValue = _cleanString(app['platform']) ?? platform ?? '';
    final sdkFile = _sdkFileForPlatform(platformValue);
    final tokenHeader =
        _cleanString(integration['sdk_token_header']) ?? 'x-rtc-sdk-token';
    final verifyEndpoint =
        _cleanString(integration['verification_endpoint']) ?? '/api/client/me';
    final smokeTest =
        _cleanString(integration['smoke_test_method']) ?? 'verifyIntegration';
    final lines = [
      'APP_KEY=${credentials['app_key'] ?? ''}',
      'API_KEY=${credentials['api_key'] ?? ''}',
      'DEMO_TOKEN=${credentials['sdk_token'] ?? ''}',
      'SDK_TOKEN_HEADER=$tokenHeader',
      'SDK_FILE=$sdkFile',
      'VERIFY_ENDPOINT=$verifyEndpoint',
    ].join('\n');

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: RtcPalette.bg.withValues(alpha: 0.72),
        border: Border.all(color: RtcPalette.line),
        borderRadius: BorderRadius.circular(RtcRadius.control),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Generated SDK handoff',
                  style: TextStyle(
                    color: RtcPalette.text,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Copy credentials',
                onPressed: () => Clipboard.setData(ClipboardData(text: lines)),
                icon: const Icon(
                  Icons.copy_outlined,
                  color: RtcPalette.soft,
                  size: 18,
                ),
              ),
            ],
          ),
          SelectableText(
            [
              lines,
              '',
              'Flutter: UI preview token only',
              'Smoke test: $smokeTest()',
            ].join('\n'),
            style: const TextStyle(
              color: RtcPalette.soft,
              fontFamily: 'monospace',
              fontSize: 12,
              fontWeight: FontWeight.w800,
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}

class _VerificationBox extends StatelessWidget {
  const _VerificationBox({required this.result});

  final Map<String, dynamic> result;

  @override
  Widget build(BuildContext context) {
    final ok = result['ok'] == true;
    final checks = _map(result['checks']);
    final app = _map(result['app']);
    final company = _map(result['company']);
    final status = result['integration_status']?.toString() ?? 'unknown';
    final message =
        result['message']?.toString() ??
        (ok ? 'Demo token is ready.' : 'Demo token is not ready.');
    final rows = [
      'Status: $status',
      if (company.isNotEmpty) 'Company: ${company['name'] ?? company['id']}',
      if (app.isNotEmpty) 'App: ${app['name'] ?? app['app_key']}',
      if (checks.isNotEmpty)
        ...checks.entries.map((entry) => '${entry.key}: ${entry.value}'),
    ];

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ok
            ? RtcPalette.mint.withValues(alpha: 0.12)
            : RtcPalette.amber.withValues(alpha: 0.12),
        border: Border.all(
          color: ok
              ? RtcPalette.mint.withValues(alpha: 0.55)
              : RtcPalette.amber.withValues(alpha: 0.55),
        ),
        borderRadius: BorderRadius.circular(RtcRadius.control),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                ok ? Icons.check_circle_outline : Icons.error_outline,
                color: ok ? RtcPalette.mint : RtcPalette.amber,
                size: 18,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  message,
                  style: const TextStyle(
                    color: RtcPalette.text,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          SelectableText(
            rows.join('\n'),
            style: const TextStyle(
              color: RtcPalette.soft,
              fontFamily: 'monospace',
              fontSize: 12,
              fontWeight: FontWeight.w800,
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}

class _AdminRow extends StatelessWidget {
  const _AdminRow({
    required this.title,
    required this.subtitle,
    required this.meta,
    this.children = const [],
  });

  final String title;
  final String subtitle;
  final String meta;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: RtcPalette.hoverBg,
        border: Border.all(color: RtcPalette.line),
        borderRadius: BorderRadius.circular(RtcRadius.control),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: RtcPalette.text,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: RtcPalette.muted,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              StatusPill(label: meta),
            ],
          ),
          if (children.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(spacing: 8, runSpacing: 8, children: children),
          ],
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, size: 16),
      label: Text(label),
      style: OutlinedButton.styleFrom(
        foregroundColor: RtcPalette.soft,
        side: const BorderSide(color: RtcPalette.hoverBorder),
        textStyle: const TextStyle(fontWeight: FontWeight.w900, fontSize: 12),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        minimumSize: const Size(0, 36),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(RtcRadius.control),
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: RtcPalette.muted,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MutedText extends StatelessWidget {
  const _MutedText(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        color: RtcPalette.muted,
        fontWeight: FontWeight.w700,
        height: 1.35,
      ),
    );
  }
}

Map<String, dynamic> _map(Object? value) {
  if (value is Map) return Map<String, dynamic>.from(value);
  return const {};
}

List<Object?> _list(Object? value) {
  if (value is List) return value;
  return const [];
}

int _asInt(Object? value) {
  if (value is int) return value;
  return int.tryParse(value?.toString() ?? '') ?? 0;
}

String _number(Object? value) {
  final number = NumberFormat.compact(value);
  return number;
}

const _integrationPlatformValues = [
  'web_mobile',
  'android',
  'ios',
  'web',
  'server',
];

String _platformLabel(Object? value) {
  final platform = _cleanString(value) ?? 'web_mobile';
  return switch (platform) {
    'android' => 'Android',
    'ios' => 'iOS',
    'web' => 'Web',
    'server' => 'Server',
    'web_mobile' => 'Flutter / web mobile',
    _ => platform.replaceAll('_', ' '),
  };
}

String _sdkFileForPlatform(String value) {
  final platform = _cleanString(value) ?? 'web_mobile';
  return switch (platform) {
    'android' => 'rtc-enterprise-sdk/docs/ANDROID_INTEGRATION.md',
    'server' => 'rtc-enterprise-sdk/docs/FLUTTER_INTEGRATION.md',
    _ => 'mobile-ui-preview/local-demo-handoff.dart',
  };
}

String? _cleanString(Object? value) {
  final text = value?.toString().trim() ?? '';
  return text.isEmpty ? null : text;
}

String _metric(Map<String, dynamic> values, String active, String total) {
  return '${_number(values[active])}/${_number(values[total])}';
}

String _currency(Object? value) {
  final number = double.tryParse(value?.toString() ?? '') ?? 0;
  return '\$${number.toStringAsFixed(0)}';
}

class NumberFormat {
  const NumberFormat._();

  static String compact(Object? value) {
    final number = num.tryParse(value?.toString() ?? '') ?? 0;
    if (number >= 1000000) return '${(number / 1000000).toStringAsFixed(1)}M';
    if (number >= 1000) return '${(number / 1000).toStringAsFixed(1)}K';
    return number.toStringAsFixed(0);
  }
}
