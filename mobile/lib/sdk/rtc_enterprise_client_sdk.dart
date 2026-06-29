import 'package:dio/dio.dart';

class RtcEnterpriseClientSdk {
  RtcEnterpriseClientSdk({
    required String apiBaseUrl,
    String? apiKey,
    String? sdkToken,
    Dio? dio,
  }) : _credentialHeaders = _RtcClientCredential.resolve(
         apiKey: apiKey,
         sdkToken: sdkToken,
       ).headers,
       _dio =
           dio ??
           Dio(
             BaseOptions(
               baseUrl: apiBaseUrl.replaceFirst(RegExp(r'/+$'), ''),
               connectTimeout: const Duration(seconds: 12),
               receiveTimeout: const Duration(seconds: 20),
               headers: const {'Accept': 'application/json'},
             ),
           );

  final Map<String, String> _credentialHeaders;
  final Dio _dio;

  Future<Map<String, dynamic>> me() => _request('GET', '/client/me');

  Future<Map<String, dynamic>> verifyIntegration() => me();

  Future<Map<String, dynamic>> syncExternalUser(
    RtcExternalUserSyncRequest user,
  ) {
    return _request('POST', '/client/users/sync', data: user.toJson());
  }

  Future<Map<String, dynamic>> getExternalUser(String externalUserId) {
    return _request(
      'GET',
      '/client/users/${Uri.encodeComponent(externalUserId)}',
    );
  }

  Future<Map<String, dynamic>> listRooms({
    String status = 'active',
    String privacyType = 'all',
    String roomType = 'all',
    String search = '',
    int page = 1,
    int perPage = 24,
  }) {
    return _request(
      'GET',
      '/client/rooms',
      queryParameters: {
        'status': status,
        'privacy_type': privacyType,
        'room_type': roomType,
        'q': search,
        'page': page,
        'per_page': perPage,
      },
    );
  }

  Future<Map<String, dynamic>> createRoom(RtcRoomCreateRequest room) {
    return _request('POST', '/client/rooms', data: room.toJson());
  }

  Future<Map<String, dynamic>> getRoom(int roomId) {
    return _request('GET', '/client/rooms/$roomId');
  }

  Future<Map<String, dynamic>> updateRoom(
    int roomId,
    Map<String, Object?> updates,
  ) {
    return _request('PATCH', '/client/rooms/$roomId', data: updates);
  }

  Future<Map<String, dynamic>> updateRoomStatus(int roomId, String status) {
    return _request(
      'PATCH',
      '/client/rooms/$roomId/status',
      data: {'status': status},
    );
  }

  Future<Map<String, dynamic>> disableRoom(int roomId) {
    return _request('POST', '/client/rooms/$roomId/disable');
  }

  Future<Map<String, dynamic>> endRoom(int roomId) {
    return _request('DELETE', '/client/rooms/$roomId');
  }

  Future<RtcTokenIssue> issueRtcToken(RtcTokenRequest request) async {
    final data = await _request(
      'POST',
      '/client/rtc/token',
      data: request.toJson(),
    );
    return RtcTokenIssue(data);
  }

  Future<RtcSessionEnvelope> startSession(RtcSessionRequest request) async {
    final data = await _request(
      'POST',
      '/client/rtc/session/start',
      data: request.toJson(),
    );
    return RtcSessionEnvelope(data);
  }

  Future<RtcSessionEnvelope> endSession(RtcSessionRequest request) async {
    final data = await _request(
      'POST',
      '/client/rtc/session/end',
      data: request.toJson(),
    );
    return RtcSessionEnvelope(data);
  }

  Future<RtcMediaStateEnvelope> updateMediaState(
    RtcMediaStateRequest request,
  ) async {
    final data = await _request(
      'POST',
      '/client/rtc/session/media-state',
      data: request.toJson(),
    );
    return RtcMediaStateEnvelope(data);
  }

  Future<RtcQualitySampleEnvelope> sendQualitySample(
    RtcQualitySampleRequest request,
  ) async {
    final data = await _request(
      'POST',
      '/client/rtc/session/quality',
      data: request.toJson(),
    );
    return RtcQualitySampleEnvelope(data);
  }

  Future<RtcMediaConfig> getRtcConfig() async {
    final data = await _requestWithFallback(
      'GET',
      '/rtc-network-config',
      fallbackPath: '/rtc/config',
    );
    return RtcMediaConfig.fromJson(data);
  }

  Future<Map<String, dynamic>> _requestWithFallback(
    String method,
    String path, {
    required String fallbackPath,
    Object? data,
    Map<String, Object?>? queryParameters,
  }) async {
    try {
      return await _request(
        method,
        path,
        data: data,
        queryParameters: queryParameters,
      );
    } on RtcClientApiException catch (error) {
      if (error.statusCode != 404) rethrow;
      return _request(
        method,
        fallbackPath,
        data: data,
        queryParameters: queryParameters,
      );
    }
  }

  Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Object? data,
    Map<String, Object?>? queryParameters,
  }) async {
    try {
      final response = await _dio.request<Map<String, dynamic>>(
        path,
        data: data,
        queryParameters: _cleanQuery(queryParameters),
        options: Options(
          method: method,
          headers: {'Content-Type': 'application/json', ..._credentialHeaders},
        ),
      );

      return response.data ?? const <String, dynamic>{};
    } on DioException catch (error) {
      final responseData = error.response?.data;
      if (responseData is Map) {
        final payload = Map<String, dynamic>.from(responseData);
        throw RtcClientApiException(
          statusCode: error.response?.statusCode ?? 0,
          code: payload['code']?.toString() ?? 'client_api_error',
          message:
              payload['message']?.toString() ?? 'Client API request failed.',
          errors: _asMap(payload['errors']),
        );
      }

      throw RtcClientApiException(
        statusCode: error.response?.statusCode ?? 0,
        code: 'network_error',
        message: error.message ?? 'Client API request failed.',
      );
    }
  }

  Map<String, Object?> _cleanQuery(Map<String, Object?>? query) {
    final source = query ?? const <String, Object?>{};
    return Map.fromEntries(
      source.entries.where((entry) {
        final value = entry.value;
        if (value == null) return false;
        if (value is String) return value.trim().isNotEmpty;
        return true;
      }),
    );
  }
}

class _RtcClientCredential {
  const _RtcClientCredential(this.headers);

  final Map<String, String> headers;

  static _RtcClientCredential resolve({String? apiKey, String? sdkToken}) {
    final normalizedSdkToken = sdkToken?.trim() ?? '';
    final normalizedApiKey = apiKey?.trim() ?? '';
    final headers = <String, String>{
      if (normalizedApiKey.isNotEmpty) 'x-rtc-api-key': normalizedApiKey,
      if (normalizedSdkToken.isNotEmpty) 'x-rtc-sdk-token': normalizedSdkToken,
    };

    if (headers.isNotEmpty) {
      return _RtcClientCredential(headers);
    }

    throw ArgumentError('Provide either sdkToken or apiKey.');
  }
}

class RtcExternalUserSyncRequest {
  const RtcExternalUserSyncRequest({
    required this.externalUserId,
    required this.name,
    this.email,
    this.phone,
    this.avatarUrl,
    this.status = 'active',
    this.metadata,
  });

  final String externalUserId;
  final String name;
  final String? email;
  final String? phone;
  final String? avatarUrl;
  final String status;
  final Map<String, Object?>? metadata;

  Map<String, Object?> toJson() => _withoutNulls({
    'external_user_id': externalUserId,
    'name': name,
    'email': email,
    'phone': phone,
    'avatar_url': avatarUrl,
    'status': status,
    'metadata': metadata,
  });
}

class RtcRoomCreateRequest {
  const RtcRoomCreateRequest({
    required this.externalUserId,
    required this.name,
    this.description,
    this.profileImage,
    this.roomType = 'video',
    this.privacyType = 'public',
    this.password,
    this.maxMicCount = 8,
    this.theme,
    this.chatEnabled = true,
    this.giftEnabled = false,
    this.screenShareEnabled = false,
    this.aiSecurityEnabled = false,
  });

  final String externalUserId;
  final String name;
  final String? description;
  final String? profileImage;
  final String roomType;
  final String privacyType;
  final String? password;
  final int maxMicCount;
  final String? theme;
  final bool chatEnabled;
  final bool giftEnabled;
  final bool screenShareEnabled;
  final bool aiSecurityEnabled;

  Map<String, Object?> toJson() => _withoutNulls({
    'external_user_id': externalUserId,
    'name': name,
    'description': description,
    'profile_image': profileImage,
    'room_type': roomType,
    'privacy_type': privacyType,
    'password': password,
    'max_mic_count': maxMicCount,
    'theme': theme,
    'chat_enabled': chatEnabled,
    'gift_enabled': giftEnabled,
    'screen_share_enabled': screenShareEnabled,
    'ai_security_enabled': aiSecurityEnabled,
  });
}

enum RtcRoomRole {
  audience('audience'),
  publisher('publisher'),
  moderator('moderator'),
  roomAdmin('admin'),
  owner('owner');

  const RtcRoomRole(this.apiValue);

  final String apiValue;
}

class RtcTokenRequest {
  const RtcTokenRequest({
    required this.externalUserId,
    required this.roomId,
    this.role = RtcRoomRole.publisher,
    this.permissions = const [],
    this.rtcMode,
  });

  final String externalUserId;
  final int roomId;
  final RtcRoomRole role;
  final List<String> permissions;
  final String? rtcMode;

  Map<String, Object?> toJson() => _withoutNulls({
    'external_user_id': externalUserId,
    'room_id': roomId,
    'role': role.apiValue,
    'permissions': permissions,
    'rtc_mode': rtcMode,
  });
}

class RtcSessionRequest {
  const RtcSessionRequest({
    required this.externalUserId,
    required this.roomId,
    this.sessionId,
    this.role = RtcRoomRole.publisher,
    this.rtcMode,
    this.microphoneEnabled = true,
    this.cameraEnabled = true,
    this.screenShared = false,
  });

  final String externalUserId;
  final int roomId;
  final int? sessionId;
  final RtcRoomRole role;
  final String? rtcMode;
  final bool microphoneEnabled;
  final bool cameraEnabled;
  final bool screenShared;

  Map<String, Object?> toJson() => _withoutNulls({
    'external_user_id': externalUserId,
    'room_id': roomId,
    'session_id': sessionId,
    'role': role.apiValue,
    'rtc_mode': rtcMode,
    'mic_enabled': microphoneEnabled,
    'camera_enabled': cameraEnabled,
    'screen_shared': screenShared,
  });
}

class RtcMediaStateRequest {
  const RtcMediaStateRequest({
    required this.externalUserId,
    required this.roomId,
    this.sessionId,
    this.role = RtcRoomRole.publisher,
    this.rtcMode,
    required this.microphoneEnabled,
    required this.cameraEnabled,
    required this.screenShared,
  });

  final String externalUserId;
  final int roomId;
  final int? sessionId;
  final RtcRoomRole role;
  final String? rtcMode;
  final bool microphoneEnabled;
  final bool cameraEnabled;
  final bool screenShared;

  Map<String, Object?> toJson() => _withoutNulls({
    'external_user_id': externalUserId,
    'room_id': roomId,
    'session_id': sessionId,
    'role': role.apiValue,
    'rtc_mode': rtcMode,
    'mic_enabled': microphoneEnabled,
    'camera_enabled': cameraEnabled,
    'screen_shared': screenShared,
  });
}

class RtcQualitySampleRequest {
  const RtcQualitySampleRequest({
    required this.externalUserId,
    required this.roomId,
    this.sessionId,
    this.quality = 'unknown',
    this.peerCount = 0,
    this.measuredPeerCount = 0,
    this.incomingKbps = 0,
    this.outgoingKbps = 0,
    this.rttMs = 0,
    this.packetLossPct = 0,
    this.availableOutgoingKbps = 0,
    this.localCandidateTypes = const [],
    this.remoteCandidateTypes = const [],
    this.peerStates = const {},
    this.media = const {},
  });

  final String externalUserId;
  final int roomId;
  final int? sessionId;
  final String quality;
  final int peerCount;
  final int measuredPeerCount;
  final double incomingKbps;
  final double outgoingKbps;
  final double rttMs;
  final double packetLossPct;
  final double availableOutgoingKbps;
  final List<String> localCandidateTypes;
  final List<String> remoteCandidateTypes;
  final Map<String, int> peerStates;
  final Map<String, double> media;

  Map<String, Object?> toJson() => _withoutNulls({
    'external_user_id': externalUserId,
    'room_id': roomId,
    'session_id': sessionId,
    'quality': quality,
    'peer_count': peerCount,
    'measured_peer_count': measuredPeerCount,
    'incoming_kbps': incomingKbps,
    'outgoing_kbps': outgoingKbps,
    'rtt_ms': rttMs,
    'packet_loss_pct': packetLossPct,
    'available_outgoing_kbps': availableOutgoingKbps,
    'local_candidate_types': localCandidateTypes,
    'remote_candidate_types': remoteCandidateTypes,
    'peer_states': peerStates,
    'media': media,
  });
}

class RtcTokenIssue {
  const RtcTokenIssue(this.raw);

  final Map<String, dynamic> raw;

  String get rtcToken => raw['rtc_token']?.toString() ?? '';
  String get tokenType => raw['token_type']?.toString() ?? 'Bearer';
  String get expiresAt => raw['expires_at']?.toString() ?? '';
  int get expiresIn => _asInt(raw['expires_in']);
  Map<String, dynamic> get room => _asMap(raw['room']);
  Map<String, dynamic> get externalUser => _asMap(raw['external_user']);
  Map<String, dynamic> get grants => _asMap(raw['grants']);
  String get signalingRoom {
    final roomSignaling = room['signaling_room']?.toString().trim() ?? '';
    if (roomSignaling.isNotEmpty) return roomSignaling;
    return raw['signaling_room']?.toString().trim() ?? '';
  }

  int get roomId => _asInt(room['id'] ?? grants['room_id']);
  int get localUid => _asInt(
    raw['local_uid'] ??
        raw['uid'] ??
        externalUser['user_id'] ??
        externalUser['id'],
  );
  String get channelProfile {
    final profile = _asMap(room['rtc_profile']);
    return profile['channel_profile']?.toString() ?? 'communication';
  }

  String get mediaType {
    final profile = _asMap(room['rtc_profile']);
    return profile['media_type']?.toString() ?? 'video';
  }
}

class RtcSessionEnvelope {
  const RtcSessionEnvelope(this.raw);

  final Map<String, dynamic> raw;

  Map<String, dynamic> get session => _asMap(raw['session']);
  Map<String, dynamic> get participant => _asMap(raw['participant']);
  Map<String, dynamic> get room => _asMap(raw['room']);
  int get sessionId => _asInt(raw['session_id'] ?? session['id']);
  int get participantId => _asInt(raw['participant_id'] ?? participant['id']);
  int get billableMinutes => _asInt(raw['billable_minutes']);
}

class RtcMediaStateEnvelope {
  const RtcMediaStateEnvelope(this.raw);

  final Map<String, dynamic> raw;

  Map<String, dynamic> get participant => _asMap(raw['participant']);
  Map<String, dynamic> get rtc => _asMap(raw['rtc']);
  bool get microphoneEnabled => _asBool(rtc['mic_enabled']) ?? false;
  bool get cameraEnabled => _asBool(rtc['camera_enabled']) ?? false;
  bool get screenShared => _asBool(rtc['screen_shared']) ?? false;
}

class RtcQualitySampleEnvelope {
  const RtcQualitySampleEnvelope(this.raw);

  final Map<String, dynamic> raw;

  int get sampleId => _asInt(raw['sample_id'] ?? _asMap(raw['sample'])['id']);
  String get quality =>
      raw['quality']?.toString() ??
      _asMap(raw['sample'])['quality']?.toString() ??
      'unknown';
  String get participantStatus =>
      raw['participant_status']?.toString() ??
      _asMap(raw['sample'])['participantStatus']?.toString() ??
      'unknown';
}

class RtcMediaConfig {
  const RtcMediaConfig({
    required this.iceServers,
    this.iceTransportPolicy = 'all',
    this.turnConfigured = false,
    this.turnCredentialType,
    this.turnExpiresAt,
    this.turnTtlSeconds,
  });

  final List<RtcIceServer> iceServers;
  final String iceTransportPolicy;
  final bool turnConfigured;
  final String? turnCredentialType;
  final int? turnExpiresAt;
  final int? turnTtlSeconds;

  factory RtcMediaConfig.fromJson(Map<String, dynamic> json) {
    final servers = json['iceServers'] ?? json['ice_servers'];
    final policy = json['iceTransportPolicy'] ?? json['ice_transport_policy'];

    return RtcMediaConfig(
      iceServers: servers is List
          ? servers
                .map((server) => RtcIceServer.fromJson(_asMap(server)))
                .where((server) => server.urls.isNotEmpty)
                .toList()
          : const <RtcIceServer>[],
      iceTransportPolicy: policy == 'relay' ? 'relay' : 'all',
      turnConfigured:
          _asBool(json['turnConfigured'] ?? json['turn_configured']) ?? false,
      turnCredentialType: _cleanString(
        json['turnCredentialType'] ?? json['turn_credential_type'],
      ),
      turnExpiresAt: _readNullableInt(
        json['turnExpiresAt'] ?? json['turn_expires_at'],
      ),
      turnTtlSeconds: _readNullableInt(
        json['turnTtlSeconds'] ?? json['turn_ttl_seconds'],
      ),
    ).effective();
  }

  factory RtcMediaConfig.fallback() {
    return const RtcMediaConfig(
      iceServers: [
        RtcIceServer(urls: ['stun:stun.l.google.com:19302']),
      ],
    );
  }

  RtcMediaConfig effective() {
    return iceServers.isEmpty ? RtcMediaConfig.fallback() : this;
  }

  Map<String, Object?> toPeerConnectionConfiguration() {
    final effectiveConfig = effective();
    return {
      'iceServers': effectiveConfig.iceServers
          .map((server) => server.toPeerConnectionJson())
          .toList(),
      'iceTransportPolicy': effectiveConfig.iceTransportPolicy,
      'iceCandidatePoolSize': 4,
    };
  }
}

class RtcIceServer {
  const RtcIceServer({required this.urls, this.username, this.credential});

  final List<String> urls;
  final String? username;
  final String? credential;

  factory RtcIceServer.fromJson(Map<String, dynamic> json) {
    return RtcIceServer(
      urls: _readStringList(json['urls'] ?? json['url']),
      username: _cleanString(json['username']),
      credential: _cleanString(json['credential']),
    );
  }

  Map<String, Object?> toPeerConnectionJson() {
    return _withoutNulls({
      'urls': urls.length == 1 ? urls.single : urls,
      'username': username,
      'credential': credential,
    });
  }
}

class RtcClientApiException implements Exception {
  const RtcClientApiException({
    required this.statusCode,
    required this.code,
    required this.message,
    this.errors = const {},
  });

  final int statusCode;
  final String code;
  final String message;
  final Map<String, dynamic> errors;

  @override
  String toString() => message;
}

Map<String, Object?> _withoutNulls(Map<String, Object?> value) {
  return Map.fromEntries(value.entries.where((entry) => entry.value != null));
}

Map<String, dynamic> _asMap(Object? value) {
  if (value is Map) return Map<String, dynamic>.from(value);
  return const <String, dynamic>{};
}

int _asInt(Object? value) {
  if (value is int) return value;
  return int.tryParse(value?.toString() ?? '') ?? 0;
}

int? _readNullableInt(Object? value) {
  if (value == null) return null;
  if (value is int) return value;
  return int.tryParse(value.toString());
}

String? _cleanString(Object? value) {
  final text = value?.toString().trim();
  if (text == null || text.isEmpty) return null;
  return text;
}

List<String> _readStringList(Object? value) {
  if (value is List) {
    return value
        .map((entry) => entry?.toString().trim() ?? '')
        .where((entry) => entry.isNotEmpty)
        .toList();
  }

  final text = value?.toString().trim() ?? '';
  return text.isEmpty ? const <String>[] : <String>[text];
}

bool? _asBool(Object? value) {
  if (value == null) return null;
  if (value is bool) return value;
  if (value is num) return value != 0;
  final normalized = value.toString().trim().toLowerCase();
  if (normalized.isEmpty) return null;
  if (const {'true', '1', 'yes', 'on'}.contains(normalized)) return true;
  if (const {'false', '0', 'no', 'off'}.contains(normalized)) return false;
  return null;
}
