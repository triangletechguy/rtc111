import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:rtc_flutter_sdk/rtc_flutter_sdk.dart';

import '../config/app_config.dart';

enum NativeRtcEventType {
  status,
  connected,
  disconnected,
  participantCount,
  remoteStream,
  localAudioMuted,
  localVideoEnabled,
  speakerphoneChanged,
  error,
}

class NativeRtcEvent {
  const NativeRtcEvent({required this.type, required this.message, this.data});

  final NativeRtcEventType type;
  final String message;
  final Map<String, dynamic>? data;
}

class NativeRtcService {
  NativeRtcService({http.Client? httpClient})
    : _httpClient = httpClient ?? http.Client(),
      _ownsHttpClient = httpClient == null;

  final http.Client _httpClient;
  final bool _ownsHttpClient;
  final _events = StreamController<NativeRtcEvent>.broadcast();

  StreamSubscription<RtcEvent>? _pluginSubscription;
  bool _initialized = false;
  bool _started = false;

  Stream<NativeRtcEvent> get events => _events.stream;
  bool get isStarted => _started;

  Future<void> initialize() async {
    if (_initialized) return;
    if (defaultTargetPlatform != TargetPlatform.android) {
      throw UnsupportedError('The native RTC AAR is Android-only.');
    }

    RtcFlutterSdk.initialize(
      appId: AppConfig.rtcAppId,
      appKey: AppConfig.rtcAppKey,
    );
    _pluginSubscription = RtcFlutterSdk.events.listen(
      _handlePluginEvent,
      onError: (Object error, StackTrace stackTrace) {
        _emit(
          NativeRtcEvent(
            type: NativeRtcEventType.error,
            message: error.toString(),
          ),
        );
      },
    );
    _initialized = true;
  }

  Future<void> joinRoom({
    required String roomId,
    required String externalUserId,
    required String role,
    required String rtcMode,
    required bool canPublish,
    required bool micEnabled,
    required bool cameraEnabled,
  }) async {
    await initialize();
    if (_started) await leaveRoom();

    final normalizedRoomId = roomId.trim().isEmpty ? 'room1' : roomId.trim();
    _emit(
      const NativeRtcEvent(
        type: NativeRtcEventType.status,
        message: 'Issuing native RTC token...',
      ),
    );

    final accessToken = await _issueAccessToken(
      roomId: normalizedRoomId,
      externalUserId: externalUserId,
      role: role,
      rtcMode: rtcMode,
      canPublish: canPublish,
    );

    _emit(
      const NativeRtcEvent(
        type: NativeRtcEventType.status,
        message: 'Starting native RTC SDK...',
      ),
    );

    try {
      await RtcFlutterSdk.start(
        appId: AppConfig.rtcAppId,
        appKey: AppConfig.rtcAppKey,
        accessToken: accessToken,
        roomId: normalizedRoomId,
        signalingUrl: AppConfig.rtcSignalingUrl,
        rtcMode: rtcMode,
        speakerOn: true,
      );
      _started = true;
      await RtcFlutterSdk.muteLocalAudio(!canPublish || !micEnabled);
      await RtcFlutterSdk.setLocalVideoEnabled(
        canPublish && cameraEnabled && !_isAudioOnly(rtcMode),
      );
      await RtcFlutterSdk.setSpeakerphoneOn(true);
    } catch (error) {
      await RtcFlutterSdk.release();
      _started = false;
      rethrow;
    }
  }

  Future<void> setMicEnabled(bool enabled) async {
    if (!_started) return;
    await RtcFlutterSdk.muteLocalAudio(!enabled);
  }

  Future<void> setCameraEnabled(bool enabled) async {
    if (!_started) return;
    await RtcFlutterSdk.setLocalVideoEnabled(enabled);
  }

  Future<void> sendMessage(String text) async {
    if (!_started || text.trim().isEmpty) return;
    await RtcFlutterSdk.sendMessage(text.trim());
  }

  Future<void> leaveRoom() async {
    if (!_started) return;
    try {
      await RtcFlutterSdk.leaveRoom();
    } finally {
      _started = false;
    }
  }

  Future<void> dispose() async {
    await leaveRoom();
    await _pluginSubscription?.cancel();
    await RtcFlutterSdk.release();
    if (_ownsHttpClient) _httpClient.close();
    await _events.close();
  }

  Future<String> _issueAccessToken({
    required String roomId,
    required String externalUserId,
    required String role,
    required String rtcMode,
    required bool canPublish,
  }) async {
    final response = await _httpClient.post(
      Uri.parse(AppConfig.rtcSignalingUrl).resolve('/rtc-token'),
      headers: const {'Content-Type': 'application/json'},
      body: jsonEncode({
        'appId': AppConfig.rtcAppId,
        'appKey': AppConfig.rtcAppKey,
        'roomId': roomId,
        'userId': externalUserId,
        'role': role,
        'rtcMode': rtcMode,
        'permissions': _permissionsFor(
          rtcMode: rtcMode,
          canPublish: canPublish,
        ),
      }),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = response.body.trim().isEmpty
          ? 'Token request failed with ${response.statusCode}.'
          : response.body.trim();
      throw StateError(message);
    }

    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final token =
        body['accessToken']?.toString() ??
        body['access_token']?.toString() ??
        body['token']?.toString();
    if (token == null || token.trim().isEmpty) {
      throw StateError('Token response did not include an RTC access token.');
    }
    return token.trim();
  }

  List<String> _permissionsFor({
    required String rtcMode,
    required bool canPublish,
  }) {
    return [
      'join',
      if (canPublish) 'publish_audio',
      if (canPublish && !_isAudioOnly(rtcMode)) 'publish_video',
      if (canPublish && !_isAudioOnly(rtcMode)) 'screen_share',
      'chat',
      'signal',
    ];
  }

  void _handlePluginEvent(RtcEvent event) {
    switch (event.name) {
      case 'statusChanged':
        _emit(
          NativeRtcEvent(
            type: NativeRtcEventType.status,
            message: event.data['status']?.toString() ?? 'RTC status changed',
            data: event.data,
          ),
        );
        break;
      case 'connected':
        _started = true;
        _emit(
          NativeRtcEvent(
            type: NativeRtcEventType.connected,
            message: 'Native RTC room joined',
            data: event.data,
          ),
        );
        break;
      case 'disconnected':
        _started = false;
        _emit(
          NativeRtcEvent(
            type: NativeRtcEventType.disconnected,
            message: event.data['reason']?.toString() ?? 'Native RTC left',
            data: event.data,
          ),
        );
        break;
      case 'participantCountChanged':
        _emit(
          NativeRtcEvent(
            type: NativeRtcEventType.participantCount,
            message: 'Participants: ${event.data['count']?.toString() ?? '0'}',
            data: event.data,
          ),
        );
        break;
      case 'remoteStream':
        _emit(
          NativeRtcEvent(
            type: NativeRtcEventType.remoteStream,
            message:
                'Remote stream: ${event.data['peerId']?.toString() ?? 'peer'}',
            data: event.data,
          ),
        );
        break;
      case 'localAudioMuted':
        _emit(
          NativeRtcEvent(
            type: NativeRtcEventType.localAudioMuted,
            message: event.data['muted'] == true
                ? 'Microphone muted'
                : 'Microphone live',
            data: event.data,
          ),
        );
        break;
      case 'localVideoEnabled':
        _emit(
          NativeRtcEvent(
            type: NativeRtcEventType.localVideoEnabled,
            message: event.data['enabled'] == true
                ? 'Camera live'
                : 'Camera off',
            data: event.data,
          ),
        );
        break;
      case 'speakerphoneChanged':
        _emit(
          NativeRtcEvent(
            type: NativeRtcEventType.speakerphoneChanged,
            message: event.data['enabled'] == true
                ? 'Speaker enabled'
                : 'Speaker disabled',
            data: event.data,
          ),
        );
        break;
      case 'error':
        _emit(
          NativeRtcEvent(
            type: NativeRtcEventType.error,
            message: event.data['message']?.toString() ?? 'Native RTC error',
            data: event.data,
          ),
        );
        break;
    }
  }

  void _emit(NativeRtcEvent event) {
    if (!_events.isClosed) _events.add(event);
  }

  bool _isAudioOnly(String rtcMode) {
    final normalized = rtcMode.trim().toLowerCase().replaceAll('-', '_');
    return const {
      'voice',
      'audio',
      'voice_call',
      'one_to_one_voice',
      'one_to_one_voice_call',
      'group_voice',
      'group_voice_chat',
      'youtube',
      'youtube_room',
    }.contains(normalized);
  }
}
