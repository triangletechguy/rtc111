import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:permission_handler/permission_handler.dart';

import 'rtc_gateway_client.dart';

enum RtcGatewayVoiceEventType {
  status,
  localStream,
  remoteStream,
  remoteStreamRemoved,
  peers,
  peerState,
  chat,
  joined,
  left,
  error,
}

class RtcGatewayVoiceEvent {
  const RtcGatewayVoiceEvent({
    required this.type,
    required this.message,
    this.data,
  });

  final RtcGatewayVoiceEventType type;
  final String message;
  final Object? data;
}

class RtcGatewayRemoteStream {
  const RtcGatewayRemoteStream({required this.socketId, required this.stream});

  final String socketId;
  final MediaStream stream;

  bool get hasAudio => stream.getAudioTracks().isNotEmpty;
  bool get hasVideo => stream.getVideoTracks().isNotEmpty;
}

class RtcGatewayVoiceJoinRequest {
  const RtcGatewayVoiceJoinRequest({
    required this.externalUserId,
    required this.displayName,
    required this.roomId,
    this.email,
    this.avatarUrl,
    this.role = 'publisher',
    this.mediaMode = 'audio',
    this.micEnabled = true,
    this.cameraEnabled = false,
    this.screenShared = false,
    this.password,
  });

  final String externalUserId;
  final String displayName;
  final int roomId;
  final String? email;
  final String? avatarUrl;
  final String role;
  final String mediaMode;
  final bool micEnabled;
  final bool cameraEnabled;
  final bool screenShared;
  final String? password;

  bool get video => mediaMode == 'video';
}

class RtcGatewayRoomSession {
  const RtcGatewayRoomSession({
    required this.externalUserId,
    required this.roomId,
    required this.signalingRoom,
    required this.socketId,
    required this.sessionId,
    required this.participantId,
    required this.role,
    required this.mediaMode,
    required this.micEnabled,
    required this.cameraEnabled,
    required this.screenShared,
    required this.room,
    required this.participant,
    required this.session,
    required this.network,
  });

  final String externalUserId;
  final int roomId;
  final String signalingRoom;
  final String socketId;
  final int sessionId;
  final int participantId;
  final String role;
  final String mediaMode;
  final bool micEnabled;
  final bool cameraEnabled;
  final bool screenShared;
  final Map<String, dynamic> room;
  final Map<String, dynamic> participant;
  final Map<String, dynamic> session;
  final Map<String, dynamic> network;

  String get rtcProfile {
    final policy = network['iceTransportPolicy']?.toString() ?? 'all';
    final turnConfigured = network['turnConfigured'] == true;
    return turnConfigured
        ? 'gateway_webrtc_turn_$policy'
        : 'gateway_webrtc_stun_$policy';
  }

  RtcGatewayRoomSession copyWith({
    String? mediaMode,
    bool? micEnabled,
    bool? cameraEnabled,
    bool? screenShared,
    Map<String, dynamic>? participant,
  }) {
    return RtcGatewayRoomSession(
      externalUserId: externalUserId,
      roomId: roomId,
      signalingRoom: signalingRoom,
      socketId: socketId,
      sessionId: sessionId,
      participantId: participantId,
      role: role,
      mediaMode: mediaMode ?? this.mediaMode,
      micEnabled: micEnabled ?? this.micEnabled,
      cameraEnabled: cameraEnabled ?? this.cameraEnabled,
      screenShared: screenShared ?? this.screenShared,
      room: room,
      participant: participant ?? this.participant,
      session: session,
      network: network,
    );
  }
}

class RtcGatewayMediaPermissionException implements Exception {
  const RtcGatewayMediaPermissionException(this.message);

  final String message;

  @override
  String toString() => message;
}

class RtcGatewayVoiceSession {
  RtcGatewayVoiceSession({
    required RtcGatewayClient client,
    RtcGatewayMediaService? media,
    GatewayPeerCoordinator? peerCoordinator,
  }) : _client = client,
       _media = media ?? RtcGatewayMediaService(),
       _peerCoordinator = peerCoordinator ?? GatewayPeerCoordinator(client);

  final RtcGatewayClient _client;
  final RtcGatewayMediaService _media;
  final GatewayPeerCoordinator _peerCoordinator;
  final _events = StreamController<RtcGatewayVoiceEvent>.broadcast();
  final _participants = <String, Map<String, dynamic>>{};

  StreamSubscription<RtcGatewayEvent>? _gatewaySubscription;
  StreamSubscription<RtcGatewayPeerState>? _peerStateSubscription;
  StreamSubscription<RtcGatewayRemoteStream>? _remoteStreamSubscription;
  StreamSubscription<String>? _remoteStreamRemovalSubscription;
  RtcGatewayRoomSession? _activeSession;
  MediaStream? _localStream;
  bool _disposed = false;
  bool _leaving = false;

  Stream<RtcGatewayVoiceEvent> get events => _events.stream;
  RtcGatewayRoomSession? get activeSession => _activeSession;
  MediaStream? get localStream => _localStream;
  bool get isJoined => _activeSession != null;

  Future<RtcGatewayRoomSession> joinRoom(
    RtcGatewayVoiceJoinRequest request,
  ) async {
    _ensureNotDisposed();
    _gatewaySubscription ??= _client.events.listen(_handleGatewayEvent);

    _emitStatus('Preparing RTC...');
    await _client.connect();
    await _client.verifyAuth();
    await _media.configureAudioSession();
    await _media.requestPermissions(video: request.video);

    _emitStatus(request.video ? 'Opening camera...' : 'Opening microphone...');
    final localStream = await _media.openLocalMedia(video: request.video);
    _setLocalTrackState(
      localStream,
      micEnabled: request.micEnabled,
      cameraEnabled: request.video && request.cameraEnabled,
    );
    _localStream = localStream;
    _events.add(
      RtcGatewayVoiceEvent(
        type: RtcGatewayVoiceEventType.localStream,
        message: 'Local media ready',
        data: localStream,
      ),
    );

    try {
      _emitStatus('Joining RTC room...');
      final joined = await _client.joinRoom(
        RtcGatewayJoinRequest(
          roomId: request.roomId,
          externalUserId: request.externalUserId,
          displayName: request.displayName,
          avatarUrl: request.avatarUrl,
          role: request.role,
          mediaMode: request.mediaMode,
          micEnabled: request.micEnabled,
          cameraEnabled: request.video && request.cameraEnabled,
          screenShared: request.screenShared,
          password: request.password,
        ),
      );

      final session = _sessionFromJoinedEvent(request, joined);
      _activeSession = session;
      _participants
        ..clear()
        ..addEntries(_participantEntries(joined.payload['participants']));

      await _peerCoordinator.configure(
        roomId: session.roomId,
        localSocketId: session.socketId,
        network: session.network,
      );
      await _peerCoordinator.setLocalStream(
        _localStream,
        video: session.mediaMode == 'video',
      );
      _listenToPeerCoordinator();
      await _syncPeerConnections();

      unawaited(_refreshPeers(session.roomId));
      _events.add(
        RtcGatewayVoiceEvent(
          type: RtcGatewayVoiceEventType.joined,
          message: 'Connected',
          data: session,
        ),
      );
      _emitPeers();
      return session;
    } catch (error) {
      await _closeLocalMedia();
      await _peerCoordinator.closeAll();
      rethrow;
    }
  }

  Future<void> setMicEnabled(bool enabled) async {
    _ensureNotDisposed();
    final session = _activeSession;
    if (session == null) return;

    for (final track
        in _localStream?.getAudioTracks() ?? <MediaStreamTrack>[]) {
      track.enabled = enabled;
    }

    final updated = await _client.updateMediaState(
      RtcGatewayMediaStateRequest(
        roomId: session.roomId,
        externalUserId: session.externalUserId,
        mediaMode: session.mediaMode,
        micEnabled: enabled,
        cameraEnabled: session.cameraEnabled,
        screenShared: session.screenShared,
      ),
    );
    final participant = _asMap(updated.payload['participant']);
    _activeSession = session.copyWith(
      micEnabled: enabled,
      participant: participant.isEmpty ? null : participant,
    );
  }

  Future<void> setCameraEnabled(bool enabled) async {
    _ensureNotDisposed();
    final session = _activeSession;
    if (session == null) return;

    var stream = _localStream;
    if (enabled && (stream == null || stream.getVideoTracks().isEmpty)) {
      await _media.requestPermissions(video: true);
      final nextStream = await _media.openLocalMedia(video: true);
      _setLocalTrackState(
        nextStream,
        micEnabled: session.micEnabled,
        cameraEnabled: true,
      );
      await _closeLocalMedia();
      _localStream = nextStream;
      stream = nextStream;
      _events.add(
        RtcGatewayVoiceEvent(
          type: RtcGatewayVoiceEventType.localStream,
          message: 'Local media ready',
          data: nextStream,
        ),
      );
    }

    for (final track in stream?.getVideoTracks() ?? <MediaStreamTrack>[]) {
      track.enabled = enabled;
    }

    final mediaMode = enabled ? 'video' : 'audio';
    await _peerCoordinator.setLocalStream(stream, video: enabled);
    final updated = await _client.updateMediaState(
      RtcGatewayMediaStateRequest(
        roomId: session.roomId,
        externalUserId: session.externalUserId,
        mediaMode: mediaMode,
        micEnabled: session.micEnabled,
        cameraEnabled: enabled,
        screenShared: session.screenShared,
      ),
    );
    final participant = _asMap(updated.payload['participant']);
    _activeSession = session.copyWith(
      mediaMode: mediaMode,
      cameraEnabled: enabled,
      participant: participant.isEmpty ? null : participant,
    );
  }

  Future<RtcGatewayEvent> sendMessage(
    String body, {
    String type = 'text',
    String? clientMessageId,
    Map<String, Object?>? metadata,
  }) async {
    _ensureNotDisposed();
    final session = _activeSession;
    if (session == null) {
      throw StateError('Join the room before sending chat.');
    }
    return _client.sendChat(
      RtcGatewayChatMessageRequest(
        roomId: session.roomId,
        body: body,
        type: type,
        clientMessageId: clientMessageId,
        metadata: metadata,
      ),
    );
  }

  Future<void> leaveRoom({String reason = 'user_leave'}) async {
    _ensureNotDisposed();
    await _leaveRoomInternal(reason: reason, sendLeaveCommand: true);
  }

  Future<void> dispose() async {
    if (_disposed) return;
    await _leaveRoomInternal(reason: 'dispose', sendLeaveCommand: true);
    _disposed = true;
    await _gatewaySubscription?.cancel();
    await _peerStateSubscription?.cancel();
    await _remoteStreamSubscription?.cancel();
    await _remoteStreamRemovalSubscription?.cancel();
    await _peerCoordinator.dispose();
    await _events.close();
  }

  Future<void> _refreshPeers(int roomId) async {
    try {
      final peers = await _client.peers(roomId);
      if (_activeSession?.roomId != roomId) return;
      _participants
        ..clear()
        ..addEntries(_participantEntries(peers.payload['participants']));
      _emitPeers();
      await _syncPeerConnections();
    } catch (error) {
      _emitPeerState('Peer refresh failed');
    }
  }

  Future<void> _leaveRoomInternal({
    required String reason,
    required bool sendLeaveCommand,
  }) async {
    if (_leaving) return;
    _leaving = true;

    final session = _activeSession;
    _activeSession = null;
    _participants.clear();

    try {
      await _peerCoordinator.closeAll();
      await _closeLocalMedia();
      if (sendLeaveCommand && session != null) {
        await _client
            .leaveRoom(
              roomId: session.roomId,
              externalUserId: session.externalUserId,
              reason: reason,
            )
            .catchError((Object error) {
              _emitError(error);
              return RtcGatewayEvent(
                type: 'room.left',
                payload: {'roomId': session.roomId},
              );
            });
      }
      _events.add(
        const RtcGatewayVoiceEvent(
          type: RtcGatewayVoiceEventType.left,
          message: 'Disconnected',
        ),
      );
    } finally {
      _leaving = false;
    }
  }

  Future<void> _closeLocalMedia() async {
    final stream = _localStream;
    _localStream = null;
    if (stream == null) return;

    for (final track in stream.getTracks()) {
      try {
        await track.stop();
      } catch (_) {}
    }
    try {
      await stream.dispose();
    } catch (_) {}
  }

  void _handleGatewayEvent(RtcGatewayEvent event) {
    if (_disposed) return;

    if (event.type == 'error' || event.type == 'transport.error') {
      _emitError(RtcGatewayException.fromEvent(event));
      return;
    }

    final roomId = _readInt(
      event.payload['roomId'] ?? event.payload['room_id'],
    );
    final activeRoomId = _activeSession?.roomId;
    if (roomId > 0 && activeRoomId != null && roomId != activeRoomId) return;

    switch (event.type) {
      case 'participant.joined':
        _upsertParticipant(event.payload['participant']);
        break;
      case 'participant.updated':
        _upsertParticipant(event.payload['participant']);
        break;
      case 'participant.left':
        _removeParticipant(event.payload);
        break;
      case 'room.peers':
        _replaceParticipants(event.payload['participants']);
        break;
      case 'chat.message':
        _events.add(
          RtcGatewayVoiceEvent(
            type: RtcGatewayVoiceEventType.chat,
            message: 'Chat message',
            data: event.payload,
          ),
        );
        break;
      case 'room.sessionReplaced':
        unawaited(
          _leaveRoomInternal(
            reason: 'duplicate_user_socket',
            sendLeaveCommand: false,
          ),
        );
        _emitError(
          StateError('This user joined the room from another device.'),
        );
        break;
      case 'session.ended':
        unawaited(
          _leaveRoomInternal(reason: 'room_ended', sendLeaveCommand: false),
        );
        break;
      case 'webrtc.offer':
        unawaited(_handleOffer(event.payload));
        break;
      case 'webrtc.answer':
        unawaited(_handleAnswer(event.payload));
        break;
      case 'webrtc.ice':
        unawaited(_handleIce(event.payload));
        break;
    }
  }

  Future<void> _handleOffer(Map<String, dynamic> payload) async {
    final fromSocketId = payload['fromSocketId']?.toString() ?? '';
    final offer = _sessionDescription(payload['offer']);
    if (fromSocketId.isEmpty || offer == null) return;
    await _peerCoordinator.handleOffer(
      fromSocketId: fromSocketId,
      offer: offer,
    );
  }

  Future<void> _handleAnswer(Map<String, dynamic> payload) async {
    final fromSocketId = payload['fromSocketId']?.toString() ?? '';
    final answer = _sessionDescription(payload['answer']);
    if (fromSocketId.isEmpty || answer == null) return;
    await _peerCoordinator.handleAnswer(
      fromSocketId: fromSocketId,
      answer: answer,
    );
  }

  Future<void> _handleIce(Map<String, dynamic> payload) async {
    final fromSocketId = payload['fromSocketId']?.toString() ?? '';
    final candidate = _iceCandidate(payload['candidate']);
    if (fromSocketId.isEmpty || candidate == null) return;
    await _peerCoordinator.handleIce(
      fromSocketId: fromSocketId,
      candidate: candidate,
    );
  }

  void _upsertParticipant(Object? value) {
    final participant = _asMap(value);
    final key = _participantKey(participant);
    if (key == null || key == _activeSession?.socketId) return;
    _participants[key] = participant;
    _emitPeers();
    unawaited(_syncPeerConnections());
  }

  void _replaceParticipants(Object? value) {
    _participants
      ..clear()
      ..addEntries(_participantEntries(value));
    _emitPeers();
    unawaited(_syncPeerConnections());
  }

  void _removeParticipant(Map<String, dynamic> payload) {
    final socketId = payload['socketId']?.toString();
    final externalUserId = payload['externalUserId']?.toString();
    if (socketId != null && socketId.isNotEmpty) {
      _participants.remove(socketId);
    } else if (externalUserId != null && externalUserId.isNotEmpty) {
      _participants.removeWhere(
        (_, participant) =>
            participant['externalUserId']?.toString() == externalUserId,
      );
    }
    _emitPeers();
    unawaited(_syncPeerConnections());
  }

  Iterable<MapEntry<String, Map<String, dynamic>>> _participantEntries(
    Object? value,
  ) sync* {
    if (value is! List) return;
    for (final raw in value) {
      final participant = _asMap(raw);
      final key = _participantKey(participant);
      if (key == null || key == _activeSession?.socketId) continue;
      yield MapEntry(key, participant);
    }
  }

  String? _participantKey(Map<String, dynamic> participant) {
    final socketId = participant['socketId']?.toString().trim() ?? '';
    if (socketId.isNotEmpty) return socketId;
    final externalUserId =
        participant['externalUserId']?.toString().trim() ?? '';
    return externalUserId.isEmpty ? null : externalUserId;
  }

  Future<void> _syncPeerConnections() {
    return _peerCoordinator.syncPeers(
      _participants.values.toList(growable: false),
    );
  }

  void _emitPeers() {
    _events.add(
      RtcGatewayVoiceEvent(
        type: RtcGatewayVoiceEventType.peers,
        message: 'Peers updated',
        data: _participants.values.toList(growable: false),
      ),
    );
  }

  void _listenToPeerCoordinator() {
    _peerStateSubscription ??= _peerCoordinator.peerStates.listen((state) {
      if (_events.isClosed) return;
      _events.add(
        RtcGatewayVoiceEvent(
          type: RtcGatewayVoiceEventType.peerState,
          message: state.state,
          data: state,
        ),
      );
    });
    _remoteStreamSubscription ??= _peerCoordinator.remoteStreams.listen((
      stream,
    ) {
      if (_events.isClosed) return;
      _events.add(
        RtcGatewayVoiceEvent(
          type: RtcGatewayVoiceEventType.remoteStream,
          message: 'Remote stream ready',
          data: stream,
        ),
      );
    });
    _remoteStreamRemovalSubscription ??= _peerCoordinator.remoteStreamRemovals
        .listen((socketId) {
          if (_events.isClosed) return;
          _events.add(
            RtcGatewayVoiceEvent(
              type: RtcGatewayVoiceEventType.remoteStreamRemoved,
              message: 'Remote stream removed',
              data: socketId,
            ),
          );
        });
  }

  void _emitStatus(String message) {
    if (_events.isClosed) return;
    _events.add(
      RtcGatewayVoiceEvent(
        type: RtcGatewayVoiceEventType.status,
        message: message,
      ),
    );
  }

  void _emitPeerState(String message) {
    if (_events.isClosed) return;
    _events.add(
      RtcGatewayVoiceEvent(
        type: RtcGatewayVoiceEventType.peerState,
        message: message,
      ),
    );
  }

  void _emitError(Object error) {
    if (_events.isClosed) return;
    _events.add(
      RtcGatewayVoiceEvent(
        type: RtcGatewayVoiceEventType.error,
        message: error.toString(),
        data: error,
      ),
    );
  }

  RtcGatewayRoomSession _sessionFromJoinedEvent(
    RtcGatewayVoiceJoinRequest request,
    RtcGatewayEvent event,
  ) {
    final room = _asMap(event.payload['room']);
    final participant = _asMap(event.payload['participant']);
    final session = _asMap(event.payload['session']);
    final media = _asMap(event.payload['media']);
    final network = _asMap(event.payload['network']);
    final roomId = _readInt(room['id'] ?? event.payload['roomId']);
    final sessionId = _readInt(session['id']);
    final participantId = _readInt(participant['id']);
    final socketId = participant['socketId']?.toString() ?? '';

    if (roomId <= 0) throw StateError('Gateway did not return room.id.');
    if (socketId.isEmpty) {
      throw StateError('Gateway did not return this participant socket id.');
    }

    return RtcGatewayRoomSession(
      externalUserId: request.externalUserId,
      roomId: roomId,
      signalingRoom: room['signalingRoom']?.toString() ?? '',
      socketId: socketId,
      sessionId: sessionId,
      participantId: participantId,
      role: participant['role']?.toString() ?? request.role,
      mediaMode: media['mode']?.toString() ?? request.mediaMode,
      micEnabled: media['micEnabled'] == true,
      cameraEnabled: media['cameraEnabled'] == true,
      screenShared: media['screenShared'] == true,
      room: room,
      participant: participant,
      session: session,
      network: network,
    );
  }

  void _setLocalTrackState(
    MediaStream stream, {
    required bool micEnabled,
    required bool cameraEnabled,
  }) {
    for (final track in stream.getAudioTracks()) {
      track.enabled = micEnabled;
    }
    for (final track in stream.getVideoTracks()) {
      track.enabled = cameraEnabled;
    }
  }

  void _ensureNotDisposed() {
    if (_disposed) throw StateError('RTC gateway voice session is disposed.');
  }
}

class RtcGatewayMediaService {
  Future<void> configureAudioSession() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    try {
      await Helper.setAndroidAudioConfiguration(
        AndroidAudioConfiguration.communication,
      );
      await Helper.setSpeakerphoneOnButPreferBluetooth();
    } catch (_) {}
  }

  Future<void> requestPermissions({required bool video}) async {
    final permissions = <Permission>[Permission.microphone];
    if (video) permissions.add(Permission.camera);

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
        'audio': {
          'echoCancellation': true,
          'noiseSuppression': true,
          'autoGainControl': true,
        },
        'video': video
            ? {
                'facingMode': 'user',
                'width': {'ideal': 1280},
                'height': {'ideal': 720},
              }
            : false,
      });
    } catch (_) {
      throw RtcGatewayMediaPermissionException(
        video
            ? 'Could not start microphone and camera. Check app permissions and try again.'
            : 'Could not start microphone. Check app permissions and try again.',
      );
    }
  }

  void _requireGranted(PermissionStatus? status, String message) {
    if (status?.isGranted ?? false) return;
    throw RtcGatewayMediaPermissionException(message);
  }
}

class GatewayPeerCoordinator {
  GatewayPeerCoordinator(this._client);

  final RtcGatewayClient _client;
  final _peerStates = StreamController<RtcGatewayPeerState>.broadcast();
  final _remoteStreams = StreamController<RtcGatewayRemoteStream>.broadcast();
  final _remoteStreamRemovals = StreamController<String>.broadcast();
  final _peers = <String, _GatewayPeerHandle>{};
  final _pendingCandidates = <String, List<RTCIceCandidate>>{};
  final _remoteFallbackStreams = <String, MediaStream>{};
  final _remotePlaybackRenderers = <String, RTCVideoRenderer>{};

  Map<String, Object?> _configuration = _fallbackPeerConfiguration;
  MediaStream? _localStream;
  int? _roomId;
  String? _localSocketId;
  bool _video = false;
  bool _disposed = false;

  Stream<RtcGatewayPeerState> get peerStates => _peerStates.stream;
  Stream<RtcGatewayRemoteStream> get remoteStreams => _remoteStreams.stream;
  Stream<String> get remoteStreamRemovals => _remoteStreamRemovals.stream;

  Future<void> configure({
    required int roomId,
    required String localSocketId,
    required Map<String, dynamic> network,
  }) async {
    if (_disposed) return;
    _roomId = roomId;
    _localSocketId = localSocketId;
    _configuration = _peerConfigurationFromNetwork(network);
  }

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

  Future<void> syncPeers(List<Map<String, dynamic>> participants) async {
    if (_disposed) return;
    final localSocketId = _localSocketId;
    final nextSocketIds = participants
        .map(_socketIdForParticipant)
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

  Future<void> handleOffer({
    required String fromSocketId,
    required RTCSessionDescription offer,
  }) async {
    if (_disposed) return;
    final peer = await _ensurePeer(fromSocketId);
    try {
      await _syncLocalTracks(peer);
      await _ensureReceiveTransceivers(peer, receiveVideo: _video);
      await peer.pc.setRemoteDescription(offer);
      await _flushPendingCandidates(fromSocketId);
      final answer = await peer.pc.createAnswer(_offerConstraintsForMode());
      await peer.pc.setLocalDescription(answer);
      await _sendPeerSignal(
        'webrtc.answer',
        targetSocketId: fromSocketId,
        signalKey: 'answer',
        value: answer.toMap(),
      );
      _emitPeerState(fromSocketId, 'Answer sent');
    } catch (_) {
      _emitPeerState(fromSocketId, 'Offer handling failed');
    }
  }

  Future<void> handleAnswer({
    required String fromSocketId,
    required RTCSessionDescription answer,
  }) async {
    final peer = _peers[fromSocketId];
    if (_disposed || peer == null) return;
    try {
      await peer.pc.setRemoteDescription(answer);
      await _flushPendingCandidates(fromSocketId);
      _emitPeerState(fromSocketId, 'Connected');
    } catch (_) {
      _emitPeerState(fromSocketId, 'Answer handling failed');
    }
  }

  Future<void> handleIce({
    required String fromSocketId,
    required RTCIceCandidate candidate,
  }) async {
    if (_disposed) return;
    final peer = await _ensurePeer(fromSocketId);
    final remoteDescription = await peer.pc.getRemoteDescription();
    if (remoteDescription == null) {
      _pendingCandidates
          .putIfAbsent(fromSocketId, () => <RTCIceCandidate>[])
          .add(candidate);
      return;
    }

    try {
      await peer.pc.addCandidate(candidate);
    } catch (_) {
      _emitPeerState(fromSocketId, 'ICE add failed');
    }
  }

  Future<void> closeAll() async {
    final socketIds = _peers.keys.toList();
    for (final socketId in socketIds) {
      await _closePeer(socketId);
    }
    _pendingCandidates.clear();
  }

  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    await closeAll();
    await _peerStates.close();
    await _remoteStreams.close();
    await _remoteStreamRemovals.close();
  }

  Future<_GatewayPeerHandle> _ensurePeer(String socketId) async {
    final existing = _peers[socketId];
    if (existing != null) return existing;

    final pc = await createPeerConnection(_configuration, _constraints);
    final peer = _GatewayPeerHandle(socketId: socketId, pc: pc);
    _peers[socketId] = peer;

    pc.onIceCandidate = (candidate) {
      if (candidate.candidate == null || candidate.candidate!.isEmpty) return;
      unawaited(
        _sendPeerSignal(
          'webrtc.ice',
          targetSocketId: socketId,
          signalKey: 'candidate',
          value: candidate.toMap(),
        ),
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

  Future<void> _syncLocalTracks(_GatewayPeerHandle peer) async {
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
    _GatewayPeerHandle peer,
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
    _GatewayPeerHandle peer, {
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
    _GatewayPeerHandle peer, {
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
          await createLocalMediaStream('rtc_gateway_remote_$socketId');
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
        await createLocalMediaStream('rtc_gateway_remote_audio_$socketId');
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
    for (final track in stream.getAudioTracks()) {
      track.enabled = true;
    }
    if (!_remoteStreams.isClosed) {
      _remoteStreams.add(
        RtcGatewayRemoteStream(socketId: socketId, stream: stream),
      );
    }
    unawaited(_attachRemotePlaybackSink(socketId, stream));
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

  Future<void> _makeOffer(_GatewayPeerHandle peer, {bool force = false}) async {
    if (peer.makingOffer) return;

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
      await _sendPeerSignal(
        'webrtc.offer',
        targetSocketId: peer.socketId,
        signalKey: 'offer',
        value: offer.toMap(),
      );
      peer.sentInitialOffer = true;
      _emitPeerState(peer.socketId, 'Offer sent');
    } catch (_) {
      _emitPeerState(peer.socketId, 'Offer failed');
    } finally {
      peer.makingOffer = false;
    }
  }

  Future<void> _sendPeerSignal(
    String type, {
    required String targetSocketId,
    required String signalKey,
    required Object? value,
  }) async {
    final roomId = _roomId;
    if (roomId == null) return;
    await _client
        .command(
          type,
          {
            'roomId': roomId,
            'targetSocketId': targetSocketId,
            signalKey: value,
          },
          successTypes: ['$type.sent'],
        )
        .catchError((Object _) {
          _emitPeerState(targetSocketId, '$type failed');
          return RtcGatewayEvent(type: '$type.sent');
        });
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
    if (!_remoteStreamRemovals.isClosed) {
      _remoteStreamRemovals.add(socketId);
    }
    _emitPeerState(socketId, 'Closed');
  }

  Future<void> _disposeRemotePlaybackSink(String socketId) async {
    final renderer = _remotePlaybackRenderers.remove(socketId);
    if (renderer == null) return;
    try {
      renderer.srcObject = null;
      await renderer.dispose();
    } catch (_) {}
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

  bool _shouldInitiate(String remoteSocketId) {
    final localSocketId = _localSocketId;
    if (localSocketId == null || localSocketId.isEmpty) return true;
    return localSocketId.compareTo(remoteSocketId) > 0;
  }

  void _emitPeerState(String socketId, String state) {
    if (_peerStates.isClosed) return;
    _peerStates.add(RtcGatewayPeerState(socketId: socketId, state: state));
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

  Map<String, Object> _offerConstraintsForMode() {
    return {
      'mandatory': {'OfferToReceiveAudio': true, 'OfferToReceiveVideo': _video},
      'optional': <Object>[],
    };
  }
}

class RtcGatewayPeerState {
  const RtcGatewayPeerState({required this.socketId, required this.state});

  final String socketId;
  final String state;
}

class _GatewayPeerHandle {
  _GatewayPeerHandle({required this.socketId, required this.pc});

  final String socketId;
  final RTCPeerConnection pc;
  bool makingOffer = false;
  bool sentInitialOffer = false;
  bool audioReceiveReady = false;
  bool videoReceiveReady = false;
}

String? _socketIdForParticipant(Map<String, dynamic> participant) {
  final socketId = participant['socketId']?.toString().trim() ?? '';
  return socketId.isEmpty ? null : socketId;
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

Map<String, dynamic> _asMap(Object? value) {
  if (value is Map) return Map<String, dynamic>.from(value);
  return const <String, dynamic>{};
}

int _readInt(Object? value) {
  if (value is int) return value;
  return int.tryParse(value?.toString() ?? '') ?? 0;
}

Map<String, Object?> _peerConfigurationFromNetwork(
  Map<String, dynamic> network,
) {
  final rawIceServers = network['iceServers'];
  final iceServers = rawIceServers is List && rawIceServers.isNotEmpty
      ? rawIceServers.map(_asMap).where((server) => server.isNotEmpty).toList()
      : _fallbackPeerConfiguration['iceServers'];
  final policy = network['iceTransportPolicy']?.toString();
  return {
    'iceServers': iceServers,
    'iceTransportPolicy': policy == 'relay' ? 'relay' : 'all',
    'sdpSemantics': 'unified-plan',
  };
}

const _fallbackPeerConfiguration = <String, Object?>{
  'iceServers': [
    {
      'urls': ['stun:stun.l.google.com:19302'],
    },
  ],
  'iceTransportPolicy': 'all',
  'sdpSemantics': 'unified-plan',
};
