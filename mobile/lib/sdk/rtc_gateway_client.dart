import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

class RtcGatewayClient {
  RtcGatewayClient({
    required String gatewayOrigin,
    required String gatewayPath,
    required String clientAppId,
    required String appUserToken,
    String? deviceId,
    String platform = 'flutter',
    List<String> transports = const ['websocket'],
    Duration timeout = const Duration(seconds: 12),
    RtcGatewayTransport? transport,
  }) : _gatewayOrigin = gatewayOrigin.replaceFirst(RegExp(r'/+$'), ''),
       _gatewayPath = gatewayPath.trim().isEmpty
           ? '/api/rtc'
           : gatewayPath.trim(),
       _clientAppId = clientAppId.trim(),
       _appUserToken = appUserToken.trim(),
       _deviceId =
           deviceId ?? 'flutter-${DateTime.now().millisecondsSinceEpoch}',
       _platform = platform.trim().isEmpty ? 'flutter' : platform.trim(),
       _transports = List.unmodifiable(transports),
       _timeout = Duration(milliseconds: timeout.inMilliseconds),
       _transport = transport ?? SocketIoRtcGatewayTransport();

  factory RtcGatewayClient.fromApiUrl({
    required String apiUrl,
    required String clientAppId,
    required String appUserToken,
    String? deviceId,
    String platform = 'flutter',
    List<String> transports = const ['websocket'],
    Duration timeout = const Duration(seconds: 12),
    RtcGatewayTransport? transport,
  }) {
    final endpoint = RtcGatewayEndpoint.fromApiUrl(apiUrl);
    return RtcGatewayClient(
      gatewayOrigin: endpoint.origin,
      gatewayPath: endpoint.path,
      clientAppId: clientAppId,
      appUserToken: appUserToken,
      deviceId: deviceId,
      platform: platform,
      transports: transports,
      timeout: timeout,
      transport: transport,
    );
  }

  final String _gatewayOrigin;
  final String _gatewayPath;
  final String _clientAppId;
  final String _appUserToken;
  final String _deviceId;
  final String _platform;
  final List<String> _transports;
  final Duration _timeout;
  final RtcGatewayTransport _transport;

  final _events = StreamController<RtcGatewayEvent>.broadcast();
  final _pending = <String, _PendingCommand>{};
  StreamSubscription<RtcGatewayEvent>? _eventSubscription;
  bool _disposed = false;

  Stream<RtcGatewayEvent> get events => _events.stream;
  bool get isConnected => _transport.isConnected;
  String get gatewayOrigin => _gatewayOrigin;
  String get gatewayPath => _gatewayPath;

  Future<void> connect() async {
    _ensureNotDisposed();
    _eventSubscription ??= _transport.events.listen(_handleEvent);
    await _transport.connect(
      origin: _gatewayOrigin,
      path: _gatewayPath,
      auth: _authPayload(),
      transports: _transports,
      timeout: _timeout,
    );
  }

  Future<RtcGatewayEvent> verifyAuth() {
    return command(
      'auth.verify',
      _authPayload(),
      successTypes: const ['auth.ready'],
    );
  }

  Future<RtcGatewayEvent> syncUser(RtcGatewayUserSyncRequest request) {
    return command(
      'user.sync',
      request.toJson(),
      successTypes: const ['user.synced'],
    );
  }

  Future<RtcGatewayEvent> listRooms({
    String status = 'active',
    String privacyType = 'all',
    String roomType = 'all',
    String search = '',
    int page = 1,
    int perPage = 24,
  }) {
    return command(
      'room.list',
      {
        'status': status,
        'privacyType': privacyType,
        'roomType': roomType,
        'search': search,
        'page': page,
        'perPage': perPage,
      },
      successTypes: const ['room.listed'],
    );
  }

  Future<RtcGatewayEvent> createRoom(RtcGatewayRoomCreateRequest request) {
    return command(
      'room.create',
      request.toJson(),
      successTypes: const ['room.created'],
    );
  }

  Future<RtcGatewayEvent> getRoom(int roomId) {
    return command(
      'room.get',
      {'roomId': roomId},
      successTypes: const ['room.loaded'],
    );
  }

  Future<RtcGatewayEvent> joinRoom(RtcGatewayJoinRequest request) {
    return command(
      'room.join',
      request.toJson(),
      successTypes: const ['room.joined'],
    );
  }

  Future<RtcGatewayEvent> updateMediaState(
    RtcGatewayMediaStateRequest request,
  ) {
    return command(
      'media.state',
      request.toJson(),
      successTypes: const ['media.updated'],
    );
  }

  Future<RtcGatewayEvent> sendQualitySample(
    RtcGatewayQualitySampleRequest request,
  ) {
    return command(
      'quality.sample',
      request.toJson(),
      successTypes: const ['quality.recorded'],
    );
  }

  Future<RtcGatewayEvent> peers(int roomId) {
    return command(
      'room.peers',
      {'roomId': roomId},
      successTypes: const ['room.peers'],
    );
  }

  Future<RtcGatewayEvent> leaveRoom({
    required int roomId,
    required String externalUserId,
    String reason = 'user_leave',
  }) {
    return command(
      'room.leave',
      {'roomId': roomId, 'externalUserId': externalUserId, 'reason': reason},
      successTypes: const ['room.left'],
    );
  }

  Future<RtcGatewayEvent> endRoom({
    required int roomId,
    required String externalUserId,
    String reason = 'host_ended',
  }) {
    return command(
      'room.end',
      {'roomId': roomId, 'externalUserId': externalUserId, 'reason': reason},
      successTypes: const ['room.ended'],
    );
  }

  Future<RtcGatewayEvent> sendChat(RtcGatewayChatMessageRequest request) {
    return command(
      'chat.send',
      request.toJson(),
      successTypes: const ['chat.message'],
    );
  }

  Future<RtcGatewayEvent> command(
    String type,
    Map<String, Object?> payload, {
    required List<String> successTypes,
  }) async {
    _ensureNotDisposed();
    if (!isConnected) await connect();

    final requestId =
        '$type:${DateTime.now().microsecondsSinceEpoch}:${_pending.length}';
    final completer = Completer<RtcGatewayEvent>();
    final timer = Timer(_timeout, () {
      final pending = _pending.remove(requestId);
      pending?.completeError(
        TimeoutException('Timed out waiting for $type response.', _timeout),
      );
    });
    _pending[requestId] = _PendingCommand(
      successTypes: successTypes.toSet(),
      completer: completer,
      timer: timer,
    );

    _transport.emitCommand({
      'type': type,
      'requestId': requestId,
      'payload': payload,
    });
    return completer.future;
  }

  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    for (final pending in _pending.values) {
      pending.timer.cancel();
      pending.completeError(StateError('RTC gateway client disposed.'));
    }
    _pending.clear();
    await _eventSubscription?.cancel();
    await _transport.disconnect();
    await _events.close();
  }

  Map<String, Object?> _authPayload() => {
    'clientAppId': _clientAppId,
    'appUserToken': _appUserToken,
    'deviceId': _deviceId,
    'platform': _platform,
  };

  void _handleEvent(RtcGatewayEvent event) {
    if (!_events.isClosed) _events.add(event);
    final requestId = event.requestId;
    if (requestId == null || requestId.isEmpty) return;

    final pending = _pending[requestId];
    if (pending == null) return;

    if (event.type == 'error') {
      _pending.remove(requestId);
      pending.timer.cancel();
      pending.completeError(RtcGatewayException.fromEvent(event));
      return;
    }

    if (!pending.successTypes.contains(event.type)) return;

    _pending.remove(requestId);
    pending.timer.cancel();
    pending.complete(event);
  }

  void _ensureNotDisposed() {
    if (_disposed) throw StateError('RTC gateway client is disposed.');
  }
}

class RtcGatewayEndpoint {
  const RtcGatewayEndpoint({
    required this.apiUrl,
    required this.origin,
    required this.path,
  });

  final String apiUrl;
  final String origin;
  final String path;

  String get metadataUrl => '$origin$path';
  String get networkConfigUrl =>
      '$origin${_replacePathTail(path, 'rtc-network-config')}';

  factory RtcGatewayEndpoint.fromApiUrl(String apiUrl) {
    final normalized = _trimTrailingSlashes(apiUrl.trim());
    final uri = Uri.tryParse(normalized);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      final origin = normalized.replaceFirst(RegExp(r'/api$'), '');
      return RtcGatewayEndpoint(
        apiUrl: normalized,
        origin: origin,
        path: '/api/rtc',
      );
    }

    final origin = _trimTrailingSlashes(
      uri.replace(path: '', query: null, fragment: null).toString(),
    );
    final segments = uri.pathSegments.toList();
    final hasApiTail = segments.isNotEmpty && segments.last == 'api';
    final prefix = hasApiTail ? segments.take(segments.length - 1) : segments;
    final pathSegments = <String>[...prefix, 'api', 'rtc'];
    final path = '/${pathSegments.where((part) => part.isNotEmpty).join('/')}';

    return RtcGatewayEndpoint(apiUrl: normalized, origin: origin, path: path);
  }
}

abstract class RtcGatewayTransport {
  Stream<RtcGatewayEvent> get events;
  bool get isConnected;

  Future<void> connect({
    required String origin,
    required String path,
    required Map<String, Object?> auth,
    required List<String> transports,
    required Duration timeout,
  });

  void emitCommand(Map<String, Object?> command);
  Future<void> disconnect();
}

class SocketIoRtcGatewayTransport implements RtcGatewayTransport {
  final _events = StreamController<RtcGatewayEvent>.broadcast();
  io.Socket? _socket;

  @override
  Stream<RtcGatewayEvent> get events => _events.stream;

  @override
  bool get isConnected => _socket?.connected == true;

  @override
  Future<void> connect({
    required String origin,
    required String path,
    required Map<String, Object?> auth,
    required List<String> transports,
    required Duration timeout,
  }) async {
    if (isConnected) return;
    _socket?.dispose();

    final options = io.OptionBuilder()
        .setTransports(transports)
        .disableAutoConnect()
        .setAuth(auth)
        .build();
    options['path'] = path;
    options['reconnection'] = false;
    options['timeout'] = timeout.inMilliseconds;

    final socket = io.io(origin, options);
    _socket = socket;
    final connected = Completer<void>();
    Timer? timer;

    void completeError(Object error) {
      if (connected.isCompleted) return;
      timer?.cancel();
      connected.completeError(error);
    }

    socket.onConnect((_) {
      if (connected.isCompleted) return;
      timer?.cancel();
      connected.complete();
    });
    socket.onConnectError((error) => completeError(error ?? 'Connect error'));
    socket.onError((error) {
      if (!_events.isClosed) {
        _events.add(
          RtcGatewayEvent(
            type: 'transport.error',
            payload: {'message': error.toString()},
          ),
        );
      }
    });
    socket.on('rtc.event', (payload) {
      if (_events.isClosed) return;
      _events.add(RtcGatewayEvent.fromPayload(payload));
    });

    timer = Timer(timeout, () {
      completeError(
        TimeoutException('RTC gateway connect timed out.', timeout),
      );
    });
    socket.connect();
    return connected.future;
  }

  @override
  void emitCommand(Map<String, Object?> command) {
    final socket = _socket;
    if (socket == null || !socket.connected) {
      throw StateError('RTC gateway socket is not connected.');
    }
    socket.emit('rtc.command', command);
  }

  @override
  Future<void> disconnect() async {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    if (!_events.isClosed) await _events.close();
  }
}

class RtcGatewayEvent {
  const RtcGatewayEvent({
    required this.type,
    this.requestId,
    this.payload = const {},
    this.serverTime,
  });

  final String type;
  final String? requestId;
  final Map<String, dynamic> payload;
  final String? serverTime;

  factory RtcGatewayEvent.fromPayload(Object? payload) {
    if (payload is! Map) {
      return RtcGatewayEvent(type: 'unknown', payload: {'raw': payload});
    }
    final map = Map<String, dynamic>.from(payload);
    final data = map['payload'];
    return RtcGatewayEvent(
      type: map['type']?.toString() ?? 'unknown',
      requestId: map['requestId']?.toString(),
      payload: data is Map ? Map<String, dynamic>.from(data) : const {},
      serverTime: map['serverTime']?.toString(),
    );
  }
}

class RtcGatewayException implements Exception {
  const RtcGatewayException({
    required this.code,
    required this.message,
    this.details = const {},
  });

  final String code;
  final String message;
  final Map<String, dynamic> details;

  factory RtcGatewayException.fromEvent(RtcGatewayEvent event) {
    return RtcGatewayException(
      code: event.payload['code']?.toString() ?? 'gateway_error',
      message: event.payload['message']?.toString() ?? 'RTC gateway error.',
      details: event.payload['details'] is Map
          ? Map<String, dynamic>.from(event.payload['details'] as Map)
          : const {},
    );
  }

  @override
  String toString() => message;
}

class RtcGatewayUserSyncRequest {
  const RtcGatewayUserSyncRequest({
    required this.externalUserId,
    required this.displayName,
    this.email,
    this.phone,
    this.avatarUrl,
    this.metadata,
  });

  final String externalUserId;
  final String displayName;
  final String? email;
  final String? phone;
  final String? avatarUrl;
  final Map<String, Object?>? metadata;

  Map<String, Object?> toJson() => _withoutNulls({
    'externalUserId': externalUserId,
    'displayName': displayName,
    'email': email,
    'phone': phone,
    'avatarUrl': avatarUrl,
    'metadata': metadata,
  });
}

class RtcGatewayRoomCreateRequest {
  const RtcGatewayRoomCreateRequest({
    required this.externalUserId,
    required this.displayName,
    required this.name,
    this.description,
    this.roomType = 'audio',
    this.privacyType = 'public',
    this.password,
    this.maxMicCount = 8,
    this.chatEnabled = true,
    this.giftEnabled = false,
    this.screenShareEnabled = false,
    this.aiSecurityEnabled = false,
  });

  final String externalUserId;
  final String displayName;
  final String name;
  final String? description;
  final String roomType;
  final String privacyType;
  final String? password;
  final int maxMicCount;
  final bool chatEnabled;
  final bool giftEnabled;
  final bool screenShareEnabled;
  final bool aiSecurityEnabled;

  Map<String, Object?> toJson() => _withoutNulls({
    'externalUserId': externalUserId,
    'displayName': displayName,
    'name': name,
    'description': description,
    'roomType': roomType,
    'privacyType': privacyType,
    'password': password,
    'maxMicCount': maxMicCount,
    'chatEnabled': chatEnabled,
    'giftEnabled': giftEnabled,
    'screenShareEnabled': screenShareEnabled,
    'aiSecurityEnabled': aiSecurityEnabled,
  });
}

class RtcGatewayJoinRequest {
  const RtcGatewayJoinRequest({
    required this.roomId,
    required this.externalUserId,
    required this.displayName,
    this.avatarUrl,
    this.role = 'publisher',
    this.mediaMode = 'audio',
    this.micEnabled = true,
    this.cameraEnabled = false,
    this.screenShared = false,
    this.password,
  });

  final int roomId;
  final String externalUserId;
  final String displayName;
  final String? avatarUrl;
  final String role;
  final String mediaMode;
  final bool micEnabled;
  final bool cameraEnabled;
  final bool screenShared;
  final String? password;

  Map<String, Object?> toJson() => _withoutNulls({
    'roomId': roomId,
    'externalUserId': externalUserId,
    'displayName': displayName,
    'avatarUrl': avatarUrl,
    'role': role,
    'mediaMode': mediaMode,
    'micEnabled': micEnabled,
    'cameraEnabled': cameraEnabled,
    'screenShared': screenShared,
    'password': password,
  });
}

class RtcGatewayMediaStateRequest {
  const RtcGatewayMediaStateRequest({
    required this.roomId,
    required this.externalUserId,
    this.mediaMode = 'audio',
    required this.micEnabled,
    required this.cameraEnabled,
    required this.screenShared,
  });

  final int roomId;
  final String externalUserId;
  final String mediaMode;
  final bool micEnabled;
  final bool cameraEnabled;
  final bool screenShared;

  Map<String, Object?> toJson() => {
    'roomId': roomId,
    'externalUserId': externalUserId,
    'mediaMode': mediaMode,
    'micEnabled': micEnabled,
    'cameraEnabled': cameraEnabled,
    'screenShared': screenShared,
  };
}

class RtcGatewayQualitySampleRequest {
  const RtcGatewayQualitySampleRequest({
    required this.roomId,
    required this.externalUserId,
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

  final int roomId;
  final String externalUserId;
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
    'roomId': roomId,
    'externalUserId': externalUserId,
    'sessionId': sessionId,
    'quality': quality,
    'peerCount': peerCount,
    'measuredPeerCount': measuredPeerCount,
    'incomingKbps': incomingKbps,
    'outgoingKbps': outgoingKbps,
    'rttMs': rttMs,
    'packetLossPct': packetLossPct,
    'availableOutgoingKbps': availableOutgoingKbps,
    'localCandidateTypes': localCandidateTypes,
    'remoteCandidateTypes': remoteCandidateTypes,
    'peerStates': peerStates,
    'media': media,
  });
}

class RtcGatewayChatMessageRequest {
  RtcGatewayChatMessageRequest({
    required this.roomId,
    required this.body,
    this.type = 'text',
    String? clientMessageId,
    this.metadata,
  }) : clientMessageId =
           clientMessageId ??
           'flutter-${DateTime.now().microsecondsSinceEpoch}';

  final int roomId;
  final String clientMessageId;
  final String body;
  final String type;
  final Map<String, Object?>? metadata;

  Map<String, Object?> toJson() => _withoutNulls({
    'roomId': roomId,
    'message': _withoutNulls({
      'clientMessageId': clientMessageId,
      'type': type,
      'body': body,
      'metadata': metadata,
    }),
  });
}

class _PendingCommand {
  const _PendingCommand({
    required this.successTypes,
    required this.completer,
    required this.timer,
  });

  final Set<String> successTypes;
  final Completer<RtcGatewayEvent> completer;
  final Timer timer;

  void complete(RtcGatewayEvent event) => completer.complete(event);
  void completeError(Object error) => completer.completeError(error);
}

Map<String, Object?> _withoutNulls(Map<String, Object?> source) {
  return Map.fromEntries(source.entries.where((entry) => entry.value != null));
}

String _trimTrailingSlashes(String value) {
  return value.replaceFirst(RegExp(r'/+$'), '');
}

String _replacePathTail(String path, String tail) {
  final segments = path
      .split('/')
      .where((segment) => segment.trim().isNotEmpty)
      .toList();
  if (segments.length >= 2 && segments[segments.length - 2] == 'api') {
    segments[segments.length - 1] = tail;
  } else {
    segments
      ..add('api')
      ..add(tail);
  }
  return '/${segments.join('/')}';
}
