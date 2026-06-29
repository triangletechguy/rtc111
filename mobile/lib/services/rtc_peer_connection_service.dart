import 'dart:async';

import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../sdk/rtc_enterprise_client_sdk.dart';
import 'signaling_service.dart';

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
      ..add(
        signaling.sessionReplaced.listen((_) {
          unawaited(closeAll());
        }),
      );
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
      if (_shouldInitiate(socketId)) {
        unawaited(_makeOffer(peer));
      }
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
            .catchError((Object error) {
              _emitPeerState(socketId, 'ICE send failed');
              return <String, dynamic>{};
            }),
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
    pc.onConnectionState = (state) {
      _emitPeerState(socketId, _stateLabel(state));
    };
    pc.onIceConnectionState = (state) {
      _emitPeerState(socketId, _stateLabel(state));
    };

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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
      } catch (_) {
        // Fallback streams are best-effort cleanup.
      }
    }
    try {
      await peer.pc.close();
    } catch (_) {
      // The platform may already have closed this connection.
    }
    try {
      await peer.pc.dispose();
    } catch (_) {
      // Dispose should be best effort during room leave.
    }
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
    } catch (_) {
      // Playback sinks are auxiliary; peer cleanup should continue.
    }
  }
}

String? _peerSocketId(Map<String, dynamic> peer) {
  final text = (peer['socketId'] ?? peer['socket_id'])?.toString().trim();
  return text == null || text.isEmpty ? null : text;
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
