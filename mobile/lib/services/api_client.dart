import 'dart:convert';
import 'dart:io';

import '../models/app_user.dart';
import '../models/room.dart';

class AppSession {
  const AppSession({required this.token, required this.user});

  final String token;
  final AppUser user;
}

class RtcTokenResult {
  const RtcTokenResult({
    required this.accessToken,
    required this.appId,
    required this.appKey,
    required this.roomId,
    required this.rtcMode,
    required this.permissions,
    this.expiresAt = '',
  });

  factory RtcTokenResult.fromJson(Map<String, dynamic> json) {
    final token =
        json['access_token']?.toString() ??
        json['accessToken']?.toString() ??
        json['token']?.toString() ??
        '';

    return RtcTokenResult(
      accessToken: token,
      appId: (json['app_id'] ?? json['appId'] ?? '').toString(),
      appKey: (json['app_key'] ?? json['appKey'] ?? '').toString(),
      roomId: (json['room_id'] ?? json['roomId'] ?? '').toString(),
      rtcMode: (json['rtc_mode'] ?? json['rtcMode'] ?? '').toString(),
      permissions: json['permissions'] is Iterable
          ? (json['permissions'] as Iterable)
                .map((value) => value.toString())
                .toList(growable: false)
          : const <String>[],
      expiresAt: (json['expires_at'] ?? json['expiresAt'] ?? '').toString(),
    );
  }

  final String accessToken;
  final String appId;
  final String appKey;
  final String roomId;
  final String rtcMode;
  final List<String> permissions;
  final String expiresAt;
}

typedef AuthExpiredHandler = void Function(String message);

abstract class SessionStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class InMemorySessionStore implements SessionStore {
  const InMemorySessionStore([Object? _]);

  static final Map<String, String> _values = {};

  @override
  Future<String?> read(String key) async => _values[key];

  @override
  Future<void> write(String key, String value) async {
    _values[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    _values.remove(key);
  }
}

class ApiClient {
  ApiClient({
    Object? storage,
    SessionStore? sessionStore,
    Object? dioClient,
    this.onAuthExpired,
  }) : _sessionStore =
           sessionStore ?? InMemorySessionStore(storage ?? dioClient);

  static const _tokenKey = 'rtc_access_token';
  static const _userKey = 'rtc_user';
  static const _rtcTokenEndpoint = String.fromEnvironment(
    'RTC_TOKEN_ENDPOINT',
    defaultValue: 'https://funint.online/rtc-token',
  );

  final SessionStore _sessionStore;
  final AuthExpiredHandler? onAuthExpired;

  AppSession? _session;
  AppSession? get session => _session;

  Future<AppSession?> restoreSession() async {
    if (_session != null) return _session;

    final token = await _sessionStore.read(_tokenKey);
    final savedUser = await _sessionStore.read(_userKey);
    if (token == null || token.isEmpty || savedUser == null) return null;

    try {
      final user = AppUser.fromJson(
        jsonDecode(savedUser) as Map<String, dynamic>,
      );
      _session = AppSession(token: token, user: user);
      return _session;
    } catch (_) {
      await clearSession();
      return null;
    }
  }

  Future<AppSession> login(String email, String password) async {
    final normalizedEmail = _normalizeAuthEmail(email);
    final user = _demoUserForEmail(normalizedEmail);
    return _saveSession('ui-session-${user.id}', user);
  }

  Future<AppSession> register({
    required String name,
    required String email,
    required String password,
    String gender = '',
    int? age,
    String currentResidence = '',
    String birthday = '',
  }) async {
    final nextUser = AppUser(
      id: _nextUserId++,
      tenantId: 1,
      name: name.trim().isEmpty ? _nameFromEmail(email) : name.trim(),
      email: _normalizeAuthEmail(email),
      gender: gender,
      age: age,
      birthday: birthday,
      currentResidence: currentResidence,
      avatarUrl: '',
      roles: const ['client_admin'],
    );
    return _saveSession('ui-session-${nextUser.id}', nextUser);
  }

  Future<AppUser> refreshCurrentUser() async {
    return _session?.user ?? _demoUserForEmail('admin@gmail.com');
  }

  Future<AppUser> updateProfile({
    required String name,
    required String gender,
    required int age,
    required String birthday,
    required String currentResidence,
    Object? avatarUrl,
  }) async {
    final current = _session?.user ?? _demoUserForEmail('admin@gmail.com');
    final updated = current.copyWith(
      name: name,
      gender: gender,
      age: age,
      birthday: birthday,
      currentResidence: currentResidence,
      avatarUrl: avatarUrl is String ? avatarUrl : '',
    );
    await _saveSession(_session?.token ?? 'ui-session-${updated.id}', updated);
    return updated;
  }

  Future<void> logout() async {
    await clearSession();
  }

  Future<void> clearSession({
    bool notifyAuthExpired = false,
    String message = 'Signed out of the UI preview.',
  }) async {
    _session = null;
    await _sessionStore.delete(_tokenKey);
    await _sessionStore.delete(_userKey);
    if (notifyAuthExpired) onAuthExpired?.call(message);
  }

  Future<List<Room>> rooms({
    String feed = 'for_you',
    String type = 'all',
    String privacy = 'all',
    String sort = 'active',
    String search = '',
    int perPage = 60,
  }) async {
    final user = _session?.user;
    final query = search.trim().toLowerCase();
    final rows = _rooms.where((room) {
      if (!room.matchesTypeFilter(type)) return false;
      if (!room.matchesPrivacyFilter(privacy)) return false;
      if (query.isNotEmpty && !room.matchesSearch(query)) return false;
      if (feed == 'following') {
        return room.ownerFollowed || (user != null && room.ownerId == user.id);
      }
      return true;
    }).toList();

    rows.sort((a, b) {
      return switch (sort) {
        'name' => a.name.toLowerCase().compareTo(b.name.toLowerCase()),
        'oldest' => _dateValue(a.createdAt).compareTo(_dateValue(b.createdAt)),
        'newest' => _dateValue(b.createdAt).compareTo(_dateValue(a.createdAt)),
        _ => b.activeParticipants.compareTo(a.activeParticipants),
      };
    });

    return rows.take(perPage).toList(growable: false);
  }

  Future<RtcTokenResult> issueRtcToken({
    required String appId,
    required String appKey,
    required String roomId,
    required String userId,
    required String rtcMode,
    required List<String> permissions,
  }) async {
    final endpoint = Uri.parse(_rtcTokenEndpoint);
    final client = HttpClient()
      ..connectionTimeout = const Duration(seconds: 12);

    try {
      final request = await client.postUrl(endpoint);
      request.headers.contentType = ContentType.json;
      request.write(
        jsonEncode({
          'appId': appId,
          'appKey': appKey,
          'roomId': roomId,
          'userId': userId,
          'externalUserId': userId,
          'role': 'publisher',
          'rtcMode': rtcMode,
          'permissions': permissions,
        }),
      );

      final response = await request.close();
      final body = await response.transform(utf8.decoder).join();
      final decoded = body.trim().isEmpty
          ? <String, dynamic>{}
          : jsonDecode(body) as Map<String, dynamic>;

      if (response.statusCode < 200 || response.statusCode >= 300) {
        final message =
            decoded['error']?.toString() ??
            decoded['message']?.toString() ??
            'RTC token request failed with HTTP ${response.statusCode}.';
        throw StateError(message);
      }

      final token = RtcTokenResult.fromJson(decoded);
      if (token.accessToken.trim().isEmpty) {
        throw StateError('RTC token response did not include an access token.');
      }

      return token;
    } on FormatException catch (error) {
      throw StateError(
        'RTC token response was not valid JSON: ${error.message}',
      );
    } on SocketException catch (error) {
      throw StateError('Unable to reach RTC token backend: ${error.message}');
    } finally {
      client.close(force: true);
    }
  }

  Future<Room> createRoom({
    required String name,
    String description = '',
    String profileImage = '',
    String roomType = 'video',
    String privacyType = 'public',
    String password = '',
    int maxMicCount = 8,
    String theme = 'neon',
    bool chatEnabled = true,
    bool giftEnabled = false,
    bool screenShareEnabled = false,
    bool aiSecurityEnabled = false,
  }) async {
    final user = _session?.user ?? _demoUserForEmail('admin@gmail.com');
    final now = DateTime.now().toUtc().toIso8601String();
    final room = Room(
      id: _nextRoomId++,
      tenantId: user.tenantId,
      tenantName: 'TalkEachOther',
      ownerId: user.id,
      ownerName: user.name,
      ownerRegion: user.currentResidence,
      ownerFollowed: true,
      name: name.trim().isEmpty ? '${user.name} Live Room' : name.trim(),
      description: description.trim(),
      roomType: roomType,
      privacyType: privacyType,
      isPasswordProtected: privacyType == 'password',
      profileImage: profileImage.startsWith('assets/') ? profileImage : '',
      maxMicCount: maxMicCount,
      activeParticipants: 0,
      theme: theme,
      chatEnabled: chatEnabled,
      giftEnabled: giftEnabled,
      screenShareEnabled: screenShareEnabled,
      aiSecurityEnabled: aiSecurityEnabled,
      createdAt: now,
      updatedAt: now,
    );
    _rooms.insert(0, room);
    return room;
  }

  Future<void> deleteRoom(int roomId) async {
    _rooms.removeWhere((room) => room.id == roomId);
  }

  Future<List<Map<String, dynamic>>> directMessageContacts() async {
    return _messageContacts.map(_copyMap).toList(growable: false);
  }

  Future<List<Map<String, dynamic>>> directMessages(
    int userId, {
    int limit = 50,
  }) async {
    final user = _session?.user ?? _demoUserForEmail('admin@gmail.com');
    final rows = _directMessages.where((message) {
      final sender = _asInt(message['sender_id']);
      final receiver = _asInt(message['receiver_id']);
      return (sender == user.id && receiver == userId) ||
          (sender == userId && receiver == user.id);
    }).toList();
    rows.sort((a, b) {
      return _dateValue(
        a['created_at']?.toString() ?? '',
      ).compareTo(_dateValue(b['created_at']?.toString() ?? ''));
    });
    return rows.take(limit).map(_copyMap).toList(growable: false);
  }

  Future<Map<String, dynamic>> sendDirectMessage(
    int userId, {
    required String body,
    String messageType = 'text',
    String mediaUrl = '',
  }) async {
    final user = _session?.user ?? _demoUserForEmail('admin@gmail.com');
    final message = {
      'id': _nextMessageId++,
      'sender_id': user.id,
      'receiver_id': userId,
      'message_type': messageType,
      'message_body': body,
      'media_url': mediaUrl,
      'created_at': DateTime.now().toUtc().toIso8601String(),
    };
    _directMessages.add(message);

    final contactIndex = _messageContacts.indexWhere(
      (contact) => _asInt(contact['peer_id']) == userId,
    );
    if (contactIndex >= 0) {
      _messageContacts[contactIndex] = {
        ..._messageContacts[contactIndex],
        'last_message': message,
      };
    }

    return _copyMap(message);
  }

  Future<Map<String, dynamic>> adminOverview() async {
    return _adminOverview();
  }

  Future<Map<String, dynamic>> adminCompanyDetail(int companyId) async {
    final company = _clients.firstWhere(
      (row) => _asInt(row['id']) == companyId,
      orElse: () => _clients.first,
    );
    return {
      'company': _copyMap(company),
      'rooms': _rooms.map(_roomToAdminRow).toList(),
      'apps': _apps
          .where((app) => _asInt(app['tenant_id']) == companyId)
          .map(_copyMap)
          .toList(),
    };
  }

  Future<Map<String, dynamic>> adminGenerateTenantId({
    String companyName = '',
  }) async {
    return {
      'tenant_id': 1000 + _clients.length,
      'tenant_uid': 'tenant-${_clients.length + 1}',
      'company_name': companyName.trim(),
      'message': 'Demo tenant ID generated locally.',
    };
  }

  Future<Map<String, dynamic>> adminCreateClientApp({
    required String name,
    int? tenantId,
    String allowedOrigins = '',
    String status = 'active',
  }) async {
    final app = _newApp(
      name: name.trim().isEmpty ? 'Flutter Client App' : name.trim(),
      tenantId: tenantId ?? 1,
      platform: 'web_mobile',
      allowedOrigins: allowedOrigins,
      status: status,
    );
    _apps.add(app);
    return {'message': 'Demo client app created locally.', 'app': app};
  }

  Future<Map<String, dynamic>> adminCreateSdkToken({
    required String appName,
    String companyName = '',
    int? tenantId,
    int? planId,
    String platform = 'android',
    String allowedOrigins = '',
  }) async {
    final app = _newApp(
      name: appName.trim().isEmpty ? 'Flutter Client App' : appName.trim(),
      tenantId: tenantId ?? 1,
      platform: platform,
      allowedOrigins: allowedOrigins,
    );
    _apps.add(app);
    final credentials = _credentialsForApp(app);
    return {
      'message': 'Demo token generated locally.',
      'app': app,
      'credentials': credentials,
      'integration': {
        'sdk_token_header': 'x-rtc-sdk-token',
        'verification_endpoint': '/api/client/me',
        'smoke_test_method': 'verifyIntegration',
      },
    };
  }

  Future<Map<String, dynamic>> adminVerifySdkToken(String sdkToken) async {
    return {
      'ok': sdkToken.trim().isNotEmpty,
      'integration_status': sdkToken.trim().isEmpty ? 'missing' : 'ready',
      'message': sdkToken.trim().isEmpty
          ? 'Paste a demo token to verify.'
          : 'Demo token is ready.',
      'company': {'id': 1, 'name': 'TalkEachOther'},
      'app': _apps.isEmpty ? const {} : _copyMap(_apps.last),
      'checks': {
        'app_access': 'ready',
        'package': 'active',
        'room_features': 'enabled',
      },
    };
  }

  Future<Map<String, dynamic>> adminRotateClientAppCredentials(
    int appId, {
    String reason = 'Rotated from Flutter service console',
    String scope = 'all',
  }) async {
    final index = _apps.indexWhere((app) => _asInt(app['id']) == appId);
    if (index < 0) return {'message': 'Demo app not found.'};
    _apps[index] = {
      ..._apps[index],
      'app_key': 'app_demo_${DateTime.now().millisecondsSinceEpoch}',
      'sdk_token_masked': 'rtc_demo...rotated',
    };
    return {
      'message': 'Demo credentials rotated locally.',
      'app': _copyMap(_apps[index]),
      'credentials': _credentialsForApp(_apps[index]),
      'integration': {
        'sdk_token_header': 'x-rtc-sdk-token',
        'verification_endpoint': '/api/client/me',
        'smoke_test_method': 'verifyIntegration',
      },
    };
  }

  Future<Map<String, dynamic>> adminUpdateClientApp(
    int appId, {
    String? name,
    String? status,
    String? allowedOrigins,
  }) async {
    final index = _apps.indexWhere((app) => _asInt(app['id']) == appId);
    if (index < 0) return {'message': 'Demo app not found.'};
    final updated = {..._apps[index]};
    if (name != null) updated['name'] = name;
    if (status != null) updated['status'] = status;
    if (allowedOrigins != null) {
      updated['allowed_origins'] = _splitOrigins(allowedOrigins);
    }
    _apps[index] = updated;
    return {'message': 'Demo app access updated locally.', 'app': _apps[index]};
  }

  Future<Map<String, dynamic>> adminRequestPlan({
    required int planId,
    String note = '',
  }) async {
    final plan = _plans.firstWhere(
      (row) => _asInt(row['id']) == planId,
      orElse: () => _plans.first,
    );
    final request = {
      'id': _nextPlanRequestId++,
      'status': 'pending',
      'billing_type': 'monthly',
      'current_plan': _plans.first,
      'requested_plan': plan,
      'note': note,
    };
    _planRequests.add(request);
    return {
      'message': 'Demo package request added locally.',
      'request': request,
    };
  }

  Future<Map<String, dynamic>> adminReviewPlanRequest(
    int requestId, {
    required String status,
    String note = '',
  }) async {
    final index = _planRequests.indexWhere(
      (row) => _asInt(row['id']) == requestId,
    );
    if (index >= 0) {
      _planRequests[index] = {
        ..._planRequests[index],
        'status': status,
        if (note.trim().isNotEmpty) 'review_note': note.trim(),
      };
    }
    return {'message': 'Demo package request $status locally.'};
  }

  Future<Map<String, dynamic>> adminUpdateCompanyStatus(
    int companyId,
    String status,
  ) async {
    final index = _clients.indexWhere((row) => _asInt(row['id']) == companyId);
    if (index >= 0) {
      _clients[index] = {..._clients[index], 'status': status};
    }
    return {'message': 'Demo company status updated locally.'};
  }

  Future<Map<String, dynamic>> adminUpdateRoomStatus(
    int roomId,
    String status,
  ) async {
    final index = _rooms.indexWhere((room) => room.id == roomId);
    if (index >= 0) {
      final room = _rooms[index];
      _rooms[index] = _roomCopy(room, status: status);
    }
    return {'message': 'Demo room status updated locally.'};
  }

  Future<Map<String, dynamic>> adminDeleteRoom(int roomId) async {
    await deleteRoom(roomId);
    return {'message': 'Demo room removed locally.'};
  }

  Future<Map<String, dynamic>> adminCreateRoom({
    int? tenantId,
    required String name,
    String description = '',
    String roomType = 'video',
    String privacyType = 'public',
    String password = '',
    int maxMicCount = 8,
    bool chatEnabled = true,
    bool giftEnabled = false,
    bool screenShareEnabled = false,
    bool aiSecurityEnabled = false,
  }) async {
    final room = await createRoom(
      name: name,
      description: description,
      roomType: roomType,
      privacyType: privacyType,
      password: password,
      maxMicCount: maxMicCount,
      chatEnabled: chatEnabled,
      giftEnabled: giftEnabled,
      screenShareEnabled: screenShareEnabled,
      aiSecurityEnabled: aiSecurityEnabled,
    );
    return {
      'message': 'Demo managed room created locally.',
      'room': _roomToAdminRow(room),
    };
  }

  Future<AppSession> _saveSession(String token, AppUser user) async {
    _session = AppSession(token: token, user: user);
    await _sessionStore.write(_tokenKey, token);
    await _sessionStore.write(_userKey, jsonEncode(user.toJson()));
    return _session!;
  }
}

int _nextUserId = 10;
int _nextRoomId = 100;
int _nextMessageId = 1000;
int _nextAppId = 10;
int _nextPlanRequestId = 20;

final List<Room> _rooms = _demoRooms();
final List<Map<String, dynamic>> _apps = [_newApp(name: 'Flutter Preview App')];
final List<Map<String, dynamic>> _planRequests = [
  {
    'id': 4,
    'status': 'pending',
    'billing_type': 'monthly',
    'current_plan': {'id': 1, 'name': 'Starter'},
    'requested_plan': {'id': 2, 'name': 'Growth'},
  },
];

final List<Map<String, dynamic>> _messageContacts = [
  {
    'peer_id': 201,
    'peer_name': 'Maya Chen',
    'peer_avatar_url': 'assets/rtc/avatars/avatar-04.png',
    'last_message': {
      'message_type': 'text',
      'message_body': 'The stage layout looks ready.',
      'created_at': DateTime.now()
          .toUtc()
          .subtract(const Duration(minutes: 18))
          .toIso8601String(),
    },
  },
  {
    'peer_id': 202,
    'peer_name': 'Jon Bell',
    'peer_avatar_url': 'assets/rtc/avatars/avatar-05.png',
    'last_message': {
      'message_type': 'text',
      'message_body': 'Can we test the music room design next?',
      'created_at': DateTime.now()
          .toUtc()
          .subtract(const Duration(hours: 2))
          .toIso8601String(),
    },
  },
];

final List<Map<String, dynamic>> _directMessages = [
  {
    'id': 1,
    'sender_id': 201,
    'receiver_id': 1,
    'message_type': 'text',
    'message_body': 'The stage layout looks ready.',
    'created_at': DateTime.now()
        .toUtc()
        .subtract(const Duration(minutes: 22))
        .toIso8601String(),
  },
  {
    'id': 2,
    'sender_id': 1,
    'receiver_id': 201,
    'message_type': 'text',
    'message_body': 'Great. I am polishing the mobile preview.',
    'created_at': DateTime.now()
        .toUtc()
        .subtract(const Duration(minutes: 18))
        .toIso8601String(),
  },
  {
    'id': 3,
    'sender_id': 202,
    'receiver_id': 1,
    'message_type': 'text',
    'message_body': 'Can we test the music room design next?',
    'created_at': DateTime.now()
        .toUtc()
        .subtract(const Duration(hours: 2))
        .toIso8601String(),
  },
];

final List<Map<String, dynamic>> _clients = [
  {
    'id': 1,
    'tenant_id': 1,
    'tenant_uid': 'tenant-demo',
    'name': 'TalkEachOther',
    'status': 'active',
    'plan': {'id': 2, 'name': 'Growth'},
  },
  {
    'id': 2,
    'tenant_id': 2,
    'tenant_uid': 'tenant-studio',
    'name': 'Studio Labs',
    'status': 'active',
    'plan': {'id': 1, 'name': 'Starter'},
  },
];

final List<Map<String, dynamic>> _plans = [
  {
    'id': 1,
    'name': 'Starter',
    'monthly_base_price': 49,
    'monthly_minute_allowance': 10000,
    'status': 'active',
  },
  {
    'id': 2,
    'name': 'Growth',
    'monthly_base_price': 149,
    'monthly_minute_allowance': 50000,
    'status': 'active',
  },
  {
    'id': 3,
    'name': 'Scale',
    'monthly_base_price': 399,
    'monthly_minute_allowance': 200000,
    'status': 'active',
  },
];

List<Room> _demoRooms() {
  final now = DateTime.now().toUtc();
  return [
    Room(
      id: 77,
      tenantId: 1,
      tenantName: 'TalkEachOther',
      ownerId: 1,
      ownerName: 'Ava Morgan',
      ownerRegion: 'United States',
      ownerFollowed: true,
      name: 'Creator Studio Live',
      description: 'A polished video room preview for product demos.',
      roomType: 'video',
      privacyType: 'public',
      maxMicCount: 8,
      activeParticipants: 128,
      activeParticipantPreviews: const [
        RoomParticipantPreview(userId: 201, name: 'Maya'),
        RoomParticipantPreview(userId: 202, name: 'Jon'),
        RoomParticipantPreview(userId: 203, name: 'Rin'),
      ],
      theme: 'neon',
      chatEnabled: true,
      screenShareEnabled: true,
      aiSecurityEnabled: true,
      createdAt: now.subtract(const Duration(hours: 3)).toIso8601String(),
      updatedAt: now.toIso8601String(),
    ),
    Room(
      id: 78,
      tenantId: 1,
      tenantName: 'TalkEachOther',
      ownerId: 2,
      ownerName: 'Noah Kim',
      ownerRegion: 'Canada',
      ownerFollowed: false,
      name: 'Acoustic Night',
      description: 'Music room interface with soft stage controls.',
      roomType: 'audio',
      privacyType: 'public',
      maxMicCount: 12,
      activeParticipants: 84,
      activeParticipantPreviews: const [
        RoomParticipantPreview(userId: 204, name: 'Ivy'),
        RoomParticipantPreview(userId: 205, name: 'Leo'),
      ],
      theme: 'studio',
      chatEnabled: true,
      giftEnabled: true,
      createdAt: now.subtract(const Duration(hours: 6)).toIso8601String(),
      updatedAt: now.toIso8601String(),
    ),
    Room(
      id: 79,
      tenantId: 1,
      tenantName: 'TalkEachOther',
      ownerId: 1,
      ownerName: 'Ava Morgan',
      ownerRegion: 'United States',
      ownerFollowed: true,
      name: 'Private Product Review',
      description: 'Locked room preview for invite-only sessions.',
      roomType: 'group_video',
      privacyType: 'password',
      isPasswordProtected: true,
      maxMicCount: 6,
      activeParticipants: 12,
      theme: 'midnight',
      chatEnabled: true,
      screenShareEnabled: true,
      createdAt: now.subtract(const Duration(days: 1)).toIso8601String(),
      updatedAt: now.toIso8601String(),
    ),
    Room(
      id: 80,
      tenantId: 2,
      tenantName: 'Studio Labs',
      ownerId: 3,
      ownerName: 'Elena Park',
      ownerRegion: 'United Kingdom',
      ownerFollowed: false,
      name: 'PK Showcase',
      description: 'Competitive live stage layout with audience energy.',
      roomType: 'pk_live',
      privacyType: 'public',
      maxMicCount: 4,
      activeParticipants: 205,
      theme: 'mint',
      chatEnabled: true,
      giftEnabled: true,
      aiSecurityEnabled: true,
      createdAt: now.subtract(const Duration(minutes: 40)).toIso8601String(),
      updatedAt: now.toIso8601String(),
    ),
  ];
}

Map<String, dynamic> _adminOverview() {
  final rooms = _rooms.map(_roomToAdminRow).toList();

  return {
    'scope': 'super_admin',
    'admin': {'tenant_id': 1, 'tenant_name': 'TalkEachOther'},
    'company': {'name': 'TalkEachOther'},
    'rooms': rooms,
    'daily_usage': [
      {'usage_date': '2026-06-26', 'billable_minutes': 1280},
      {'usage_date': '2026-06-27', 'billable_minutes': 1640},
      {'usage_date': '2026-06-28', 'billable_minutes': 1485},
    ],
    'participant_records': List.generate(
      8,
      (index) => {'id': index + 1, 'user_name': 'Participant ${index + 1}'},
    ),
    'dashboard': {
      'active_sessions': _rooms.length,
      'minutes_used_today': 520,
      'minutes_used_this_month': 4405,
      'metrics': {
        'rooms': {'active': _rooms.length, 'total': _rooms.length + 2},
        'sessions': {'active': _rooms.length, 'total': 28},
        'usage': {
          'month': {'minutes': 4405},
        },
        'verification': {'status': 'verified', 'issue_count': 0},
      },
      'recent_usage_logs': rooms.take(3).map((room) {
        return {
          'room_name': room['name'],
          'user_name': room['owner_name'],
          'usage_type': room['room_type'],
          'billable_minutes': 120 + _asInt(room['id']),
        };
      }).toList(),
      'active_sessions_monitor': {
        'sessions': rooms.take(4).map((room) {
          return {
            'room_name': room['name'],
            'active_participants': room['active_participants'],
            'reconnecting': 0,
            'health': 'live',
          };
        }).toList(),
      },
    },
    'enterprise': {
      'service_model': {
        'purpose': 'UI-only control center preview with local demo data.',
        'rtc_provider': 'UI preview',
        'connection_indicator': 'ok',
      },
      'current_plan': {'id': 2, 'name': 'Growth'},
      'billing': {'estimated_invoice': 240},
      'platform_totals': {
        'active_apps': _apps.length,
        'active_clients': _clients.length,
        'estimated_invoice': 240,
      },
      'apps': _apps.map(_copyMap).toList(),
      'clients': _clients.map(_copyMap).toList(),
      'admins': const [
        {
          'name': 'Ava Morgan',
          'email': 'admin@gmail.com',
          'tenant_name': 'TalkEachOther',
          'active_rooms': 4,
        },
      ],
      'plans': _plans.map(_copyMap).toList(),
      'plan_requests': _planRequests.map(_copyMap).toList(),
      'service_flow': const [
        {'title': 'Create app access', 'status': 'ready'},
        {'title': 'Open room preview', 'status': 'ready'},
        {'title': 'Review usage mockup', 'status': 'ready'},
      ],
      'sdk_status': {
        'auth_flow': 'Generate local demo credentials for the UI handoff.',
      },
      'feature_controls': const [
        {'key': 'video_rooms', 'label': 'Video rooms', 'enabled': true},
        {'key': 'music_rooms', 'label': 'Music rooms', 'enabled': true},
        {'key': 'stage_controls', 'label': 'Stage controls', 'enabled': true},
        {'key': 'moderation', 'label': 'Moderation UI', 'enabled': true},
      ],
    },
  };
}

AppUser _demoUserForEmail(String email) {
  final normalized = normalizeUserEmail(email);
  final admin =
      normalized == 'admin@gmail.com' || normalized == 'admin@accenture.com';
  return AppUser(
    id: admin ? 1 : 9,
    tenantId: 1,
    name: admin ? 'Ava Morgan' : _nameFromEmail(normalized),
    email: normalized,
    phone: '',
    gender: admin ? 'female' : '',
    age: admin ? 30 : null,
    birthday: admin ? '1996-01-01' : '',
    currentResidence: admin ? 'United States' : '',
    avatarUrl: admin ? 'assets/rtc/avatars/avatar-01.png' : '',
    roles: admin ? const ['super_admin'] : const ['client_admin'],
  );
}

String _nameFromEmail(String email) {
  final local = email.split('@').first.trim();
  if (local.isEmpty) return 'Demo User';
  return local
      .split(RegExp(r'[._-]+'))
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}

Map<String, dynamic> _newApp({
  required String name,
  int tenantId = 1,
  String platform = 'web_mobile',
  String allowedOrigins = '',
  String status = 'active',
}) {
  final id = _nextAppId++;
  return {
    'id': id,
    'tenant_id': tenantId,
    'tenant_name': tenantId == 2 ? 'Studio Labs' : 'TalkEachOther',
    'name': name,
    'platform': platform,
    'status': status,
    'app_key': 'app_demo_$id',
    'sdk_token_masked': 'rtc_demo...$id',
    'allowed_origins': _splitOrigins(allowedOrigins),
  };
}

Map<String, dynamic> _credentialsForApp(Map<String, dynamic> app) {
  final id = _asInt(app['id']);
  return {
    'app_key': app['app_key'] ?? 'app_demo_$id',
    'api_key': 'api_demo_$id',
    'sdk_token': 'rtc_demo_token_$id',
  };
}

List<String> _splitOrigins(String value) {
  return value
      .split(',')
      .map((origin) => origin.trim())
      .where((origin) => origin.isNotEmpty)
      .toList(growable: false);
}

Map<String, dynamic> _roomToAdminRow(Room room) {
  return {
    ...room.toJsonLike(),
    'billable_minutes': 100 + room.activeParticipants * 2,
  };
}

Room _roomCopy(Room room, {String? status}) {
  return Room(
    id: room.id,
    tenantId: room.tenantId,
    tenantName: room.tenantName,
    ownerId: room.ownerId,
    ownerName: room.ownerName,
    ownerRegion: room.ownerRegion,
    ownerFollowed: room.ownerFollowed,
    name: room.name,
    description: room.description,
    roomType: room.roomType,
    privacyType: room.privacyType,
    isPasswordProtected: room.isPasswordProtected,
    profileImage: room.profileImage,
    maxMicCount: room.maxMicCount,
    activeParticipants: room.activeParticipants,
    activeParticipantPreviews: room.activeParticipantPreviews,
    theme: room.theme,
    chatEnabled: room.chatEnabled,
    giftEnabled: room.giftEnabled,
    screenShareEnabled: room.screenShareEnabled,
    aiSecurityEnabled: room.aiSecurityEnabled,
    status: status ?? room.status,
    createdAt: room.createdAt,
    updatedAt: DateTime.now().toUtc().toIso8601String(),
  );
}

extension _RoomJsonLike on Room {
  Map<String, dynamic> toJsonLike() {
    return {
      'id': id,
      'tenant_id': tenantId,
      'tenant_name': tenantName,
      'owner_id': ownerId,
      'owner_name': ownerName,
      'owner_region': ownerRegion,
      'owner_followed': ownerFollowed,
      'name': name,
      'description': description,
      'room_type': roomType,
      'privacy_type': privacyType,
      'is_password_protected': isPasswordProtected,
      'profile_image': profileImage,
      'max_mic_count': maxMicCount,
      'active_participants': activeParticipants,
      'theme': theme,
      'chat_enabled': chatEnabled,
      'gift_enabled': giftEnabled,
      'screen_share_enabled': screenShareEnabled,
      'ai_security_enabled': aiSecurityEnabled,
      'status': status,
      'created_at': createdAt,
      'updated_at': updatedAt,
    };
  }
}

Map<String, dynamic> _copyMap(Map<String, dynamic> value) {
  return Map<String, dynamic>.from(value);
}

int _asInt(Object? value) {
  if (value is int) return value;
  return int.tryParse(value?.toString() ?? '') ?? 0;
}

int _dateValue(String value) {
  return DateTime.tryParse(value)?.millisecondsSinceEpoch ?? 0;
}

String _normalizeAuthEmail(String value) {
  return value.trim().toLowerCase();
}

String apiErrorMessage(Object error) {
  final text = error.toString().trim();
  if (text.startsWith('Exception: ')) return text.substring(11);
  if (text.startsWith('Bad state: ')) return text.substring(11);
  return text.isEmpty ? 'The UI preview could not complete that action.' : text;
}
