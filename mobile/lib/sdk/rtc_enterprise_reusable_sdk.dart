import 'dart:async';
import 'dart:io' show Platform;

import 'package:dio/dio.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

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

enum RtcLiveMediaMode {
  audio('audio'),
  video('video');

  const RtcLiveMediaMode(this.apiValue);

  final String apiValue;
}

enum RtcLiveEventType {
  status,
  signaling,
  peers,
  peerState,
  joined,
  left,
  error,
}

class RtcLiveEvent {
  const RtcLiveEvent({required this.type, required this.message, this.data});

  final RtcLiveEventType type;
  final String message;
  final Object? data;
}

class RtcEnterpriseJoinRequest {
  const RtcEnterpriseJoinRequest({
    required this.externalUserId,
    required this.displayName,
    required this.roomId,
    this.databaseRoomId,
    this.signalingUserId,
    this.signalingRoom,
    this.email,
    this.phone,
    this.avatarUrl,
    this.gender = '',
    this.role = RtcRoomRole.publisher,
    this.permissions,
    this.mediaMode = RtcLiveMediaMode.video,
    this.micEnabled = true,
    this.cameraEnabled = true,
    this.screenShared = false,
    this.syncExternalUser = true,
    this.fetchRoom = true,
    this.startUsageSession = true,
    this.openLocalMedia = true,
    this.userMetadata,
  });

  final String externalUserId;
  final String displayName;
  final int roomId;
  final int? databaseRoomId;
  final int? signalingUserId;
  final String? signalingRoom;
  final String? email;
  final String? phone;
  final String? avatarUrl;
  final String gender;
  final RtcRoomRole role;
  final List<String>? permissions;
  final RtcLiveMediaMode mediaMode;
  final bool micEnabled;
  final bool cameraEnabled;
  final bool screenShared;
  final bool syncExternalUser;
  final bool fetchRoom;
  final bool startUsageSession;
  final bool openLocalMedia;
  final Map<String, Object?>? userMetadata;
}

class RtcEnterpriseRoomSession {
  const RtcEnterpriseRoomSession({
    required this.externalUserId,
    required this.roomId,
    required this.databaseRoomId,
    required this.signalingRoom,
    required this.signalingUserId,
    required this.role,
    required this.mediaMode,
    required this.micEnabled,
    required this.cameraEnabled,
    required this.screenShared,
    required this.token,
    this.room = const {},
    this.usageSession,
  });

  final String externalUserId;
  final int roomId;
  final int databaseRoomId;
  final String signalingRoom;
  final int signalingUserId;
  final RtcRoomRole role;
  final RtcLiveMediaMode mediaMode;
  final bool micEnabled;
  final bool cameraEnabled;
  final bool screenShared;
  final RtcTokenIssue token;
  final Map<String, dynamic> room;
  final RtcSessionEnvelope? usageSession;

  int? get usageSessionId {
    final sessionId = usageSession?.sessionId ?? 0;
    return sessionId > 0 ? sessionId : null;
  }

  RtcEnterpriseRoomSession copyWith({
    bool? micEnabled,
    bool? cameraEnabled,
    bool? screenShared,
  }) {
    return RtcEnterpriseRoomSession(
      externalUserId: externalUserId,
      roomId: roomId,
      databaseRoomId: databaseRoomId,
      signalingRoom: signalingRoom,
      signalingUserId: signalingUserId,
      role: role,
      mediaMode: mediaMode,
      micEnabled: micEnabled ?? this.micEnabled,
      cameraEnabled: cameraEnabled ?? this.cameraEnabled,
      screenShared: screenShared ?? this.screenShared,
      token: token,
      room: room,
      usageSession: usageSession,
    );
  }
}

class RtcEnterpriseServices {
  factory RtcEnterpriseServices({
    required String apiBaseUrl,
    String? signalingUrl,
    String? apiKey,
    String? sdkToken,
    Dio? dio,
    RtcEnterpriseClientSdk? api,
    RtcEnterpriseLiveSdk? rtc,
  }) {
    final resolvedApi =
        api ??
        RtcEnterpriseClientSdk(
          apiBaseUrl: apiBaseUrl,
          apiKey: apiKey,
          sdkToken: sdkToken,
          dio: dio,
        );
    final resolvedRtc =
        rtc ??
        RtcEnterpriseLiveSdk(
          apiBaseUrl: apiBaseUrl,
          apiKey: apiKey,
          sdkToken: sdkToken,
          signalingUrl: signalingUrl,
          client: resolvedApi,
        );

    return RtcEnterpriseServices._(api: resolvedApi, rtc: resolvedRtc);
  }

  const RtcEnterpriseServices._({required this.api, required this.rtc});

  final RtcEnterpriseClientSdk api;
  final RtcEnterpriseLiveSdk rtc;

  Stream<RtcLiveEvent> get events => rtc.events;
  Stream<List<Map<String, dynamic>>> get peers => rtc.peers;
  Stream<RtcRemoteStream> get remoteStreams => rtc.remoteStreams;
  Stream<RtcPeerStateSnapshot> get peerStates => rtc.peerStates;
  MediaStream? get localStream => rtc.localStream;
  RtcEnterpriseRoomSession? get activeSession => rtc.activeSession;
  bool get isJoined => rtc.isJoined;

  Future<Map<String, dynamic>> verifyIntegration() => api.verifyIntegration();

  Future<Map<String, dynamic>> createAudioRoom({
    required String externalUserId,
    required String name,
    String? description,
    String privacyType = 'public',
    int maxMicCount = 8,
    bool chatEnabled = true,
    bool giftEnabled = false,
    bool aiSecurityEnabled = false,
  }) {
    return api.createRoom(
      RtcRoomCreateRequest(
        externalUserId: externalUserId,
        name: name,
        description: description,
        roomType: 'audio',
        privacyType: privacyType,
        maxMicCount: maxMicCount,
        chatEnabled: chatEnabled,
        giftEnabled: giftEnabled,
        aiSecurityEnabled: aiSecurityEnabled,
      ),
    );
  }

  Future<Map<String, dynamic>> createVideoRoom({
    required String externalUserId,
    required String name,
    String? description,
    String privacyType = 'public',
    int maxMicCount = 8,
    bool chatEnabled = true,
    bool giftEnabled = false,
    bool screenShareEnabled = false,
    bool aiSecurityEnabled = false,
  }) {
    return api.createRoom(
      RtcRoomCreateRequest(
        externalUserId: externalUserId,
        name: name,
        description: description,
        roomType: 'video',
        privacyType: privacyType,
        maxMicCount: maxMicCount,
        chatEnabled: chatEnabled,
        giftEnabled: giftEnabled,
        screenShareEnabled: screenShareEnabled,
        aiSecurityEnabled: aiSecurityEnabled,
      ),
    );
  }

  Future<RtcEnterpriseRoomSession> joinRoom(RtcEnterpriseJoinRequest request) {
    return rtc.joinRoom(request);
  }

  Future<RtcEnterpriseRoomSession> joinAudioRoom({
    required String externalUserId,
    required String displayName,
    required int roomId,
    int? databaseRoomId,
    int? signalingUserId,
    String? signalingRoom,
    String? email,
    String? phone,
    String? avatarUrl,
    String gender = '',
    RtcRoomRole role = RtcRoomRole.publisher,
    List<String>? permissions,
    bool micEnabled = true,
    bool screenShared = false,
    bool syncExternalUser = true,
    bool fetchRoom = true,
    bool startUsageSession = true,
    bool openLocalMedia = true,
    Map<String, Object?>? userMetadata,
  }) {
    return joinRoom(
      RtcEnterpriseJoinRequest(
        externalUserId: externalUserId,
        displayName: displayName,
        roomId: roomId,
        databaseRoomId: databaseRoomId,
        signalingUserId: signalingUserId,
        signalingRoom: signalingRoom,
        email: email,
        phone: phone,
        avatarUrl: avatarUrl,
        gender: gender,
        role: role,
        permissions: permissions,
        mediaMode: RtcLiveMediaMode.audio,
        micEnabled: micEnabled,
        cameraEnabled: false,
        screenShared: screenShared,
        syncExternalUser: syncExternalUser,
        fetchRoom: fetchRoom,
        startUsageSession: startUsageSession,
        openLocalMedia: openLocalMedia,
        userMetadata: userMetadata,
      ),
    );
  }

  Future<RtcEnterpriseRoomSession> joinVideoRoom({
    required String externalUserId,
    required String displayName,
    required int roomId,
    int? databaseRoomId,
    int? signalingUserId,
    String? signalingRoom,
    String? email,
    String? phone,
    String? avatarUrl,
    String gender = '',
    RtcRoomRole role = RtcRoomRole.publisher,
    List<String>? permissions,
    bool micEnabled = true,
    bool cameraEnabled = true,
    bool screenShared = false,
    bool syncExternalUser = true,
    bool fetchRoom = true,
    bool startUsageSession = true,
    bool openLocalMedia = true,
    Map<String, Object?>? userMetadata,
  }) {
    return joinRoom(
      RtcEnterpriseJoinRequest(
        externalUserId: externalUserId,
        displayName: displayName,
        roomId: roomId,
        databaseRoomId: databaseRoomId,
        signalingUserId: signalingUserId,
        signalingRoom: signalingRoom,
        email: email,
        phone: phone,
        avatarUrl: avatarUrl,
        gender: gender,
        role: role,
        permissions: permissions,
        mediaMode: RtcLiveMediaMode.video,
        micEnabled: micEnabled,
        cameraEnabled: cameraEnabled,
        screenShared: screenShared,
        syncExternalUser: syncExternalUser,
        fetchRoom: fetchRoom,
        startUsageSession: startUsageSession,
        openLocalMedia: openLocalMedia,
        userMetadata: userMetadata,
      ),
    );
  }

  Future<void> setMicrophoneEnabled(bool enabled) {
    return rtc.setMicEnabled(enabled);
  }

  Future<void> setCameraEnabled(bool enabled) {
    return rtc.setCameraEnabled(enabled);
  }

  Future<void> setScreenShareEnabled(bool enabled) {
    return rtc.setScreenShareEnabled(enabled);
  }

  Future<void> setMediaState({
    bool? micEnabled,
    bool? cameraEnabled,
    bool? screenShared,
  }) {
    return rtc.setMediaState(
      micEnabled: micEnabled,
      cameraEnabled: cameraEnabled,
      screenShared: screenShared,
    );
  }

  Future<void> refreshPeers() => rtc.refreshPeers();

  Future<void> leaveRoom({bool endUsageSession = true}) {
    return rtc.leaveRoom(endUsageSession: endUsageSession);
  }

  Future<void> dispose() => rtc.dispose();
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
      turnConfigured: _readBool(
        json['turnConfigured'] ?? json['turn_configured'],
      ),
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

class RtcEnterpriseLiveSdk {
  RtcEnterpriseLiveSdk({
    required String apiBaseUrl,
    String? apiKey,
    String? sdkToken,
    String? signalingUrl,
    RtcEnterpriseClientSdk? client,
    RtcMediaService? mediaService,
    RtcPeerCoordinator? peerCoordinator,
    SignalingService? signalingService,
  }) : _client =
           client ??
           RtcEnterpriseClientSdk(
             apiBaseUrl: apiBaseUrl,
             apiKey: apiKey,
             sdkToken: sdkToken,
           ),
       _media = mediaService ?? RtcMediaService(),
       _peerCoordinator = peerCoordinator ?? RtcPeerConnectionService(),
       _signaling =
           signalingService ??
           SignalingService(
             signalingUrl: _resolveSignalingUrl(
               apiBaseUrl: apiBaseUrl,
               signalingUrl: signalingUrl,
             ),
           );

  final RtcEnterpriseClientSdk _client;
  final RtcMediaService _media;
  final RtcPeerCoordinator _peerCoordinator;
  final SignalingService _signaling;
  final _events = StreamController<RtcLiveEvent>.broadcast();
  final _subscriptions = <StreamSubscription<Object?>>[];

  MediaStream? _localStream;
  RtcEnterpriseRoomSession? _session;
  bool _joined = false;
  bool _joining = false;
  bool _disposed = false;

  Stream<RtcLiveEvent> get events => _events.stream;
  Stream<List<Map<String, dynamic>>> get peers => _signaling.peers;
  Stream<RtcRemoteStream> get remoteStreams => _peerCoordinator.remoteStreams;
  Stream<RtcPeerStateSnapshot> get peerStates => _peerCoordinator.peerStates;
  MediaStream? get localStream => _localStream;
  RtcEnterpriseRoomSession? get activeSession => _session;
  bool get isJoined => _joined;

  Future<RtcEnterpriseRoomSession> joinRoom(
    RtcEnterpriseJoinRequest request,
  ) async {
    _ensureNotDisposed();
    if (_joining) throw StateError('RTC join is already in progress.');
    if (_joined) await leaveRoom();

    _joining = true;
    _emitStatus('Preparing RTC join.');

    try {
      await _configurePeerConnections();
      await _peerCoordinator.attachSignaling(_signaling);
      _installSubscriptions();

      final cameraEnabled =
          request.mediaMode == RtcLiveMediaMode.video && request.cameraEnabled;
      final permissions = request.permissions ?? _defaultPermissions(request);

      if (request.syncExternalUser) {
        _emitStatus('Syncing external RTC user.');
        await _client.syncExternalUser(
          RtcExternalUserSyncRequest(
            externalUserId: request.externalUserId,
            name: request.displayName,
            email: _cleanString(request.email),
            phone: _cleanString(request.phone),
            avatarUrl: _cleanString(request.avatarUrl),
            metadata: request.userMetadata,
          ),
        );
      }

      final room = request.fetchRoom
          ? _asMap((await _client.getRoom(request.roomId))['room'])
          : const <String, dynamic>{};

      _emitStatus('Issuing RTC token.');
      final token = await _client.issueRtcToken(
        RtcTokenRequest(
          externalUserId: request.externalUserId,
          roomId: request.roomId,
          role: request.role,
          permissions: permissions,
          rtcMode: request.mediaMode.apiValue,
        ),
      );

      final roomId = token.roomId > 0 ? token.roomId : request.roomId;
      final databaseRoomId = request.databaseRoomId ?? roomId;
      final signalingRoom =
          _cleanString(request.signalingRoom) ??
          _cleanString(token.signalingRoom) ??
          _cleanString(room['signaling_room']) ??
          '';
      if (signalingRoom.isEmpty) {
        throw StateError('RTC token did not include a signaling room.');
      }

      final signalingUserId = request.signalingUserId ?? token.localUid;
      if (signalingUserId <= 0) {
        throw StateError(
          'RTC token did not include a local signaling user id.',
        );
      }

      if (request.openLocalMedia && (request.micEnabled || cameraEnabled)) {
        _emitStatus('Opening local media.');
        await _openLocalMedia(
          micEnabled: request.micEnabled,
          cameraEnabled: cameraEnabled,
        );
      } else {
        await _peerCoordinator.setLocalStream(null, video: false);
      }

      RtcSessionEnvelope? usageSession;
      if (request.startUsageSession) {
        _emitStatus('Starting RTC usage session.');
        usageSession = await _client.startSession(
          RtcSessionRequest(
            externalUserId: request.externalUserId,
            roomId: roomId,
            role: request.role,
            rtcMode: request.mediaMode.apiValue,
            microphoneEnabled: request.micEnabled,
            cameraEnabled: cameraEnabled,
            screenShared: request.screenShared,
          ),
        );
      }

      _session = RtcEnterpriseRoomSession(
        externalUserId: request.externalUserId,
        roomId: roomId,
        databaseRoomId: databaseRoomId,
        signalingRoom: signalingRoom,
        signalingUserId: signalingUserId,
        role: request.role,
        mediaMode: request.mediaMode,
        micEnabled: request.micEnabled,
        cameraEnabled: cameraEnabled,
        screenShared: request.screenShared,
        token: token,
        room: room,
        usageSession: usageSession,
      );

      _emitStatus('Connecting signaling.');
      await _signaling.connect();
      await _signaling.joinRoom(
        signalingRoom: signalingRoom,
        databaseRoomId: databaseRoomId,
        user: RtcSignalingUserIdentity(
          id: signalingUserId,
          name: request.displayName,
          gender: request.gender,
          avatarUrl: request.avatarUrl ?? '',
        ),
        video: request.mediaMode == RtcLiveMediaMode.video,
        micEnabled: request.micEnabled,
        cameraEnabled: cameraEnabled,
      );

      _joined = true;
      await _peerCoordinator.setLocalStream(_localStream, video: cameraEnabled);
      await refreshPeers();

      final joinedSession = _session!;
      _emit(
        RtcLiveEvent(
          type: RtcLiveEventType.joined,
          message: 'RTC room joined.',
          data: joinedSession,
        ),
      );
      return joinedSession;
    } catch (error) {
      await _cleanupFailedJoin();
      _emit(
        RtcLiveEvent(
          type: RtcLiveEventType.error,
          message: error.toString(),
          data: error,
        ),
      );
      rethrow;
    } finally {
      _joining = false;
    }
  }

  Future<void> refreshPeers() async {
    _ensureNotDisposed();
    final peers = await _signaling.requestPeers();
    await _peerCoordinator.syncPeers(peers);
  }

  Future<void> _configurePeerConnections() async {
    final coordinator = _peerCoordinator;
    if (coordinator is! RtcConfigurablePeerCoordinator) return;

    _emitStatus('Loading RTC network config.');
    try {
      final config = await _client.getRtcConfig();
      await coordinator.configure(config);
    } catch (error) {
      await coordinator.configure(RtcMediaConfig.fallback());
      _emitStatus('Using fallback RTC network config.');
    }
  }

  Future<void> setMicEnabled(bool enabled) {
    return setMediaState(micEnabled: enabled);
  }

  Future<void> setCameraEnabled(bool enabled) {
    return setMediaState(cameraEnabled: enabled);
  }

  Future<void> setScreenShareEnabled(bool enabled) {
    return setMediaState(screenShared: enabled);
  }

  Future<void> setMediaState({
    bool? micEnabled,
    bool? cameraEnabled,
    bool? screenShared,
  }) async {
    _ensureNotDisposed();
    final current = _session;
    if (!_joined || current == null) {
      throw StateError('Join an RTC room before updating media state.');
    }

    final nextMic = micEnabled ?? current.micEnabled;
    final nextCamera =
        current.mediaMode == RtcLiveMediaMode.video &&
        (cameraEnabled ?? current.cameraEnabled);
    final nextScreen = screenShared ?? current.screenShared;

    if (nextMic || nextCamera) {
      await _ensureLocalMedia(micEnabled: nextMic, cameraEnabled: nextCamera);
    } else if (_localStream != null) {
      _applyLocalMediaState(micEnabled: false, cameraEnabled: false);
      await _peerCoordinator.setLocalStream(_localStream, video: false);
    } else {
      await _peerCoordinator.setLocalStream(null, video: false);
    }

    final nextSession = current.copyWith(
      micEnabled: nextMic,
      cameraEnabled: nextCamera,
      screenShared: nextScreen,
    );
    _session = nextSession;

    try {
      await _signaling.emitMediaState(
        video: nextCamera,
        micEnabled: nextMic,
        cameraEnabled: nextCamera,
        screenShared: nextScreen,
      );
    } catch (error) {
      _emit(
        RtcLiveEvent(
          type: RtcLiveEventType.status,
          message: 'RTC media state signal failed: $error',
          data: error,
        ),
      );
    }

    await _syncMediaState(nextSession);
    _emitStatus(
      nextMic
          ? nextCamera
                ? 'Microphone and camera are live.'
                : 'Microphone is live.'
          : 'Microphone is muted.',
    );
  }

  Future<void> leaveRoom({bool endUsageSession = true}) async {
    _ensureNotDisposed();
    final current = _session;
    if (!_joined && current == null) return;

    _signaling.leaveRoom();
    await _peerCoordinator.closeAll();

    if (endUsageSession && current != null) {
      await _endUsageSession(current);
    }

    _stopLocalMedia();
    _joined = false;
    _session = null;
    _emit(
      const RtcLiveEvent(type: RtcLiveEventType.left, message: 'RTC left.'),
    );
  }

  Future<void> dispose() async {
    if (_disposed) return;
    if (_joined || _session != null) {
      await leaveRoom();
    }
    _disposed = true;
    for (final subscription in _subscriptions) {
      await subscription.cancel();
    }
    _subscriptions.clear();
    _signaling.dispose();
    await _peerCoordinator.dispose();
    await _events.close();
  }

  void _installSubscriptions() {
    if (_subscriptions.isNotEmpty) return;
    _subscriptions
      ..add(
        _signaling.events.listen((message) {
          _emit(
            RtcLiveEvent(type: RtcLiveEventType.signaling, message: message),
          );
        }),
      )
      ..add(
        _signaling.peers.listen((peers) {
          _emit(
            RtcLiveEvent(
              type: RtcLiveEventType.peers,
              message: 'RTC peers updated.',
              data: peers,
            ),
          );
          if (_joined || _joining) {
            unawaited(_peerCoordinator.syncPeers(peers));
          }
        }),
      )
      ..add(
        _peerCoordinator.peerStates.listen((snapshot) {
          _emit(
            RtcLiveEvent(
              type: RtcLiveEventType.peerState,
              message: '${snapshot.socketId}: ${snapshot.state}',
              data: snapshot,
            ),
          );
        }),
      );
  }

  Future<void> _openLocalMedia({
    required bool micEnabled,
    required bool cameraEnabled,
  }) async {
    await _media.requestPermissions(video: cameraEnabled);
    _stopLocalMedia();
    _localStream = await _media.openLocalMedia(video: cameraEnabled);
    _applyLocalMediaState(micEnabled: micEnabled, cameraEnabled: cameraEnabled);
    await _peerCoordinator.setLocalStream(_localStream, video: cameraEnabled);
  }

  Future<void> _ensureLocalMedia({
    required bool micEnabled,
    required bool cameraEnabled,
  }) async {
    final stream = _localStream;
    final hasAudio = stream?.getAudioTracks().isNotEmpty == true;
    final hasVideo = stream?.getVideoTracks().isNotEmpty == true;
    if (hasAudio && (!cameraEnabled || hasVideo)) {
      _applyLocalMediaState(
        micEnabled: micEnabled,
        cameraEnabled: cameraEnabled,
      );
      await _peerCoordinator.setLocalStream(stream, video: cameraEnabled);
      return;
    }
    await _openLocalMedia(micEnabled: micEnabled, cameraEnabled: cameraEnabled);
  }

  void _applyLocalMediaState({
    required bool micEnabled,
    required bool cameraEnabled,
  }) {
    final stream = _localStream;
    if (stream == null) return;
    for (final track in stream.getAudioTracks()) {
      track.enabled = micEnabled;
    }
    for (final track in stream.getVideoTracks()) {
      track.enabled = cameraEnabled;
    }
  }

  void _stopLocalMedia() {
    final stream = _localStream;
    if (stream == null) return;
    for (final track in stream.getTracks()) {
      track.stop();
    }
    _localStream = null;
  }

  Future<void> _endUsageSession(RtcEnterpriseRoomSession session) async {
    if (session.usageSession == null) return;
    try {
      await _client.endSession(
        RtcSessionRequest(
          externalUserId: session.externalUserId,
          roomId: session.roomId,
          sessionId: session.usageSessionId,
          role: session.role,
          rtcMode: session.mediaMode.apiValue,
          microphoneEnabled: session.micEnabled,
          cameraEnabled: session.cameraEnabled,
          screenShared: session.screenShared,
        ),
      );
    } catch (error) {
      _emit(
        RtcLiveEvent(
          type: RtcLiveEventType.error,
          message: 'RTC usage session end failed: $error',
          data: error,
        ),
      );
    }
  }

  Future<void> _syncMediaState(RtcEnterpriseRoomSession session) async {
    if (session.usageSessionId == null) return;
    try {
      await _client.updateMediaState(
        RtcMediaStateRequest(
          externalUserId: session.externalUserId,
          roomId: session.roomId,
          sessionId: session.usageSessionId,
          role: session.role,
          rtcMode: session.mediaMode.apiValue,
          microphoneEnabled: session.micEnabled,
          cameraEnabled: session.cameraEnabled,
          screenShared: session.screenShared,
        ),
      );
    } catch (error) {
      _emit(
        RtcLiveEvent(
          type: RtcLiveEventType.status,
          message: 'RTC media state sync failed: $error',
          data: error,
        ),
      );
    }
  }

  Future<void> _cleanupFailedJoin() async {
    final current = _session;
    _signaling.leaveRoom();
    await _peerCoordinator.closeAll().catchError((_) {});
    if (current != null) await _endUsageSession(current);
    _stopLocalMedia();
    _joined = false;
    _session = null;
  }

  void _emitStatus(String message) {
    _emit(RtcLiveEvent(type: RtcLiveEventType.status, message: message));
  }

  void _emit(RtcLiveEvent event) {
    if (_events.isClosed) return;
    _events.add(event);
  }

  void _ensureNotDisposed() {
    if (_disposed) throw StateError('RtcEnterpriseLiveSdk is disposed.');
  }

  List<String> _defaultPermissions(RtcEnterpriseJoinRequest request) {
    return request.role == RtcRoomRole.audience
        ? const ['join', 'subscribe', 'chat']
        : const ['join', 'publish_audio', 'publish_video', 'subscribe', 'chat'];
  }
}

class RtcMediaService {
  Future<void> requestPermissions({required bool video}) async {
    final permissions = <Permission>[Permission.microphone];
    if (video) permissions.add(Permission.camera);
    if (Platform.isAndroid) permissions.add(Permission.bluetoothConnect);

    final statuses = await permissions.request();
    _requireGranted(
      statuses[Permission.microphone],
      'Microphone permission is required to join the room.',
    );
    if (video) {
      _requireGranted(
        statuses[Permission.camera],
        'Camera permission is required to join a video room.',
      );
    }
  }

  Future<MediaStream> openLocalMedia({required bool video}) async {
    try {
      return await navigator.mediaDevices.getUserMedia({
        'audio': true,
        'video': video
            ? {
                'facingMode': 'user',
                'width': {'ideal': 1280},
                'height': {'ideal': 720},
              }
            : false,
      });
    } catch (_) {
      throw RtcMediaPermissionException(
        video
            ? 'Could not start microphone and camera. Check app permissions and try again.'
            : 'Could not start microphone. Check app permissions and try again.',
      );
    }
  }

  void _requireGranted(PermissionStatus? status, String message) {
    if (status?.isGranted ?? false) return;
    throw RtcMediaPermissionException(message);
  }
}

class RtcMediaPermissionException implements Exception {
  const RtcMediaPermissionException(this.message);

  final String message;

  @override
  String toString() => message;
}

class WebRtcOfferSignal {
  const WebRtcOfferSignal({required this.fromSocketId, required this.offer});

  final String fromSocketId;
  final RTCSessionDescription offer;
}

class WebRtcAnswerSignal {
  const WebRtcAnswerSignal({required this.fromSocketId, required this.answer});

  final String fromSocketId;
  final RTCSessionDescription answer;
}

class WebRtcIceCandidateSignal {
  const WebRtcIceCandidateSignal({
    required this.fromSocketId,
    required this.candidate,
  });

  final String fromSocketId;
  final RTCIceCandidate candidate;
}

class PeerSignalError {
  const PeerSignalError({
    required this.message,
    this.eventName,
    this.targetSocketId,
  });

  final String message;
  final String? eventName;
  final String? targetSocketId;
}

class RtcSignalingUserIdentity {
  const RtcSignalingUserIdentity({
    required this.id,
    required this.name,
    this.gender = '',
    this.avatarUrl = '',
  });

  final int id;
  final String name;
  final String gender;
  final String avatarUrl;
}

class SignalingService {
  SignalingService({required String signalingUrl})
    : _signalingUrl = signalingUrl.trim().replaceFirst(RegExp(r'/+$'), '');

  final String _signalingUrl;
  io.Socket? _socket;
  String? _activeSignalingRoom;
  int? _localUserId;
  String? _localSocketId;
  List<Map<String, dynamic>> _currentPeers = const [];

  final _events = StreamController<String>.broadcast();
  final _peers = StreamController<List<Map<String, dynamic>>>.broadcast();
  final _offers = StreamController<WebRtcOfferSignal>.broadcast();
  final _answers = StreamController<WebRtcAnswerSignal>.broadcast();
  final _iceCandidates = StreamController<WebRtcIceCandidateSignal>.broadcast();
  final _peerSignalErrors = StreamController<PeerSignalError>.broadcast();
  final _sessionReplaced = StreamController<String>.broadcast();

  Stream<String> get events => _events.stream;
  Stream<List<Map<String, dynamic>>> get peers => _peers.stream;
  Stream<WebRtcOfferSignal> get offers => _offers.stream;
  Stream<WebRtcAnswerSignal> get answers => _answers.stream;
  Stream<WebRtcIceCandidateSignal> get iceCandidates => _iceCandidates.stream;
  Stream<PeerSignalError> get peerSignalErrors => _peerSignalErrors.stream;
  Stream<String> get sessionReplaced => _sessionReplaced.stream;
  String? get socketId => _socket?.id ?? _localSocketId;

  Future<void> connect() async {
    if (_socket?.connected ?? false) return;
    _socket?.dispose();

    final socket = io.io(
      _signalingUrl,
      io.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .disableAutoConnect()
          .setReconnectionAttempts(double.infinity)
          .setReconnectionDelay(800)
          .setReconnectionDelayMax(5000)
          .build(),
    );

    _socket = socket;
    final connected = Completer<void>();

    socket.onConnect((_) {
      _localSocketId = socket.id;
      _events.add('Connected as ${socket.id}');
      if (!connected.isCompleted) connected.complete();
    });
    socket.onConnectError((error) {
      _events.add('Signaling error: $error');
      if (!connected.isCompleted) {
        connected.completeError(error ?? 'Connect error');
      }
    });
    socket.onDisconnect((reason) => _events.add('Disconnected: $reason'));
    socket.on('existing-users', (payload) => _handlePeersPayload(payload));
    socket.on('user-joined', _upsertPeer);
    socket.on('user-left', _removePeer);
    socket.on('media-state-change', _upsertPeer);
    socket.on('webrtc-offer', _handleOfferPayload);
    socket.on('webrtc-answer', _handleAnswerPayload);
    socket.on('webrtc-ice-candidate', _handleIceCandidatePayload);
    socket.on('peer-signal-error', _handlePeerSignalErrorPayload);
    socket.on('room-session-replaced', (payload) {
      final roomId = payload is Map ? payload['roomId']?.toString() : null;
      final replacedRoom = roomId ?? _activeSignalingRoom ?? 'room';
      _events.add('Room session replaced: $replacedRoom');
      _sessionReplaced.add(replacedRoom);
      _activeSignalingRoom = null;
      _setPeers(const []);
    });

    socket.connect();
    return connected.future.timeout(const Duration(seconds: 12));
  }

  Future<Map<String, dynamic>> joinRoom({
    required String signalingRoom,
    required int databaseRoomId,
    required RtcSignalingUserIdentity user,
    required bool video,
    required bool micEnabled,
    required bool cameraEnabled,
  }) async {
    final socket = _socket;
    if (socket == null || !socket.connected) {
      throw StateError('Signaling socket is not connected.');
    }

    final completer = Completer<Map<String, dynamic>>();
    socket.emitWithAck(
      'join-room',
      {
        'roomId': signalingRoom,
        'databaseRoomId': databaseRoomId,
        'userId': user.id,
        'userName': user.name,
        'userGender': user.gender,
        'userAvatarUrl': user.avatarUrl,
        'rtcMode': video ? 'video' : 'audio',
        'micEnabled': micEnabled,
        'cameraEnabled': video && cameraEnabled,
        'screenShared': false,
      },
      ack: (response) {
        if (response is Map) {
          final data = Map<String, dynamic>.from(response);
          if (data['ok'] == true) {
            _activeSignalingRoom = signalingRoom;
            _localUserId = user.id;
            _localSocketId = socket.id;
            _handlePeersPayload(data);
            completer.complete(data);
          } else {
            completer.completeError(
              data['message']?.toString() ?? 'Join failed.',
            );
          }
          return;
        }
        completer.completeError('Unexpected signaling response.');
      },
    );

    return completer.future.timeout(const Duration(seconds: 8));
  }

  Future<Map<String, dynamic>> emitMediaState({
    required bool video,
    required bool micEnabled,
    required bool cameraEnabled,
    bool screenShared = false,
  }) async {
    final socket = _socket;
    final signalingRoom = _activeSignalingRoom;
    if (socket == null || !socket.connected || signalingRoom == null) {
      throw StateError('Signaling socket is not connected.');
    }

    final completer = Completer<Map<String, dynamic>>();
    socket.emitWithAck(
      'media-state-change',
      {
        'roomId': signalingRoom,
        'rtcMode': video ? 'video' : 'audio',
        'micEnabled': micEnabled,
        'cameraEnabled': video && cameraEnabled,
        'screenShared': screenShared,
      },
      ack: (response) {
        _completeAck(response, completer, 'Media state signaling failed.');
      },
    );

    return completer.future.timeout(const Duration(seconds: 3));
  }

  Future<Map<String, dynamic>> emitWebRtcOffer({
    required String targetSocketId,
    required RTCSessionDescription offer,
  }) {
    return _emitPeerSignal(
      'webrtc-offer',
      targetSocketId: targetSocketId,
      payloadKey: 'offer',
      payload: offer.toMap(),
    );
  }

  Future<Map<String, dynamic>> emitWebRtcAnswer({
    required String targetSocketId,
    required RTCSessionDescription answer,
  }) {
    return _emitPeerSignal(
      'webrtc-answer',
      targetSocketId: targetSocketId,
      payloadKey: 'answer',
      payload: answer.toMap(),
    );
  }

  Future<Map<String, dynamic>> emitWebRtcIceCandidate({
    required String targetSocketId,
    required RTCIceCandidate candidate,
  }) {
    return _emitPeerSignal(
      'webrtc-ice-candidate',
      targetSocketId: targetSocketId,
      payloadKey: 'candidate',
      payload: candidate.toMap(),
      timeout: const Duration(seconds: 2),
    );
  }

  Future<List<Map<String, dynamic>>> requestPeers() async {
    final socket = _socket;
    final signalingRoom = _activeSignalingRoom;
    if (socket == null || !socket.connected || signalingRoom == null) {
      return _currentPeers;
    }

    final completer = Completer<List<Map<String, dynamic>>>();
    socket.emitWithAck(
      'room-peers',
      {'roomId': signalingRoom},
      ack: (response) {
        if (response is Map) {
          final data = Map<String, dynamic>.from(response);
          if (data['ok'] == true) {
            final peers = _peersFromPayload(data);
            _setPeers(peers);
            completer.complete(peers);
          } else {
            completer.completeError(
              data['message']?.toString() ?? 'Peer refresh failed.',
            );
          }
          return;
        }
        completer.completeError('Unexpected peer response.');
      },
    );

    return completer.future.timeout(const Duration(seconds: 5));
  }

  void leaveRoom() {
    final signalingRoom = _activeSignalingRoom;
    if (signalingRoom == null) {
      _socket?.emit('leave-room');
    } else {
      _socket?.emit('leave-room', {'roomId': signalingRoom});
    }
    _activeSignalingRoom = null;
    _localUserId = null;
    _localSocketId = null;
    _setPeers(const []);
  }

  void dispose() {
    leaveRoom();
    _socket?.dispose();
    _socket = null;
    _events.close();
    _peers.close();
    _offers.close();
    _answers.close();
    _iceCandidates.close();
    _peerSignalErrors.close();
    _sessionReplaced.close();
  }

  Future<Map<String, dynamic>> _emitPeerSignal(
    String eventName, {
    required String targetSocketId,
    required String payloadKey,
    required Object? payload,
    Duration timeout = const Duration(seconds: 5),
  }) async {
    final socket = _socket;
    if (socket == null || !socket.connected) {
      throw StateError('Signaling socket is not connected.');
    }

    final completer = Completer<Map<String, dynamic>>();
    socket.emitWithAck(
      eventName,
      {'targetSocketId': targetSocketId, payloadKey: payload},
      ack: (response) =>
          _completeAck(response, completer, '$eventName failed.'),
    );

    return completer.future.timeout(timeout);
  }

  void _completeAck(
    Object? response,
    Completer<Map<String, dynamic>> completer,
    String fallbackMessage,
  ) {
    if (response is Map) {
      final data = Map<String, dynamic>.from(response);
      if (data['ok'] == true) {
        completer.complete(data);
      } else {
        completer.completeError(data['message']?.toString() ?? fallbackMessage);
      }
      return;
    }
    completer.completeError('Unexpected signaling response.');
  }

  void _handleOfferPayload(Object? payload) {
    final data = _payloadMap(payload);
    final fromSocketId = data?['fromSocketId']?.toString();
    final offer = _sessionDescription(data?['offer']);
    if (fromSocketId == null || offer == null) return;
    _offers.add(WebRtcOfferSignal(fromSocketId: fromSocketId, offer: offer));
  }

  void _handleAnswerPayload(Object? payload) {
    final data = _payloadMap(payload);
    final fromSocketId = data?['fromSocketId']?.toString();
    final answer = _sessionDescription(data?['answer']);
    if (fromSocketId == null || answer == null) return;
    _answers.add(
      WebRtcAnswerSignal(fromSocketId: fromSocketId, answer: answer),
    );
  }

  void _handleIceCandidatePayload(Object? payload) {
    final data = _payloadMap(payload);
    final fromSocketId = data?['fromSocketId']?.toString();
    final candidate = _iceCandidate(data?['candidate']);
    if (fromSocketId == null || candidate == null) return;
    _iceCandidates.add(
      WebRtcIceCandidateSignal(
        fromSocketId: fromSocketId,
        candidate: candidate,
      ),
    );
  }

  void _handlePeerSignalErrorPayload(Object? payload) {
    final data = _payloadMap(payload);
    _peerSignalErrors.add(
      PeerSignalError(
        eventName: data?['eventName']?.toString(),
        targetSocketId: data?['targetSocketId']?.toString(),
        message: data?['message']?.toString() ?? 'Peer signal failed.',
      ),
    );
  }

  void _handlePeersPayload(Object? payload) {
    if (payload is! Map) return;
    final data = Map<String, dynamic>.from(payload);
    _setPeers(_peersFromPayload(data));
  }

  List<Map<String, dynamic>> _peersFromPayload(Map<String, dynamic> data) {
    final users = data['users'] ?? data['peers'] ?? data['participants'];
    return users is List
        ? normalizeSignalingPeers(
            users,
            localUserId: _localUserId,
            localSocketId: socketId,
          )
        : <Map<String, dynamic>>[];
  }

  void _setPeers(List<Map<String, dynamic>> peers) {
    if (_peers.isClosed) return;
    _currentPeers = peers;
    _peers.add(List.unmodifiable(peers));
  }

  void _upsertPeer(Object? payload) {
    final peers = normalizeSignalingPeers(
      [payload],
      localUserId: _localUserId,
      localSocketId: socketId,
    );
    if (peers.isEmpty) return;
    final peer = peers.single;
    final nextSocketId = _peerSocketId(peer);
    final nextUserId = _peerUserId(peer);
    final next = [..._currentPeers];
    final index = next.indexWhere((current) {
      final currentSocketId = _peerSocketId(current);
      final currentUserId = _peerUserId(current);
      return (nextSocketId != null && nextSocketId == currentSocketId) ||
          (nextUserId != null && nextUserId == currentUserId);
    });
    if (index >= 0) {
      next[index] = {...next[index], ...peer};
    } else {
      next.add(peer);
    }
    _setPeers(next);
  }

  void _removePeer(Object? payload) {
    if (payload is! Map) return;
    final peer = Map<String, dynamic>.from(payload);
    final socketId = _peerSocketId(peer);
    final userId = _peerUserId(peer);
    final next = _currentPeers.where((current) {
      final currentSocketId = _peerSocketId(current);
      final currentUserId = _peerUserId(current);
      if (socketId != null && socketId == currentSocketId) return false;
      if (userId != null && userId == currentUserId) return false;
      return true;
    }).toList();
    _setPeers(next);
  }
}

class RtcRemoteStream {
  const RtcRemoteStream({required this.socketId, required this.stream});

  final String socketId;
  final MediaStream? stream;
}

class RtcPeerStateSnapshot {
  const RtcPeerStateSnapshot({required this.socketId, required this.state});

  final String socketId;
  final String state;
}

abstract class RtcPeerCoordinator {
  Stream<RtcRemoteStream> get remoteStreams;
  Stream<RtcPeerStateSnapshot> get peerStates;

  Future<void> attachSignaling(SignalingService signaling);
  Future<void> setLocalStream(MediaStream? stream, {required bool video});
  Future<void> syncPeers(List<Map<String, dynamic>> peers);
  Future<void> closeAll();
  Future<void> dispose();
}

abstract class RtcConfigurablePeerCoordinator implements RtcPeerCoordinator {
  Future<void> configure(RtcMediaConfig config);
}

class RtcPeerConnectionService implements RtcConfigurablePeerCoordinator {
  RtcPeerConnectionService({RtcMediaConfig? mediaConfig})
    : _configuration = (mediaConfig ?? RtcMediaConfig.fallback())
          .toPeerConnectionConfiguration();

  final _remoteStreams = StreamController<RtcRemoteStream>.broadcast();
  final _peerStates = StreamController<RtcPeerStateSnapshot>.broadcast();
  final _peers = <String, _PeerConnectionHandle>{};
  final _pendingCandidates = <String, List<RTCIceCandidate>>{};
  final _remoteFallbackStreams = <String, MediaStream>{};
  final _remotePlaybackRenderers = <String, RTCVideoRenderer>{};
  final _subscriptions = <StreamSubscription<Object?>>[];
  Map<String, Object?> _configuration;

  SignalingService? _signaling;
  MediaStream? _localStream;
  bool _video = false;
  bool _disposed = false;

  @override
  Stream<RtcRemoteStream> get remoteStreams => _remoteStreams.stream;

  @override
  Stream<RtcPeerStateSnapshot> get peerStates => _peerStates.stream;

  @override
  Future<void> configure(RtcMediaConfig config) async {
    if (_disposed || _peers.isNotEmpty) return;
    _configuration = config.effective().toPeerConnectionConfiguration();
  }

  @override
  Future<void> attachSignaling(SignalingService signaling) async {
    if (_disposed) return;
    if (identical(_signaling, signaling)) return;
    await _cancelSubscriptions();
    _signaling = signaling;
    _subscriptions
      ..add(signaling.offers.listen((event) => _handleOffer(event)))
      ..add(signaling.answers.listen((event) => _handleAnswer(event)))
      ..add(signaling.iceCandidates.listen((event) => _handleIce(event)))
      ..add(
        signaling.peerSignalErrors.listen((event) {
          final target = event.targetSocketId;
          if (target == null) return;
          _emitPeerState(target, event.message);
        }),
      )
      ..add(signaling.sessionReplaced.listen((_) => unawaited(closeAll())));
  }

  @override
  Future<void> setLocalStream(
    MediaStream? stream, {
    required bool video,
  }) async {
    if (_disposed) return;
    _localStream = stream;
    _video = video;
    for (final peer in _peers.values) {
      await _syncLocalTracks(peer);
      unawaited(_makeOffer(peer, force: true));
    }
  }

  @override
  Future<void> syncPeers(List<Map<String, dynamic>> peers) async {
    if (_disposed) return;
    final localSocketId = _signaling?.socketId;
    final nextSocketIds = peers
        .map(_peerSocketId)
        .whereType<String>()
        .where((socketId) => socketId.isNotEmpty && socketId != localSocketId)
        .toSet();

    final staleSocketIds = _peers.keys
        .where((socketId) => !nextSocketIds.contains(socketId))
        .toList();
    for (final socketId in staleSocketIds) {
      await _closePeer(socketId);
    }

    for (final socketId in nextSocketIds) {
      final peer = await _ensurePeer(socketId);
      if (_shouldInitiate(socketId)) unawaited(_makeOffer(peer));
    }
  }

  @override
  Future<void> closeAll() async {
    final socketIds = _peers.keys.toList();
    for (final socketId in socketIds) {
      await _closePeer(socketId);
    }
    _pendingCandidates.clear();
  }

  @override
  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    await _cancelSubscriptions();
    await closeAll();
    await _remoteStreams.close();
    await _peerStates.close();
  }

  Future<_PeerConnectionHandle> _ensurePeer(String socketId) async {
    final existing = _peers[socketId];
    if (existing != null) return existing;

    final pc = await createPeerConnection(_configuration, _constraints);
    final peer = _PeerConnectionHandle(socketId: socketId, pc: pc);
    _peers[socketId] = peer;

    pc.onIceCandidate = (candidate) {
      if (candidate.candidate == null || candidate.candidate!.isEmpty) return;
      final signaling = _signaling;
      if (signaling == null) return;
      unawaited(
        signaling
            .emitWebRtcIceCandidate(
              targetSocketId: socketId,
              candidate: candidate,
            )
            .catchError((Object _) => <String, dynamic>{}),
      );
    };
    pc.onTrack = (event) {
      unawaited(_handleRemoteTrack(socketId, event));
    };
    pc.onAddStream = (stream) {
      _emitRemoteStream(socketId, stream);
    };
    pc.onRemoveStream = (_) {
      unawaited(_disposeRemotePlaybackSink(socketId));
      _remoteStreams.add(RtcRemoteStream(socketId: socketId, stream: null));
    };
    pc.onConnectionState = (state) =>
        _emitPeerState(socketId, _stateLabel(state));
    pc.onIceConnectionState = (state) =>
        _emitPeerState(socketId, _stateLabel(state));

    await _syncLocalTracks(peer);
    await _ensureReceiveTransceivers(peer, receiveVideo: _video);
    _emitPeerState(socketId, 'New peer');
    return peer;
  }

  Future<void> _syncLocalTracks(_PeerConnectionHandle peer) async {
    final stream = _localStream;
    final transceivers = await peer.pc.getTransceivers();
    if (stream == null) {
      await _clearSendingTracks(transceivers);
      return;
    }

    for (final track in stream.getTracks()) {
      if (track.kind == 'video' && !_video) continue;
      await _syncLocalTrackTransceiver(peer, transceivers, stream, track);
    }

    if (!_video) {
      for (final transceiver in transceivers) {
        if (_transceiverKind(transceiver) != 'video') continue;
        await transceiver.sender.replaceTrack(null);
        await _setTransceiverDirection(
          transceiver,
          TransceiverDirection.Inactive,
        );
      }
    }
  }

  Future<void> _syncLocalTrackTransceiver(
    _PeerConnectionHandle peer,
    List<RTCRtpTransceiver> transceivers,
    MediaStream stream,
    MediaStreamTrack track,
  ) async {
    final transceiver = _transceiverForKind(transceivers, track.kind);
    if (transceiver == null) {
      final created = await peer.pc.addTransceiver(
        track: track,
        init: RTCRtpTransceiverInit(
          direction: TransceiverDirection.SendRecv,
          streams: [stream],
        ),
      );
      transceivers.add(created);
      return;
    }

    if (transceiver.sender.track?.id != track.id) {
      await transceiver.sender.replaceTrack(track);
    }
    await _setTransceiverDirection(transceiver, TransceiverDirection.SendRecv);
  }

  Future<void> _clearSendingTracks(List<RTCRtpTransceiver> transceivers) async {
    for (final transceiver in transceivers) {
      if (transceiver.sender.track != null) {
        await transceiver.sender.replaceTrack(null);
      }
      final kind = _transceiverKind(transceiver);
      if (kind == 'audio') {
        await _setTransceiverDirection(
          transceiver,
          TransceiverDirection.RecvOnly,
        );
      } else if (kind == 'video') {
        await _setTransceiverDirection(
          transceiver,
          TransceiverDirection.Inactive,
        );
      }
    }
  }

  Future<void> _ensureReceiveTransceivers(
    _PeerConnectionHandle peer, {
    required bool receiveVideo,
  }) async {
    await _ensureReceiveTransceiver(
      peer,
      kind: 'audio',
      mediaType: RTCRtpMediaType.RTCRtpMediaTypeAudio,
      alreadyReady: peer.audioReceiveReady,
      markReady: () => peer.audioReceiveReady = true,
    );

    if (!receiveVideo) return;
    await _ensureReceiveTransceiver(
      peer,
      kind: 'video',
      mediaType: RTCRtpMediaType.RTCRtpMediaTypeVideo,
      alreadyReady: peer.videoReceiveReady,
      markReady: () => peer.videoReceiveReady = true,
    );
  }

  Future<void> _ensureReceiveTransceiver(
    _PeerConnectionHandle peer, {
    required String kind,
    required RTCRtpMediaType mediaType,
    required bool alreadyReady,
    required void Function() markReady,
  }) async {
    if (alreadyReady) return;

    try {
      final transceivers = await peer.pc.getTransceivers();
      final transceiver = _transceiverForKind(transceivers, kind);
      if (transceiver == null) {
        await peer.pc.addTransceiver(
          kind: mediaType,
          init: RTCRtpTransceiverInit(direction: TransceiverDirection.RecvOnly),
        );
      } else if (transceiver.sender.track == null) {
        await _setTransceiverDirection(
          transceiver,
          TransceiverDirection.RecvOnly,
        );
      }
      markReady();
    } catch (_) {
      _emitPeerState(peer.socketId, '$kind receive setup failed');
    }
  }

  Future<void> _handleRemoteTrack(String socketId, RTCTrackEvent event) async {
    event.track.enabled = true;
    if (event.track.kind == 'audio') {
      try {
        final stream = await _remoteAudioPlaybackStream(socketId, event.track);
        _emitRemoteStream(socketId, stream);
        return;
      } catch (_) {
        _emitPeerState(socketId, 'Remote audio track received');
      }
    }

    if (event.streams.isNotEmpty) {
      _emitRemoteStream(socketId, event.streams.first);
      return;
    }

    try {
      final stream =
          _remoteFallbackStreams[socketId] ??
          await createLocalMediaStream('rtc_enterprise_remote_$socketId');
      _remoteFallbackStreams[socketId] = stream;

      final alreadyAttached = stream.getTracks().any(
        (track) => track.id == event.track.id,
      );
      if (!alreadyAttached) {
        await stream.addTrack(event.track);
      }
      _emitRemoteStream(socketId, stream);
    } catch (_) {
      _emitPeerState(socketId, 'Remote track received');
    }
  }

  Future<MediaStream> _remoteAudioPlaybackStream(
    String socketId,
    MediaStreamTrack track,
  ) async {
    final stream =
        _remoteFallbackStreams[socketId] ??
        await createLocalMediaStream('rtc_enterprise_remote_audio_$socketId');
    _remoteFallbackStreams[socketId] = stream;

    final alreadyAttached = stream.getTracks().any(
      (existingTrack) => existingTrack.id == track.id,
    );
    if (!alreadyAttached) {
      await stream.addTrack(track);
    }
    return stream;
  }

  void _emitRemoteStream(String socketId, MediaStream stream) {
    if (_remoteStreams.isClosed) return;
    for (final track in stream.getAudioTracks()) {
      track.enabled = true;
    }
    for (final track in stream.getVideoTracks()) {
      track.enabled = true;
    }
    unawaited(_attachRemotePlaybackSink(socketId, stream));
    _remoteStreams.add(RtcRemoteStream(socketId: socketId, stream: stream));
  }

  Future<void> _attachRemotePlaybackSink(
    String socketId,
    MediaStream stream,
  ) async {
    final audioTracks = stream.getAudioTracks();
    if (_disposed || audioTracks.isEmpty) return;

    for (final track in audioTracks) {
      track.enabled = true;
    }

    try {
      var renderer = _remotePlaybackRenderers[socketId];
      if (renderer == null) {
        renderer = RTCVideoRenderer();
        await renderer.initialize();
        if (_disposed || !_peers.containsKey(socketId)) {
          await renderer.dispose();
          return;
        }
        _remotePlaybackRenderers[socketId] = renderer;
      }

      await renderer.setSrcObject(stream: stream);
      await renderer.setVolume(1.0);
      _emitPeerState(socketId, 'Remote audio playback ready');
    } catch (_) {
      _emitPeerState(socketId, 'Remote audio playback setup failed');
    }
  }

  RTCRtpTransceiver? _transceiverForKind(
    List<RTCRtpTransceiver> transceivers,
    String? kind,
  ) {
    if (kind == null) return null;
    for (final transceiver in transceivers) {
      if (_transceiverKind(transceiver) == kind) return transceiver;
    }
    return null;
  }

  String? _transceiverKind(RTCRtpTransceiver transceiver) {
    return transceiver.sender.track?.kind ?? transceiver.receiver.track?.kind;
  }

  Future<void> _setTransceiverDirection(
    RTCRtpTransceiver transceiver,
    TransceiverDirection direction,
  ) async {
    try {
      final current = await transceiver.getDirection();
      if (current == direction) return;
    } catch (_) {}
    try {
      await transceiver.setDirection(direction);
    } catch (_) {}
  }

  Future<void> _makeOffer(
    _PeerConnectionHandle peer, {
    bool force = false,
  }) async {
    if (peer.makingOffer) return;
    final signaling = _signaling;
    if (signaling == null) return;

    final state = await peer.pc.getSignalingState();
    final localDescription = await peer.pc.getLocalDescription();
    final stable =
        state == null || state == RTCSignalingState.RTCSignalingStateStable;
    if (!stable) return;
    if (!force && peer.sentInitialOffer && localDescription != null) return;

    peer.makingOffer = true;
    try {
      await _syncLocalTracks(peer);
      await _ensureReceiveTransceivers(peer, receiveVideo: _video);
      final offer = await peer.pc.createOffer(_offerConstraintsForMode());
      await peer.pc.setLocalDescription(offer);
      await signaling.emitWebRtcOffer(
        targetSocketId: peer.socketId,
        offer: offer,
      );
      peer.sentInitialOffer = true;
      _emitPeerState(peer.socketId, 'Offer sent');
    } catch (_) {
      _emitPeerState(peer.socketId, 'Offer failed');
    } finally {
      peer.makingOffer = false;
    }
  }

  Future<void> _handleOffer(WebRtcOfferSignal signal) async {
    final signaling = _signaling;
    if (signaling == null) return;
    final peer = await _ensurePeer(signal.fromSocketId);
    try {
      await _syncLocalTracks(peer);
      await _ensureReceiveTransceivers(peer, receiveVideo: _video);
      await peer.pc.setRemoteDescription(signal.offer);
      await _flushPendingCandidates(signal.fromSocketId);
      final answer = await peer.pc.createAnswer(_offerConstraintsForMode());
      await peer.pc.setLocalDescription(answer);
      await signaling.emitWebRtcAnswer(
        targetSocketId: signal.fromSocketId,
        answer: answer,
      );
      _emitPeerState(signal.fromSocketId, 'Answer sent');
    } catch (_) {
      _emitPeerState(signal.fromSocketId, 'Offer handling failed');
    }
  }

  Future<void> _handleAnswer(WebRtcAnswerSignal signal) async {
    final peer = _peers[signal.fromSocketId];
    if (peer == null) return;
    try {
      await peer.pc.setRemoteDescription(signal.answer);
      await _flushPendingCandidates(signal.fromSocketId);
      _emitPeerState(signal.fromSocketId, 'Connected');
    } catch (_) {
      _emitPeerState(signal.fromSocketId, 'Answer handling failed');
    }
  }

  Future<void> _handleIce(WebRtcIceCandidateSignal signal) async {
    final peer = await _ensurePeer(signal.fromSocketId);
    final remoteDescription = await peer.pc.getRemoteDescription();
    if (remoteDescription == null) {
      _pendingCandidates
          .putIfAbsent(signal.fromSocketId, () => <RTCIceCandidate>[])
          .add(signal.candidate);
      return;
    }

    try {
      await peer.pc.addCandidate(signal.candidate);
    } catch (_) {
      _emitPeerState(signal.fromSocketId, 'ICE add failed');
    }
  }

  Future<void> _flushPendingCandidates(String socketId) async {
    final peer = _peers[socketId];
    final candidates = _pendingCandidates.remove(socketId);
    if (peer == null || candidates == null) return;
    for (final candidate in candidates) {
      await peer.pc.addCandidate(candidate);
    }
  }

  Future<void> _closePeer(String socketId) async {
    final peer = _peers.remove(socketId);
    if (peer == null) return;
    _pendingCandidates.remove(socketId);
    await _disposeRemotePlaybackSink(socketId);
    final fallbackStream = _remoteFallbackStreams.remove(socketId);
    if (fallbackStream != null) {
      try {
        await fallbackStream.dispose();
      } catch (_) {}
    }
    try {
      await peer.pc.close();
    } catch (_) {}
    try {
      await peer.pc.dispose();
    } catch (_) {}
    if (!_remoteStreams.isClosed) {
      _remoteStreams.add(RtcRemoteStream(socketId: socketId, stream: null));
    }
    _emitPeerState(socketId, 'Closed');
  }

  bool _shouldInitiate(String remoteSocketId) {
    final localSocketId = _signaling?.socketId;
    if (localSocketId == null || localSocketId.isEmpty) return true;
    return localSocketId.compareTo(remoteSocketId) > 0;
  }

  void _emitPeerState(String socketId, String state) {
    if (_peerStates.isClosed) return;
    _peerStates.add(RtcPeerStateSnapshot(socketId: socketId, state: state));
  }

  Future<void> _cancelSubscriptions() async {
    for (final subscription in _subscriptions) {
      await subscription.cancel();
    }
    _subscriptions.clear();
  }

  String _stateLabel(Object state) {
    final value = state.toString();
    final tail = value.contains('.') ? value.split('.').last : value;
    return tail
        .replaceFirst('RTCPeerConnectionState', '')
        .replaceFirst('RTCIceConnectionState', '')
        .replaceAllMapped(RegExp(r'([a-z])([A-Z])'), (match) {
          return '${match.group(1)} ${match.group(2)}';
        })
        .trim();
  }

  static const _constraints = {
    'mandatory': {},
    'optional': [
      {'DtlsSrtpKeyAgreement': true},
    ],
  };

  Map<String, dynamic> _offerConstraintsForMode() {
    return {
      'mandatory': {'OfferToReceiveAudio': true, 'OfferToReceiveVideo': _video},
      'optional': [],
    };
  }

  Future<void> _disposeRemotePlaybackSink(String socketId) async {
    final renderer = _remotePlaybackRenderers.remove(socketId);
    if (renderer == null) return;
    try {
      renderer.srcObject = null;
      await renderer.dispose();
    } catch (_) {}
  }
}

class _PeerConnectionHandle {
  _PeerConnectionHandle({required this.socketId, required this.pc});

  final String socketId;
  final RTCPeerConnection pc;
  bool makingOffer = false;
  bool sentInitialOffer = false;
  bool audioReceiveReady = false;
  bool videoReceiveReady = false;
}

RTCSessionDescription? _sessionDescription(Object? payload) {
  if (payload is! Map) return null;
  final data = Map<String, dynamic>.from(payload);
  final sdp = data['sdp']?.toString();
  final type = data['type']?.toString();
  if (sdp == null || type == null) return null;
  return RTCSessionDescription(sdp, type);
}

RTCIceCandidate? _iceCandidate(Object? payload) {
  if (payload is! Map) return null;
  final data = Map<String, dynamic>.from(payload);
  final candidate = data['candidate']?.toString();
  if (candidate == null || candidate.isEmpty) return null;
  final rawLineIndex = data['sdpMLineIndex'];
  final sdpMLineIndex = rawLineIndex is int
      ? rawLineIndex
      : int.tryParse(rawLineIndex?.toString() ?? '');
  return RTCIceCandidate(candidate, data['sdpMid']?.toString(), sdpMLineIndex);
}

List<Map<String, dynamic>> normalizeSignalingPeers(
  Iterable<Object?> peers, {
  int? localUserId,
  String? localSocketId,
}) {
  final normalizedPeers = <Map<String, dynamic>>[];
  final localSocket = _cleanString(localSocketId);

  for (final rawPeer in peers) {
    if (rawPeer is! Map) continue;
    final raw = Map<String, dynamic>.from(rawPeer);
    final socketId = _peerSocketId(raw);
    final userId = _peerUserId(raw);

    if (socketId == null && userId == null) continue;
    if (localSocket != null && socketId == localSocket) continue;
    if (localUserId != null && userId == localUserId) continue;

    final peer = <String, dynamic>{...raw};
    if (socketId != null) peer['socketId'] = socketId;
    if (userId != null) peer['userId'] = userId;
    _putString(
      peer,
      'userName',
      raw['userName'] ?? raw['user_name'] ?? raw['name'],
    );
    _putString(peer, 'rtcMode', raw['rtcMode'] ?? raw['rtc_mode']);
    _putBool(peer, 'micEnabled', raw['micEnabled'] ?? raw['mic_enabled']);
    _putBool(
      peer,
      'cameraEnabled',
      raw['cameraEnabled'] ?? raw['camera_enabled'],
    );
    _putBool(peer, 'screenShared', raw['screenShared'] ?? raw['screen_shared']);
    normalizedPeers.add(peer);
  }

  return normalizedPeers;
}

String? _peerSocketId(Map<String, dynamic> peer) {
  return _cleanString(peer['socketId'] ?? peer['socket_id']);
}

int? _peerUserId(Map<String, dynamic> peer) {
  final value = peer['userId'] ?? peer['user_id'] ?? peer['id'];
  if (value is int) return value;
  return int.tryParse(value?.toString() ?? '');
}

Map<String, dynamic>? _payloadMap(Object? payload) {
  return payload is Map ? Map<String, dynamic>.from(payload) : null;
}

Map<String, Object?> _withoutNulls(Map<String, Object?> value) {
  return Map.fromEntries(value.entries.where((entry) => entry.value != null));
}

String _resolveSignalingUrl({
  required String apiBaseUrl,
  String? signalingUrl,
}) {
  final explicit = signalingUrl?.trim() ?? '';
  if (explicit.isNotEmpty) return explicit.replaceFirst(RegExp(r'/+$'), '');

  final normalized = apiBaseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
  final uri = Uri.tryParse(normalized);
  if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
    return normalized.replaceFirst(RegExp(r'/api$'), '');
  }

  final segments = uri.pathSegments.toList();
  if (segments.isNotEmpty && segments.last == 'api') {
    segments.removeLast();
  }
  final path = segments.isEmpty ? '' : '/${segments.join('/')}';
  return uri
      .replace(path: path, query: null, fragment: null)
      .toString()
      .replaceFirst(RegExp(r'/+$'), '');
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

bool _readBool(Object? value) {
  return _asBool(value) ?? false;
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

String? _cleanString(Object? value) {
  final text = value?.toString().trim();
  if (text == null || text.isEmpty) return null;
  return text;
}

void _putString(Map<String, dynamic> target, String key, Object? value) {
  final text = _cleanString(value);
  if (text != null) target[key] = text;
}

void _putBool(Map<String, dynamic> target, String key, Object? value) {
  final parsed = _asBool(value);
  if (parsed != null) target[key] = parsed;
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
