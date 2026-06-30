import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

class FunintNativeRtcService {
  const FunintNativeRtcService();

  static const defaultSignalingUrl = String.fromEnvironment(
    'RTC_SIGNALING_URL',
    defaultValue: 'https://funint.online',
  );
  static const defaultAppId = String.fromEnvironment(
    'RTC_APP_ID',
    defaultValue: 'talk',
  );
  static const defaultAppKey = String.fromEnvironment(
    'RTC_APP_KEY',
    defaultValue: 'rtc_app_5fa9d862ce9948b49293382ae44de27f',
  );
  static const defaultAccessToken = String.fromEnvironment(
    'RTC_ACCESS_TOKEN',
    defaultValue: '',
  );
  static const defaultRoomId = String.fromEnvironment(
    'RTC_ROOM_ID',
    defaultValue: '',
  );
  static const defaultRtcMode = String.fromEnvironment(
    'RTC_MODE',
    defaultValue: '',
  );

  static const MethodChannel _channel = MethodChannel('funint_online_sdk');
  static const localVideoViewType = 'funint_online_sdk/local_video_view';
  static const remoteVideoViewType = 'funint_online_sdk/remote_video_view';
  static final StreamController<FunintNativeRtcEvent> _events =
      StreamController<FunintNativeRtcEvent>.broadcast();

  static bool _initialized = false;

  Stream<FunintNativeRtcEvent> get events {
    initialize();
    return _events.stream;
  }

  static void initialize() {
    if (_initialized) return;

    _channel.setMethodCallHandler((call) async {
      if (call.method != 'onRtcEvent') return null;
      _events.add(FunintNativeRtcEvent.fromMap(_stringMap(call.arguments)));
      return null;
    });

    _initialized = true;
  }

  Future<FunintIntegrationStatus> integrationStatus() async {
    initialize();

    if (!_isAndroid) {
      return const FunintIntegrationStatus(
        available: false,
        appKey: defaultAppKey,
        signalingUrl: defaultSignalingUrl,
        message: 'Funint SDK is available on Android builds.',
      );
    }

    try {
      final raw = await _channel.invokeMethod<Object?>('getIntegrationStatus');
      return FunintIntegrationStatus.fromMap(
        _stringMap(raw),
      ).copyWith(appKey: defaultAppKey, signalingUrl: defaultSignalingUrl);
    } on MissingPluginException {
      return const FunintIntegrationStatus(
        available: false,
        appKey: defaultAppKey,
        signalingUrl: defaultSignalingUrl,
        message: 'Native Funint bridge is not registered.',
      );
    }
  }

  Future<FunintSessionStartResult> startSession({
    String? accessToken,
    String? appId,
    String? appKey,
    required String roomId,
    String? rtcMode,
    String signalingUrl = defaultSignalingUrl,
    bool speakerOn = true,
  }) async {
    initialize();
    _ensureAndroid();

    final token = _pick(accessToken, defaultAccessToken);
    if (token.isEmpty) {
      throw StateError(
        'RTC access token is required. Build with --dart-define=RTC_ACCESS_TOKEN=... to start a native session.',
      );
    }

    final raw = await _channel.invokeMethod<Object?>('startSession', {
      'accessToken': token,
      'appId': _pick(appId, defaultAppId),
      'appKey': _pick(appKey, defaultAppKey),
      'roomId': _pick(defaultRoomId, roomId),
      'rtcMode': _pick(defaultRtcMode, rtcMode ?? ''),
      'signalingUrl': signalingUrl.trim(),
      'speakerOn': speakerOn,
    });

    return FunintSessionStartResult.fromMap(_stringMap(raw));
  }

  Future<void> leaveSession() async {
    initialize();
    if (!_isAndroid) return;
    await _channel.invokeMethod<void>('leaveSession');
  }

  Future<void> setMicEnabled(bool enabled) async {
    initialize();
    await _channel.invokeMethod<void>('setMicEnabled', {'enabled': enabled});
  }

  Future<void> setSpeakerphoneOn(bool enabled) async {
    initialize();
    await _channel.invokeMethod<void>('setSpeakerphoneOn', {
      'enabled': enabled,
    });
  }

  Future<void> setLocalVideoEnabled(bool enabled) async {
    initialize();
    await _channel.invokeMethod<void>('setLocalVideoEnabled', {
      'enabled': enabled,
    });
  }

  Future<void> refreshVideoRenderers() async {
    initialize();
    await _channel.invokeMethod<void>('refreshVideoRenderers');
  }

  Future<bool> switchCamera() async {
    initialize();
    final switched = await _channel.invokeMethod<bool>('switchCamera');
    return switched ?? false;
  }

  Future<void> setNoiseCancellationEnabled(bool enabled) async {
    initialize();
    await _channel.invokeMethod<void>('setNoiseCancellationEnabled', {
      'enabled': enabled,
    });
  }

  Future<bool> startScreenShare({
    int width = 720,
    int height = 1280,
    int fps = 15,
  }) async {
    initialize();
    final started = await _channel.invokeMethod<bool>('startScreenShare', {
      'width': width,
      'height': height,
      'fps': fps,
    });
    return started ?? false;
  }

  Future<bool> stopScreenShare({
    int width = 720,
    int height = 1280,
    int fps = 15,
  }) async {
    initialize();
    final stopped = await _channel.invokeMethod<bool>('stopScreenShare', {
      'width': width,
      'height': height,
      'fps': fps,
    });
    return stopped ?? false;
  }

  Future<void> setScreenShareEnabled(bool enabled) async {
    initialize();
    await _channel.invokeMethod<void>('setScreenShareEnabled', {
      'enabled': enabled,
    });
  }

  Future<void> setVideoEffects(Map<String, Object?> effects) async {
    initialize();
    await _channel.invokeMethod<void>('setVideoEffects', {'effects': effects});
  }

  Future<void> setVideoFilter(String filter) async {
    initialize();
    await _channel.invokeMethod<void>('setVideoFilter', {
      'filter': filter.trim(),
    });
  }

  Future<void> setAiFilter(String filter) async {
    initialize();
    await _channel.invokeMethod<void>('setAiFilter', {'filter': filter.trim()});
  }

  Future<void> setSticker(String sticker) async {
    initialize();
    await _channel.invokeMethod<void>('setSticker', {
      'sticker': sticker.trim(),
    });
  }

  Future<void> setFaceDetectEnabled(bool enabled) async {
    initialize();
    await _channel.invokeMethod<void>('setFaceDetectEnabled', {
      'enabled': enabled,
    });
  }

  Future<void> setBeautyEnabled(bool enabled, {int level = 50}) async {
    initialize();
    await _channel.invokeMethod<void>('setBeautyEnabled', {
      'enabled': enabled,
      'level': level.clamp(0, 100),
    });
  }

  Future<void> setBeautyLevels({
    int beautyLevel = 50,
    int smoothingLevel = 50,
    int whiteningLevel = 40,
    int eyeLevel = 20,
    int faceSlimLevel = 20,
  }) async {
    initialize();
    await _channel.invokeMethod<void>('setBeautyLevels', {
      'beautyLevel': beautyLevel.clamp(0, 100),
      'smoothingLevel': smoothingLevel.clamp(0, 100),
      'whiteningLevel': whiteningLevel.clamp(0, 100),
      'eyeLevel': eyeLevel.clamp(0, 100),
      'faceSlimLevel': faceSlimLevel.clamp(0, 100),
    });
  }

  Future<void> setBeautyMakeup(Map<String, Object?> makeup) async {
    initialize();
    await _channel.invokeMethod<void>('setBeautyMakeup', {'makeup': makeup});
  }

  Future<void> applyLiveBeautyPreset(String preset) async {
    initialize();
    await _channel.invokeMethod<void>('applyLiveBeautyPreset', {
      'preset': preset.trim(),
    });
  }

  Future<void> clearVideoEffects() async {
    initialize();
    await _channel.invokeMethod<void>('clearVideoEffects');
  }

  Future<void> setYoutubeVideo({
    required String videoId,
    String title = '',
    double volume = 1,
    String thumbnailUrl = '',
  }) async {
    initialize();
    await _channel.invokeMethod<void>('setYoutubeVideo', {
      'videoId': videoId.trim(),
      'title': title.trim(),
      'volume': volume.clamp(0, 1).toDouble(),
      'thumbnailUrl': thumbnailUrl.trim(),
    });
  }

  Future<void> playYoutube({double? positionSeconds}) async {
    initialize();
    await _channel.invokeMethod<void>('playYoutube', {
      if (positionSeconds != null) 'positionSeconds': positionSeconds,
    });
  }

  Future<void> pauseYoutube({double? positionSeconds}) async {
    initialize();
    await _channel.invokeMethod<void>('pauseYoutube', {
      if (positionSeconds != null) 'positionSeconds': positionSeconds,
    });
  }

  Future<void> stopYoutube({double? positionSeconds}) async {
    initialize();
    await _channel.invokeMethod<void>('stopYoutube', {
      if (positionSeconds != null) 'positionSeconds': positionSeconds,
    });
  }

  Future<void> seekYoutube(double positionSeconds) async {
    initialize();
    await _channel.invokeMethod<void>('seekYoutube', {
      'positionSeconds': positionSeconds.clamp(0, double.infinity).toDouble(),
    });
  }

  Future<void> updateYoutubeState(Map<String, Object?> state) async {
    initialize();
    await _channel.invokeMethod<void>('updateYoutubeState', {'state': state});
  }

  Future<void> sendMessage(String text) async {
    initialize();
    await _channel.invokeMethod<void>('sendMessage', {'text': text});
  }

  Future<void> sendComment(String text) async {
    initialize();
    await _channel.invokeMethod<void>('sendComment', {'text': text});
  }

  Future<void> likeRoom() async {
    initialize();
    await _channel.invokeMethod<void>('likeRoom');
  }

  Future<void> shareRoom({String target = 'app'}) async {
    initialize();
    await _channel.invokeMethod<void>('shareRoom', {'target': target});
  }

  Future<void> requestMessageHistory({int limit = 50}) async {
    initialize();
    await _channel.invokeMethod<void>('requestMessageHistory', {
      'limit': limit,
    });
  }

  static bool get _isAndroid =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static void _ensureAndroid() {
    if (!_isAndroid) {
      throw UnsupportedError('Funint native RTC SDK is Android-only.');
    }
  }
}

enum FunintVideoViewFit { cover, contain }

class FunintLocalVideoView extends StatelessWidget {
  const FunintLocalVideoView({
    super.key,
    this.mirror = true,
    this.fit = FunintVideoViewFit.cover,
  });

  final bool mirror;
  final FunintVideoViewFit fit;

  @override
  Widget build(BuildContext context) {
    if (!FunintNativeRtcService._isAndroid) {
      return const SizedBox.expand();
    }

    return AndroidView(
      viewType: FunintNativeRtcService.localVideoViewType,
      creationParams: <String, Object?>{'mirror': mirror, 'fit': fit.name},
      creationParamsCodec: const StandardMessageCodec(),
    );
  }
}

class FunintRemoteVideoView extends StatelessWidget {
  const FunintRemoteVideoView({
    super.key,
    this.mirror = false,
    this.fit = FunintVideoViewFit.cover,
  });

  final bool mirror;
  final FunintVideoViewFit fit;

  @override
  Widget build(BuildContext context) {
    if (!FunintNativeRtcService._isAndroid) {
      return const SizedBox.expand();
    }

    return AndroidView(
      viewType: FunintNativeRtcService.remoteVideoViewType,
      creationParams: <String, Object?>{'mirror': mirror, 'fit': fit.name},
      creationParamsCodec: const StandardMessageCodec(),
    );
  }
}

class FunintIntegrationStatus {
  const FunintIntegrationStatus({
    required this.available,
    this.sdk = '',
    this.appKey = '',
    this.signalingUrl = '',
    this.permissions = const <String>[],
    this.message = '',
  });

  factory FunintIntegrationStatus.fromMap(Map<String, dynamic> data) {
    return FunintIntegrationStatus(
      available: data['available'] == true,
      sdk: data['sdk']?.toString() ?? '',
      appKey: data['appKey']?.toString() ?? '',
      signalingUrl: data['signalingUrl']?.toString() ?? '',
      permissions: _stringList(data['permissions']),
      message: data['message']?.toString() ?? '',
    );
  }

  final bool available;
  final String sdk;
  final String appKey;
  final String signalingUrl;
  final List<String> permissions;
  final String message;

  FunintIntegrationStatus copyWith({
    bool? available,
    String? sdk,
    String? appKey,
    String? signalingUrl,
    List<String>? permissions,
    String? message,
  }) {
    return FunintIntegrationStatus(
      available: available ?? this.available,
      sdk: sdk ?? this.sdk,
      appKey: appKey ?? this.appKey,
      signalingUrl: signalingUrl ?? this.signalingUrl,
      permissions: permissions ?? this.permissions,
      message: message ?? this.message,
    );
  }
}

class FunintSessionStartResult {
  const FunintSessionStartResult({
    required this.started,
    this.appId = '',
    this.appKey = '',
    this.roomId = '',
    this.rtcMode = '',
    this.signalingUrl = '',
  });

  factory FunintSessionStartResult.fromMap(Map<String, dynamic> data) {
    return FunintSessionStartResult(
      started: data['started'] == true,
      appId: data['appId']?.toString() ?? '',
      appKey: data['appKey']?.toString() ?? '',
      roomId: data['roomId']?.toString() ?? '',
      rtcMode: data['rtcMode']?.toString() ?? '',
      signalingUrl: data['signalingUrl']?.toString() ?? '',
    );
  }

  final bool started;
  final String appId;
  final String appKey;
  final String roomId;
  final String rtcMode;
  final String signalingUrl;
}

class FunintNativeRtcEvent {
  const FunintNativeRtcEvent({required this.name, required this.data});

  factory FunintNativeRtcEvent.fromMap(Map<String, dynamic> data) {
    return FunintNativeRtcEvent(
      name: data['event']?.toString() ?? 'unknown',
      data: data,
    );
  }

  final String name;
  final Map<String, dynamic> data;
}

String _pick(String? preferred, String fallback) {
  final picked = preferred?.trim();
  return picked == null || picked.isEmpty ? fallback.trim() : picked;
}

Map<String, dynamic> _stringMap(Object? raw) {
  if (raw is! Map) return <String, dynamic>{};
  return raw.map((key, value) => MapEntry(key.toString(), value));
}

List<String> _stringList(Object? raw) {
  if (raw is! Iterable) return const <String>[];
  return raw.map((value) => value.toString()).toList(growable: false);
}
