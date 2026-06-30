import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/app_user.dart';
import '../models/room.dart';
import '../services/api_client.dart';
import '../services/funint_native_rtc_service.dart';
import '../ui/rtc_assets.dart';
import '../ui/rtc_mobile_ui.dart';

class LiveRoomScreen extends StatefulWidget {
  const LiveRoomScreen({
    super.key,
    required this.api,
    required this.user,
    required this.room,
    this.autoConnect = false,
  });

  final ApiClient api;
  final AppUser user;
  final Room room;
  final bool autoConnect;

  @override
  State<LiveRoomScreen> createState() => _LiveRoomScreenState();
}

class _LiveRoomScreenState extends State<LiveRoomScreen> {
  final _chatComposer = TextEditingController();
  final _youtubeVideoInput = TextEditingController();
  final _youtubeTitleInput = TextEditingController();
  final _nativeRtc = const FunintNativeRtcService();
  final _messages = <_UiRoomMessage>[
    _UiRoomMessage(
      author: 'Maya',
      body: 'Room cards and host controls are looking good.',
      mine: false,
    ),
    _UiRoomMessage(author: 'You', body: 'Room controls are ready.', mine: true),
  ];

  bool _joined = false;
  bool _micOn = true;
  bool _cameraOn = false;
  bool _screenShare = false;
  bool _noiseCancellationOn = false;
  bool _beautyOn = false;
  bool _faceDetectOn = false;
  bool _chatOpen = true;
  bool _nativeBusy = false;
  bool _youtubeBusy = false;
  bool _youtubePlaying = false;
  int _videoViewRevision = 0;
  String _nativeStatus = 'Checking live connection...';
  String _stageMode = 'Audience';
  String _aiFilter = 'none';
  String _videoFilter = 'none';
  String _youtubeVideoId = '';
  String _youtubeTitle = '';
  double _youtubeVolume = 0.85;
  double _youtubePositionSeconds = 0;
  StreamSubscription<FunintNativeRtcEvent>? _nativeEvents;

  @override
  void initState() {
    super.initState();
    _stageMode = widget.room.ownerId == widget.user.id ? 'Host' : 'Audience';
    _nativeEvents = _nativeRtc.events.listen(
      _handleNativeEvent,
      onError: (Object error) {
        if (!mounted) return;
        setState(() => _nativeStatus = error.toString());
      },
    );
    unawaited(_checkNativeIntegration());
    if (widget.autoConnect) {
      unawaited(_startNativeSession());
    }
  }

  @override
  void dispose() {
    _nativeEvents?.cancel();
    unawaited(_nativeRtc.leaveSession());
    _chatComposer.dispose();
    _youtubeVideoInput.dispose();
    _youtubeTitleInput.dispose();
    super.dispose();
  }

  Future<void> _checkNativeIntegration() async {
    final status = await _nativeRtc.integrationStatus();
    if (!mounted) return;

    setState(() {
      _nativeStatus = status.available
          ? 'Live connection ready.'
          : status.message;
    });
  }

  Future<void> _toggleJoined() async {
    if (_nativeBusy) return;

    if (_joined) {
      await _leaveNativeSession();
      return;
    }

    await _startNativeSession();
  }

  Future<void> _startNativeSession() async {
    setState(() {
      _nativeBusy = true;
      _nativeStatus = 'Opening room...';
    });

    try {
      final rtcMode = _rtcModeForRoom(widget.room);
      final roomId = _rtcRoomIdForRoom(widget.room);
      final permissions = _rtcPermissionsForRoom(widget.room);
      RtcTokenResult? rtcToken;

      setState(() => _nativeStatus = 'Preparing secure access...');
      try {
        rtcToken = await widget.api.issueRtcToken(
          appId: FunintNativeRtcService.defaultAppId,
          appKey: FunintNativeRtcService.defaultAppKey,
          roomId: roomId,
          userId: 'mobile-${widget.user.id}',
          rtcMode: rtcMode,
          permissions: permissions,
        );
      } on Object {
        if (FunintNativeRtcService.defaultAccessToken.trim().isEmpty) {
          rethrow;
        }
        if (mounted) {
          setState(
            () => _nativeStatus =
                'Secure access service is unavailable. Trying saved access.',
          );
        }
      }

      if (!mounted) return;
      setState(() => _nativeStatus = 'Opening room...');
      final result = await _nativeRtc.startSession(
        accessToken: rtcToken?.accessToken,
        appId: rtcToken?.appId,
        appKey: rtcToken?.appKey,
        roomId: rtcToken?.roomId.isNotEmpty == true ? rtcToken!.roomId : roomId,
        rtcMode: rtcToken?.rtcMode.isNotEmpty == true
            ? rtcToken!.rtcMode
            : rtcMode,
      );
      if (!mounted) return;

      setState(() {
        _joined = result.started;
        _videoViewRevision++;
        _nativeStatus = result.started
            ? 'Connected to room ${result.roomId}.'
            : 'Live connection did not start.';
      });
      if (result.started) {
        await _waitForNativePreview();
        await _applyRtcSettingsAfterJoin();
      }
    } on StateError catch (error) {
      if (!mounted) return;
      setState(() {
        _joined = false;
        _nativeStatus = error.message;
      });
    } on PlatformException catch (error) {
      if (!mounted) return;
      setState(() {
        _joined = false;
        _nativeStatus = error.message ?? error.code;
      });
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _joined = false;
        _nativeStatus = error.toString();
      });
    } finally {
      if (mounted) {
        setState(() => _nativeBusy = false);
      }
    }
  }

  Future<void> _leaveNativeSession() async {
    setState(() {
      _nativeBusy = true;
      _nativeStatus = 'Leaving room...';
    });

    try {
      await _nativeRtc.leaveSession();
      if (!mounted) return;
      setState(() {
        _joined = false;
        _screenShare = false;
        _nativeStatus = 'You left the room.';
      });
    } on Object catch (error) {
      if (!mounted) return;
      setState(() => _nativeStatus = error.toString());
    } finally {
      if (mounted) {
        setState(() => _nativeBusy = false);
      }
    }
  }

  Future<void> _setMicEnabled(bool enabled) async {
    if (enabled && !(await _ensureNativeSession())) return;
    setState(() => _micOn = enabled);
    if (!_joined) return;

    try {
      await _nativeRtc.setMicEnabled(enabled);
    } on Object catch (error) {
      if (mounted) setState(() => _nativeStatus = error.toString());
    }
  }

  Future<void> _setCameraEnabled(bool enabled) async {
    if (enabled && !(await _ensureNativeSession())) return;
    setState(() {
      _cameraOn = enabled;
      _videoViewRevision++;
    });
    if (!_joined) return;

    try {
      if (enabled) await _waitForNativePreview();
      await _nativeRtc.setLocalVideoEnabled(enabled);
      if (enabled) await _nativeRtc.refreshVideoRenderers();
    } on Object catch (error) {
      if (mounted) setState(() => _nativeStatus = error.toString());
    }
  }

  Future<void> _setScreenShareEnabled(bool enabled) async {
    if (enabled && !(await _ensureNativeSession())) return;
    if (!_joined) {
      setState(() {
        _screenShare = enabled;
        _nativeStatus = 'Screen share will start after you join.';
      });
      return;
    }

    try {
      final changed = enabled
          ? await _nativeRtc.startScreenShare()
          : await _nativeRtc.stopScreenShare();
      if (!mounted) return;
      setState(() {
        _screenShare = enabled && changed;
        _nativeStatus = _screenShare
            ? 'Screen share active.'
            : 'Screen share off.';
      });
    } on PlatformException catch (error) {
      if (mounted) {
        setState(() {
          _screenShare = false;
          _nativeStatus = error.message ?? error.code;
        });
      }
    } on Object catch (error) {
      if (mounted) {
        setState(() {
          _screenShare = false;
          _nativeStatus = error.toString();
        });
      }
    }
  }

  Future<void> _setNoiseCancellationEnabled(bool enabled) async {
    if (enabled && !(await _ensureNativeSession())) return;
    setState(() => _noiseCancellationOn = enabled);
    if (!_joined) return;

    try {
      await _nativeRtc.setNoiseCancellationEnabled(enabled);
    } on Object catch (error) {
      if (mounted) setState(() => _nativeStatus = error.toString());
    }
  }

  Future<void> _setBeautyEnabled(bool enabled) async {
    if (enabled && !(await _ensureCameraForVideoEffect())) return;
    setState(() => _beautyOn = enabled);
    if (!_joined) return;

    try {
      await _nativeRtc.setBeautyEnabled(enabled, level: enabled ? 62 : 0);
      if (enabled) {
        await _nativeRtc.setBeautyLevels(
          beautyLevel: 62,
          smoothingLevel: 54,
          whiteningLevel: 38,
          eyeLevel: 18,
          faceSlimLevel: 16,
        );
      }
    } on Object catch (error) {
      if (mounted) setState(() => _nativeStatus = error.toString());
    }
  }

  Future<void> _setFaceDetectEnabled(bool enabled) async {
    if (enabled && !(await _ensureCameraForVideoEffect())) return;
    setState(() => _faceDetectOn = enabled);
    if (!_joined) return;

    try {
      await _nativeRtc.setFaceDetectEnabled(enabled);
    } on Object catch (error) {
      if (mounted) setState(() => _nativeStatus = error.toString());
    }
  }

  Future<void> _setAiFilter(String filter) async {
    if (filter != 'none' && !(await _ensureCameraForVideoEffect())) return;
    setState(() => _aiFilter = filter);
    if (!_joined) return;

    try {
      await _nativeRtc.setAiFilter(filter == 'none' ? '' : filter);
    } on Object catch (error) {
      if (mounted) setState(() => _nativeStatus = error.toString());
    }
  }

  Future<void> _setVideoFilter(String filter) async {
    if (filter != 'none' && !(await _ensureCameraForVideoEffect())) return;
    setState(() => _videoFilter = filter);
    if (!_joined) return;

    try {
      await _nativeRtc.setVideoFilter(filter == 'none' ? '' : filter);
    } on Object catch (error) {
      if (mounted) setState(() => _nativeStatus = error.toString());
    }
  }

  Future<void> _clearVideoEffects() async {
    setState(() {
      _beautyOn = false;
      _faceDetectOn = false;
      _aiFilter = 'none';
      _videoFilter = 'none';
    });
    if (!_joined) return;

    try {
      await _nativeRtc.clearVideoEffects();
    } on Object catch (error) {
      if (mounted) setState(() => _nativeStatus = error.toString());
    }
  }

  Future<void> _loadYoutubeVideo() async {
    final videoId = _extractYoutubeVideoId(_youtubeVideoInput.text);
    if (videoId == null) {
      setState(() {
        _nativeStatus = 'Enter a valid YouTube video link or ID.';
      });
      return;
    }

    final title = _youtubeTitleInput.text.trim().isEmpty
        ? 'YouTube video'
        : _youtubeTitleInput.text.trim();

    if (!(await _ensureNativeSession())) return;
    if (!mounted) return;

    setState(() {
      _youtubeBusy = true;
      _nativeStatus = 'Loading YouTube video...';
    });

    try {
      await _nativeRtc.setYoutubeVideo(
        videoId: videoId,
        title: title,
        volume: _youtubeVolume,
      );
      if (!mounted) return;
      setState(() {
        _youtubeVideoId = videoId;
        _youtubeTitle = title;
        _youtubePlaying = false;
        _nativeStatus = 'YouTube video ready.';
      });
    } on Object catch (error) {
      if (mounted) setState(() => _nativeStatus = error.toString());
    } finally {
      if (mounted) setState(() => _youtubeBusy = false);
    }
  }

  Future<void> _playYoutubeVideo() async {
    if (_youtubeVideoId.isEmpty) {
      await _loadYoutubeVideo();
      if (_youtubeVideoId.isEmpty) return;
    } else if (!(await _ensureNativeSession())) {
      return;
    }
    if (!mounted) return;

    setState(() => _youtubeBusy = true);
    try {
      await _nativeRtc.playYoutube(positionSeconds: _youtubePositionSeconds);
      if (!mounted) return;
      setState(() {
        _youtubePlaying = true;
        _nativeStatus = 'YouTube playing.';
      });
    } on Object catch (error) {
      if (mounted) setState(() => _nativeStatus = error.toString());
    } finally {
      if (mounted) setState(() => _youtubeBusy = false);
    }
  }

  Future<void> _pauseYoutubeVideo() async {
    if (_youtubeVideoId.isEmpty || !(await _ensureNativeSession())) return;
    if (!mounted) return;

    setState(() => _youtubeBusy = true);
    try {
      await _nativeRtc.pauseYoutube(positionSeconds: _youtubePositionSeconds);
      if (!mounted) return;
      setState(() {
        _youtubePlaying = false;
        _nativeStatus = 'YouTube paused.';
      });
    } on Object catch (error) {
      if (mounted) setState(() => _nativeStatus = error.toString());
    } finally {
      if (mounted) setState(() => _youtubeBusy = false);
    }
  }

  Future<void> _stopYoutubeVideo() async {
    if (_youtubeVideoId.isEmpty || !(await _ensureNativeSession())) return;
    if (!mounted) return;

    setState(() => _youtubeBusy = true);
    try {
      await _nativeRtc.stopYoutube(positionSeconds: _youtubePositionSeconds);
      if (!mounted) return;
      setState(() {
        _youtubePlaying = false;
        _youtubePositionSeconds = 0;
        _nativeStatus = 'YouTube stopped.';
      });
    } on Object catch (error) {
      if (mounted) setState(() => _nativeStatus = error.toString());
    } finally {
      if (mounted) setState(() => _youtubeBusy = false);
    }
  }

  Future<void> _seekYoutubeBy(double offsetSeconds) async {
    if (_youtubeVideoId.isEmpty || !(await _ensureNativeSession())) return;
    final nextPosition = (_youtubePositionSeconds + offsetSeconds).clamp(
      0,
      double.infinity,
    );
    if (!mounted) return;

    setState(() => _youtubePositionSeconds = nextPosition.toDouble());
    try {
      await _nativeRtc.seekYoutube(_youtubePositionSeconds);
      if (mounted) setState(() => _nativeStatus = 'YouTube position updated.');
    } on Object catch (error) {
      if (mounted) setState(() => _nativeStatus = error.toString());
    }
  }

  void _setYoutubeVolume(double value) {
    setState(() => _youtubeVolume = value.clamp(0, 1).toDouble());
  }

  Future<void> _syncYoutubeVolume(double value) async {
    _setYoutubeVolume(value);
    if (!_joined || _youtubeVideoId.isEmpty) return;

    try {
      await _nativeRtc.updateYoutubeState({
        'videoId': _youtubeVideoId,
        'title': _youtubeTitle,
        'playing': _youtubePlaying,
        'volume': _youtubeVolume,
        'positionSeconds': _youtubePositionSeconds,
      });
    } on Object catch (error) {
      if (mounted) setState(() => _nativeStatus = error.toString());
    }
  }

  Future<void> _applyRtcSettingsAfterJoin() async {
    try {
      await _nativeRtc.setMicEnabled(_micOn);
      await _nativeRtc.setLocalVideoEnabled(_cameraOn);
      if (_cameraOn) await _nativeRtc.refreshVideoRenderers();
      await _nativeRtc.setNoiseCancellationEnabled(_noiseCancellationOn);
      if (_beautyOn) {
        await _nativeRtc.setBeautyEnabled(true, level: 62);
        await _nativeRtc.setBeautyLevels(
          beautyLevel: 62,
          smoothingLevel: 54,
          whiteningLevel: 38,
          eyeLevel: 18,
          faceSlimLevel: 16,
        );
      }
      await _nativeRtc.setFaceDetectEnabled(_faceDetectOn);
      if (_aiFilter != 'none') {
        await _nativeRtc.setAiFilter(_aiFilter);
      }
      if (_videoFilter != 'none') {
        await _nativeRtc.setVideoFilter(_videoFilter);
      }
      if (_isYoutubeRoom && _youtubeVideoId.isNotEmpty) {
        await _nativeRtc.setYoutubeVideo(
          videoId: _youtubeVideoId,
          title: _youtubeTitle.isEmpty ? 'YouTube video' : _youtubeTitle,
          volume: _youtubeVolume,
        );
        if (_youtubePlaying) {
          await _nativeRtc.playYoutube(positionSeconds: _youtubePositionSeconds);
        }
      }
    } on Object catch (error) {
      if (mounted) setState(() => _nativeStatus = error.toString());
    }
  }

  Future<bool> _ensureNativeSession() async {
    if (_joined) return true;
    if (_nativeBusy) return false;

    await _startNativeSession();
    return mounted && _joined;
  }

  Future<bool> _ensureCameraForVideoEffect() async {
    if (!(await _ensureNativeSession())) return false;
    if (_cameraOn) return true;

    await _setCameraEnabled(true);
    return mounted && _joined && _cameraOn;
  }

  Future<void> _waitForNativePreview() async {
    if (!mounted) return;
    await WidgetsBinding.instance.endOfFrame;
    if (!mounted) return;
    await Future<void>.delayed(const Duration(milliseconds: 80));
  }

  void _handleNativeEvent(FunintNativeRtcEvent event) {
    if (!mounted) return;

    setState(() {
      switch (event.name) {
        case 'connected':
          _joined = true;
          _nativeStatus = 'Connected to room ${event.data['roomId'] ?? ''}.';
        case 'disconnected':
          _joined = false;
          _nativeStatus = 'You left the room.';
        case 'statusChanged':
          _nativeStatus = 'Live room updated.';
        case 'localAudioMuted':
          _micOn = event.data['muted'] != true;
          _nativeStatus = _micOn ? 'Mic active.' : 'Mic muted.';
        case 'localVideoEnabled':
          _cameraOn = event.data['enabled'] == true;
          _videoViewRevision++;
          _nativeStatus = _cameraOn ? 'Camera active.' : 'Camera off.';
        case 'speakerphoneChanged':
          _nativeStatus =
              'Speaker ${event.data['enabled'] == true ? 'on' : 'off'}.';
        case 'cameraSwitched':
          _nativeStatus = 'Camera switched.';
        case 'noiseCancellationChanged':
          _noiseCancellationOn = event.data['enabled'] == true;
          _nativeStatus = _noiseCancellationOn
              ? 'Noise cancellation on.'
              : 'Noise cancellation off.';
        case 'localScreenShareStarted':
          _screenShare = true;
          _nativeStatus = 'Screen share active.';
        case 'localScreenShareStopped':
        case 'localScreenShareRejected':
          _screenShare = false;
          _nativeStatus = 'Screen share off.';
        case 'localAiFilterChanged':
          _aiFilter = event.data['filter']?.toString() ?? _aiFilter;
          _nativeStatus = 'Camera style updated.';
        case 'localVideoFilterChanged':
          _videoFilter = event.data['filter']?.toString() ?? _videoFilter;
          _nativeStatus = 'Look updated.';
        case 'beautyChanged':
          _beautyOn = event.data['enabled'] == true;
          _nativeStatus = _beautyOn ? 'Touch up on.' : 'Touch up off.';
        case 'faceDetectChanged':
          _faceDetectOn = event.data['enabled'] == true;
          _nativeStatus = _faceDetectOn ? 'Face guide on.' : 'Face guide off.';
        case 'error':
          _nativeStatus =
              event.data['message']?.toString() ?? 'Connection error.';
        default:
          _nativeStatus = 'Live room updated.';
      }
    });
  }

  void _sendMessage() {
    final body = _chatComposer.text.trim();
    if (body.isEmpty) return;
    setState(() {
      _messages.add(_UiRoomMessage(author: 'You', body: body, mine: true));
      _chatComposer.clear();
    });
    if (_joined) {
      unawaited(_sendNativeMessage(body));
    }
  }

  Future<void> _sendNativeMessage(String body) async {
    try {
      await _nativeRtc.sendMessage(body);
    } on Object catch (error) {
      if (mounted) {
        setState(() => _nativeStatus = 'Chat send failed: $error');
      }
    }
  }

  String? get _sessionNotice {
    if (_nativeBusy) return _joined ? 'Leaving room...' : 'Joining room...';
    if (_nativeStatus.startsWith('Chat send failed')) {
      return 'Message could not be sent.';
    }
    final status = _nativeStatus.toLowerCase();
    if (status.contains('error') ||
        status.contains('token') ||
        status.contains('backend') ||
        status.contains('access')) {
      return 'Connection needs attention.';
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final room = widget.room;
    final keyboardInset = MediaQuery.viewInsetsOf(context).bottom;
    final sessionNotice = _sessionNotice;
    return Scaffold(
      body: Container(
        color: RtcPalette.stageBg,
        child: SafeArea(
          child: Column(
            children: [
              _RoomTopBar(
                room: room,
                onBack: () => Navigator.maybePop(context),
              ),
              Expanded(
                child: ListView(
                  keyboardDismissBehavior:
                      ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: EdgeInsets.fromLTRB(12, 8, 12, 12 + keyboardInset),
                  children: [
                    _StagePreview(
                      room: room,
                      user: widget.user,
                      joined: _joined,
                      micOn: _micOn,
                      cameraOn: _cameraOn,
                      screenShare: _screenShare,
                      stageMode: _stageMode,
                      videoViewRevision: _videoViewRevision,
                    ),
                    const SizedBox(height: 12),
                    _StageControls(
                      joined: _joined,
                      micOn: _micOn,
                      cameraOn: _cameraOn,
                      screenShare: _screenShare,
                      chatOpen: _chatOpen,
                      onJoin: () => unawaited(_toggleJoined()),
                      onMic: () => unawaited(_setMicEnabled(!_micOn)),
                      onCamera: () => unawaited(_setCameraEnabled(!_cameraOn)),
                      onShare: () =>
                          unawaited(_setScreenShareEnabled(!_screenShare)),
                      onChat: () => setState(() => _chatOpen = !_chatOpen),
                    ),
                    if (sessionNotice != null) ...[
                      const SizedBox(height: 12),
                      _SessionNotice(message: sessionNotice, busy: _nativeBusy),
                    ],
                    const SizedBox(height: 12),
                    _RtcEffectsPanel(
                      noiseCancellationOn: _noiseCancellationOn,
                      beautyOn: _beautyOn,
                      faceDetectOn: _faceDetectOn,
                      aiFilter: _aiFilter,
                      videoFilter: _videoFilter,
                      onNoiseCancellation: (enabled) =>
                          unawaited(_setNoiseCancellationEnabled(enabled)),
                      onBeauty: (enabled) =>
                          unawaited(_setBeautyEnabled(enabled)),
                      onFaceDetect: (enabled) =>
                          unawaited(_setFaceDetectEnabled(enabled)),
                      onAiFilter: (filter) => unawaited(_setAiFilter(filter)),
                      onVideoFilter: (filter) =>
                          unawaited(_setVideoFilter(filter)),
                      onClear: () => unawaited(_clearVideoEffects()),
                    ),
                    const SizedBox(height: 12),
                    _RoomStats(room: room, stageMode: _stageMode),
                    const SizedBox(height: 12),
                    _StageRoleSelector(
                      value: _stageMode,
                      onChanged: (value) => setState(() => _stageMode = value),
                    ),
                    const SizedBox(height: 12),
                    if (_chatOpen)
                      _ChatPanel(
                        messages: _messages,
                        composer: _chatComposer,
                        onSend: _sendMessage,
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RoomTopBar extends StatelessWidget {
  const _RoomTopBar({required this.room, required this.onBack});

  final Room room;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
      child: Row(
        children: [
          RtcIconButton(
            tooltip: 'Back',
            icon: Icons.arrow_back,
            onPressed: onBack,
            size: 42,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  room.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: 18,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${room.roomTypeLabel} - ${formatPrivacy(room.privacyType)}',
                  style: const TextStyle(
                    color: RtcPalette.muted,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
          StatusPill(
            label: room.activeParticipants > 0 ? 'Live' : 'Ready',
            state: room.activeParticipants > 0
                ? RtcStatusState.good
                : RtcStatusState.idle,
          ),
        ],
      ),
    );
  }
}

class _StagePreview extends StatelessWidget {
  const _StagePreview({
    required this.room,
    required this.user,
    required this.joined,
    required this.micOn,
    required this.cameraOn,
    required this.screenShare,
    required this.stageMode,
    required this.videoViewRevision,
  });

  final Room room;
  final AppUser user;
  final bool joined;
  final bool micOn;
  final bool cameraOn;
  final bool screenShare;
  final String stageMode;
  final int videoViewRevision;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 390,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        image: DecorationImage(
          image: RtcAssets.coverImageForRoom(room, room.id),
          fit: BoxFit.cover,
        ),
      ),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          gradient: const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color.fromRGBO(15, 23, 42, 0.3),
              Color.fromRGBO(33, 7, 12, 0.92),
            ],
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _StageBadge(
                  icon: joined ? Icons.wifi_tethering : Icons.visibility,
                  label: joined ? 'Preview joined' : 'Preview mode',
                ),
                _StageBadge(icon: Icons.person, label: stageMode),
                if (screenShare)
                  const _StageBadge(
                    icon: Icons.screen_share_outlined,
                    label: 'Share layout',
                  ),
              ],
            ),
            const Spacer(),
            Center(
              child: joined
                  ? _NativeVideoPreview(
                      cameraOn: cameraOn,
                      micOn: micOn,
                      screenShare: screenShare,
                      videoViewRevision: videoViewRevision,
                    )
                  : Column(
                      children: [
                        RtcAvatarToken(
                          label: room.displayHost,
                          image: RtcAssets.avatarImageForUser(user),
                          size: cameraOn ? 112 : 86,
                          borderRadius: cameraOn ? 12 : RtcRadius.pill,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          cameraOn ? 'Camera tile' : room.displayHost,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          micOn ? 'Mic active in UI preview' : 'Mic muted',
                          style: const TextStyle(
                            color: RtcPalette.soft,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
            ),
            const Spacer(),
            _SeatRow(room: room),
          ],
        ),
      ),
    );
  }
}

class _NativeVideoPreview extends StatelessWidget {
  const _NativeVideoPreview({
    required this.cameraOn,
    required this.micOn,
    required this.screenShare,
    required this.videoViewRevision,
  });

  final bool cameraOn;
  final bool micOn;
  final bool screenShare;
  final int videoViewRevision;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 214,
      width: double.infinity,
      child: Stack(
        children: [
          Positioned.fill(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Container(
                color: Colors.black,
                child: cameraOn
                    ? FunintLocalVideoView(
                        key: ValueKey('local-main-$videoViewRevision'),
                        fit: FunintVideoViewFit.cover,
                      )
                    : const FunintRemoteVideoView(
                        fit: FunintVideoViewFit.cover,
                      ),
              ),
            ),
          ),
          Positioned(
            left: 10,
            bottom: 10,
            child: _StageBadge(
              icon: micOn ? Icons.mic : Icons.mic_off,
              label: micOn ? 'Mic on' : 'Muted',
            ),
          ),
          if (screenShare)
            const Positioned(
              left: 10,
              top: 10,
              child: _StageBadge(
                icon: Icons.screen_share_outlined,
                label: 'Sharing',
              ),
            ),
          if (cameraOn)
            const Positioned(
              right: 10,
              top: 10,
              child: _StageBadge(icon: Icons.videocam, label: 'Camera on'),
            ),
        ],
      ),
    );
  }
}

class _SeatRow extends StatelessWidget {
  const _SeatRow({required this.room});

  final Room room;

  @override
  Widget build(BuildContext context) {
    final count = room.maxMicCount.clamp(1, 8);
    return Row(
      children: List.generate(count, (index) {
        final occupied = index < room.activeParticipantPreviews.length;
        final preview = occupied ? room.activeParticipantPreviews[index] : null;
        return Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 3),
            child: Container(
              height: 54,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.12),
                border: Border.all(color: RtcPalette.stageLine),
                borderRadius: BorderRadius.circular(8),
              ),
              child: occupied
                  ? RtcAvatarToken(
                      label: preview!.name,
                      image: AssetImage(RtcAssets.avatarForIndex(index + 2)),
                      size: 34,
                      borderRadius: RtcRadius.pill,
                    )
                  : const Icon(Icons.add, color: RtcPalette.soft, size: 18),
            ),
          ),
        );
      }),
    );
  }
}

class _StageBadge extends StatelessWidget {
  const _StageBadge({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.42),
        borderRadius: BorderRadius.circular(RtcRadius.pill),
        border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: Colors.white, size: 15),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _SessionNotice extends StatelessWidget {
  const _SessionNotice({required this.message, required this.busy});

  final String message;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      color: RtcPalette.stagePanel,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: [
          if (busy)
            const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          else
            const Icon(Icons.info_outline, color: RtcPalette.soft, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                color: RtcPalette.soft,
                fontWeight: FontWeight.w800,
                height: 1.2,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RtcEffectsPanel extends StatelessWidget {
  const _RtcEffectsPanel({
    required this.noiseCancellationOn,
    required this.beautyOn,
    required this.faceDetectOn,
    required this.aiFilter,
    required this.videoFilter,
    required this.onNoiseCancellation,
    required this.onBeauty,
    required this.onFaceDetect,
    required this.onAiFilter,
    required this.onVideoFilter,
    required this.onClear,
  });

  final bool noiseCancellationOn;
  final bool beautyOn;
  final bool faceDetectOn;
  final String aiFilter;
  final String videoFilter;
  final ValueChanged<bool> onNoiseCancellation;
  final ValueChanged<bool> onBeauty;
  final ValueChanged<bool> onFaceDetect;
  final ValueChanged<String> onAiFilter;
  final ValueChanged<String> onVideoFilter;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      color: RtcPalette.stagePanel,
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.tune_rounded, color: RtcPalette.soft, size: 18),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Audio & video',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              TextButton.icon(
                onPressed: onClear,
                icon: const Icon(Icons.layers_clear, size: 17),
                label: const Text('Reset'),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _EffectSwitch(
                label: 'Noise',
                icon: Icons.graphic_eq,
                value: noiseCancellationOn,
                onChanged: onNoiseCancellation,
              ),
              _EffectSwitch(
                label: 'Touch up',
                icon: Icons.face_retouching_natural,
                value: beautyOn,
                onChanged: onBeauty,
              ),
              _EffectSwitch(
                label: 'Face guide',
                icon: Icons.face_6_outlined,
                value: faceDetectOn,
                onChanged: onFaceDetect,
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Text(
            'Camera style',
            style: TextStyle(
              color: RtcPalette.soft,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 8),
          RtcFilterBar(
            options: const ['none', 'portrait'],
            active: aiFilter,
            onChanged: onAiFilter,
          ),
          const SizedBox(height: 12),
          const Text(
            'Look',
            style: TextStyle(
              color: RtcPalette.soft,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 8),
          RtcFilterBar(
            options: const ['none', 'soft'],
            active: videoFilter,
            onChanged: onVideoFilter,
          ),
        ],
      ),
    );
  }
}

class _EffectSwitch extends StatelessWidget {
  const _EffectSwitch({
    required this.label,
    required this.icon,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final IconData icon;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 106,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        border: Border.all(color: RtcPalette.stageLine),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: Colors.white, size: 17),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: 12,
                  ),
                ),
              ),
            ],
          ),
          Switch(value: value, onChanged: onChanged),
        ],
      ),
    );
  }
}

class _StageControls extends StatelessWidget {
  const _StageControls({
    required this.joined,
    required this.micOn,
    required this.cameraOn,
    required this.screenShare,
    required this.chatOpen,
    required this.onJoin,
    required this.onMic,
    required this.onCamera,
    required this.onShare,
    required this.onChat,
  });

  final bool joined;
  final bool micOn;
  final bool cameraOn;
  final bool screenShare;
  final bool chatOpen;
  final VoidCallback onJoin;
  final VoidCallback onMic;
  final VoidCallback onCamera;
  final VoidCallback onShare;
  final VoidCallback onChat;

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      color: RtcPalette.stagePanel,
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          _RoundControl(
            tooltip: joined ? 'Leave preview' : 'Join preview',
            icon: joined ? Icons.call_end : Icons.login,
            active: joined,
            danger: joined,
            onTap: onJoin,
          ),
          _RoundControl(
            tooltip: micOn ? 'Mute mic' : 'Unmute mic',
            icon: micOn ? Icons.mic : Icons.mic_off,
            active: micOn,
            onTap: onMic,
          ),
          _RoundControl(
            tooltip: cameraOn ? 'Turn camera off' : 'Turn camera on',
            icon: cameraOn ? Icons.videocam : Icons.videocam_off,
            active: cameraOn,
            onTap: onCamera,
          ),
          _RoundControl(
            tooltip: screenShare ? 'Stop share layout' : 'Share layout',
            icon: Icons.screen_share_outlined,
            active: screenShare,
            onTap: onShare,
          ),
          _RoundControl(
            tooltip: chatOpen ? 'Hide chat' : 'Show chat',
            icon: Icons.chat_bubble_outline,
            active: chatOpen,
            onTap: onChat,
          ),
        ],
      ),
    );
  }
}

class _RoundControl extends StatelessWidget {
  const _RoundControl({
    required this.tooltip,
    required this.icon,
    required this.active,
    required this.onTap,
    this.danger = false,
  });

  final String tooltip;
  final IconData icon;
  final bool active;
  final bool danger;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = danger
        ? RtcPalette.hot
        : active
        ? RtcPalette.sky
        : RtcPalette.stagePanelSoft;
    return Expanded(
      child: Tooltip(
        message: tooltip,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: InkWell(
            borderRadius: BorderRadius.circular(RtcRadius.pill),
            onTap: onTap,
            child: Container(
              height: 48,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
                border: Border.all(color: RtcPalette.stageLine),
              ),
              child: Icon(icon, color: Colors.white, size: 20),
            ),
          ),
        ),
      ),
    );
  }
}

class _RoomStats extends StatelessWidget {
  const _RoomStats({required this.room, required this.stageMode});

  final Room room;
  final String stageMode;

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      color: RtcPalette.stagePanel,
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          MetricChip(
            label: 'People',
            value: _compactNumber(room.activeParticipants),
          ),
          MetricChip(label: 'Seats', value: room.maxMicCount.toString()),
          MetricChip(label: 'Access', value: formatPrivacy(room.privacyType)),
          MetricChip(label: 'Mode', value: stageMode),
        ],
      ),
    );
  }
}

class _StageRoleSelector extends StatelessWidget {
  const _StageRoleSelector({required this.value, required this.onChanged});

  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      color: RtcPalette.stagePanel,
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Stage role',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 10),
          RtcFilterBar(
            options: const ['Host', 'Speaker', 'Audience'],
            active: value,
            onChanged: onChanged,
          ),
        ],
      ),
    );
  }
}

class _ChatPanel extends StatelessWidget {
  const _ChatPanel({
    required this.messages,
    required this.composer,
    required this.onSend,
  });

  final List<_UiRoomMessage> messages;
  final TextEditingController composer;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      color: RtcPalette.stagePanel,
      padding: const EdgeInsets.all(12),
      child: Column(
        children: [
          Row(
            children: const [
              Icon(Icons.chat_bubble_outline, color: RtcPalette.soft, size: 18),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Room chat preview',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ...messages.map((message) => _ChatBubble(message: message)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: composer,
                  minLines: 1,
                  maxLines: 1,
                  keyboardType: TextInputType.text,
                  textInputAction: TextInputAction.send,
                  scrollPadding: const EdgeInsets.only(bottom: 120),
                  style: const TextStyle(color: Colors.white),
                  decoration: const InputDecoration(
                    hintText: 'Write a preview message',
                    prefixIcon: Icon(Icons.message_outlined),
                  ),
                  onSubmitted: (_) => onSend(),
                ),
              ),
              const SizedBox(width: 8),
              RtcIconButton(
                tooltip: 'Send',
                icon: Icons.send_rounded,
                onPressed: onSend,
                size: 46,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ChatBubble extends StatelessWidget {
  const _ChatBubble({required this.message});

  final _UiRoomMessage message;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: message.mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(10),
        constraints: const BoxConstraints(maxWidth: 280),
        decoration: BoxDecoration(
          color: message.mine
              ? RtcPalette.sky.withValues(alpha: 0.18)
              : Colors.white.withValues(alpha: 0.1),
          border: Border.all(color: RtcPalette.stageLine),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              message.author,
              style: const TextStyle(
                color: RtcPalette.muted,
                fontSize: 12,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              message.body,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                height: 1.25,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _UiRoomMessage {
  const _UiRoomMessage({
    required this.author,
    required this.body,
    required this.mine,
  });

  final String author;
  final String body;
  final bool mine;
}

String _compactNumber(num value) {
  final number = value.toDouble();
  if (number >= 1000000) return '${(number / 1000000).toStringAsFixed(1)}M';
  if (number >= 1000) return '${(number / 1000).toStringAsFixed(1)}K';
  return number.truncate().toString();
}

String _rtcModeForRoom(Room room) {
  return switch (room.roomType.toLowerCase()) {
    'one_to_one_video' => 'video_call',
    'group_video' => 'group_video',
    'solo_live' => 'solo_live',
    'pk_live' => 'live_pk',
    'one_to_one_audio' => 'voice_call',
    'group_audio' => 'group_voice',
    'youtube_audio' => 'youtube_room',
    'audio' => 'voice',
    final type when type.contains('video') => 'video',
    _ => room.supportsVideo ? 'video' : 'voice',
  };
}

String _rtcRoomIdForRoom(Room room) {
  final configured = FunintNativeRtcService.defaultRoomId.trim();
  return configured.isEmpty ? room.id.toString() : configured;
}

List<String> _rtcPermissionsForRoom(Room room) {
  final permissions = <String>['join', 'publish_audio', 'chat', 'signal'];

  if (room.supportsVideo) {
    permissions.add('publish_video');
  }

  if (room.screenShareEnabled) {
    permissions.add('screen_share');
  }

  return permissions.toSet().toList(growable: false);
}
