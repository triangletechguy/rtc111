import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter/services.dart';

class RtcEvent {
  const RtcEvent({required this.name, required this.data});

  factory RtcEvent.fromMethodCall(MethodCall call) {
    return RtcEvent.fromMap(_stringMap(call.arguments));
  }

  factory RtcEvent.fromMap(Map<String, dynamic> data) {
    return RtcEvent(name: data['event']?.toString() ?? 'unknown', data: data);
  }

  final String name;
  final Map<String, dynamic> data;
}

class RtcStartResult {
  const RtcStartResult({
    required this.started,
    required this.appId,
    required this.appKey,
    required this.roomId,
    required this.rtcMode,
    required this.signalingUrl,
  });

  factory RtcStartResult.fromMap(Map<String, dynamic> data) {
    return RtcStartResult(
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

class RtcTokenInfo {
  const RtcTokenInfo({
    required this.appId,
    required this.appKey,
    required this.roomId,
    required this.userId,
    required this.externalUserId,
    required this.role,
    required this.rtcMode,
    required this.permissions,
    required this.issuedAtEpochSeconds,
    required this.expiresAtEpochSeconds,
    required this.issuer,
    required this.subject,
    required this.tokenId,
    required this.isExpired,
  });

  factory RtcTokenInfo.fromMap(Map<String, dynamic> data) {
    return RtcTokenInfo(
      appId: data['appId']?.toString(),
      appKey: data['appKey']?.toString(),
      roomId: data['roomId']?.toString(),
      userId: data['userId']?.toString(),
      externalUserId: data['externalUserId']?.toString(),
      role: data['role']?.toString(),
      rtcMode: data['rtcMode']?.toString(),
      permissions: _stringList(data['permissions']),
      issuedAtEpochSeconds: _intOrNull(data['issuedAtEpochSeconds']),
      expiresAtEpochSeconds: _intOrNull(data['expiresAtEpochSeconds']),
      issuer: data['issuer']?.toString(),
      subject: data['subject']?.toString(),
      tokenId: data['tokenId']?.toString(),
      isExpired: data['isExpired'] == true,
    );
  }

  final String? appId;
  final String? appKey;
  final String? roomId;
  final String? userId;
  final String? externalUserId;
  final String? role;
  final String? rtcMode;
  final List<String> permissions;
  final int? issuedAtEpochSeconds;
  final int? expiresAtEpochSeconds;
  final String? issuer;
  final String? subject;
  final String? tokenId;
  final bool isExpired;
}

class RtcFlutterSdk {
  RtcFlutterSdk._();

  static const String defaultSignalingUrl = 'https://funint.online';
  static const String localVideoViewType =
      'com.rtcone.sdk/rtc_flutter_sdk/local_video_view';
  static const String remoteVideoViewType =
      'com.rtcone.sdk/rtc_flutter_sdk/remote_video_view';
  static const String defaultAppId = String.fromEnvironment(
    'RTC_APP_ID',
    defaultValue: 'android-voice-app-2',
  );
  static const String defaultAppKey = String.fromEnvironment(
    'RTC_APP_KEY',
    defaultValue: 'rtc_app_57001084b68744f0ab00edbe2d00af2f',
  );
  static const String defaultAccessToken = String.fromEnvironment(
    'RTC_ACCESS_TOKEN',
    defaultValue: '',
  );

  static const MethodChannel _channel = MethodChannel(
    'com.rtcone.sdk/rtc_flutter_sdk',
  );

  static final StreamController<RtcEvent> _events =
      StreamController<RtcEvent>.broadcast();

  static bool _initialized = false;
  static String _appId = defaultAppId;
  static String _appKey = defaultAppKey;

  static Stream<RtcEvent> get events {
    initialize();
    return _events.stream;
  }

  static void initialize({String? appId, String? appKey}) {
    if (appId?.trim().isNotEmpty == true) {
      _appId = appId!.trim();
    }

    if (appKey?.trim().isNotEmpty == true) {
      _appKey = appKey!.trim();
    }

    if (_initialized) return;

    _channel.setMethodCallHandler((call) async {
      if (call.method != 'onRtcEvent') return null;

      final event = RtcEvent.fromMethodCall(call);
      _events.add(event);
      return null;
    });

    _initialized = true;
  }

  static Future<RtcStartResult> start({
    String? appId,
    String? appKey,
    String? accessToken,
    String? roomId,
    String signalingUrl = defaultSignalingUrl,
    String? rtcMode,
    bool speakerOn = true,
  }) async {
    initialize(appId: appId, appKey: appKey);
    _ensureAndroid();

    final token = accessToken?.trim().isNotEmpty == true
        ? accessToken!.trim()
        : defaultAccessToken;

    if (token.isEmpty) {
      throw StateError(
        'RTC access token is required. Issue a short-lived token from the dashboard/backend.',
      );
    }

    final raw = await _channel.invokeMethod<Object?>('start', {
      'appId': _appId,
      'appKey': _appKey,
      'accessToken': token,
      'roomId': roomId?.trim(),
      'signalingUrl': signalingUrl.trim(),
      'rtcMode': rtcMode?.trim(),
      'speakerOn': speakerOn,
    });

    return RtcStartResult.fromMap(_stringMap(raw));
  }

  static Future<List<String>> requiredAndroidPermissions(
    String accessToken, {
    String? rtcMode,
  }) async {
    _ensureAndroid();
    final raw = await _channel.invokeMethod<Object?>(
      'requiredAndroidPermissions',
      {'accessToken': accessToken, 'rtcMode': rtcMode?.trim()},
    );
    return _stringList(raw);
  }

  static Future<RtcTokenInfo> parseToken(String accessToken) async {
    _ensureAndroid();
    final raw = await _channel.invokeMethod<Object?>('parseToken', {
      'accessToken': accessToken,
    });
    return RtcTokenInfo.fromMap(_stringMap(raw));
  }

  static Future<void> muteLocalAudio(bool muted) async {
    initialize();
    await _channel.invokeMethod<void>('muteLocalAudio', {'muted': muted});
  }

  static Future<void> setSpeakerphoneOn(bool enabled) async {
    initialize();
    await _channel.invokeMethod<void>('setSpeakerphoneOn', {
      'enabled': enabled,
    });
  }

  static Future<void> setLocalVideoEnabled(bool enabled) async {
    initialize();
    await _channel.invokeMethod<void>('setLocalVideoEnabled', {
      'enabled': enabled,
    });
  }

  static Future<bool> switchCamera() async {
    initialize();
    final switched = await _channel.invokeMethod<bool>('switchCamera');
    return switched ?? false;
  }

  static Future<void> setNoiseCancellationEnabled(bool enabled) async {
    initialize();
    await _channel.invokeMethod<void>('setNoiseCancellationEnabled', {
      'enabled': enabled,
    });
  }

  static Future<void> sendMessage(String text) async {
    initialize();
    await _channel.invokeMethod<void>('sendMessage', {'text': text});
  }

  static Future<void> leaveRoom() async {
    initialize();
    await _channel.invokeMethod<void>('leaveRoom');
  }

  static Future<void> release() async {
    initialize();
    await _channel.invokeMethod<void>('release');
  }

  static void _ensureAndroid() {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) {
      throw UnsupportedError('RTC Flutter SDK is currently Android-only.');
    }
  }
}

enum RtcVideoViewFit { cover, contain }

class RtcLocalVideoView extends StatelessWidget {
  const RtcLocalVideoView({
    super.key,
    this.mirror = true,
    this.fit = RtcVideoViewFit.cover,
  });

  final bool mirror;
  final RtcVideoViewFit fit;

  @override
  Widget build(BuildContext context) {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) {
      return const SizedBox.shrink();
    }

    return AndroidView(
      viewType: RtcFlutterSdk.localVideoViewType,
      layoutDirection: TextDirection.ltr,
      creationParams: <String, Object?>{'mirror': mirror, 'fit': fit.name},
      creationParamsCodec: const StandardMessageCodec(),
    );
  }
}

class RtcRemoteVideoView extends StatelessWidget {
  const RtcRemoteVideoView({
    super.key,
    this.mirror = false,
    this.fit = RtcVideoViewFit.cover,
  });

  final bool mirror;
  final RtcVideoViewFit fit;

  @override
  Widget build(BuildContext context) {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) {
      return const SizedBox.shrink();
    }

    return AndroidView(
      viewType: RtcFlutterSdk.remoteVideoViewType,
      layoutDirection: TextDirection.ltr,
      creationParams: <String, Object?>{'mirror': mirror, 'fit': fit.name},
      creationParamsCodec: const StandardMessageCodec(),
    );
  }
}

Map<String, dynamic> _stringMap(Object? raw) {
  if (raw is! Map) return <String, dynamic>{};

  return raw.map((key, value) {
    return MapEntry(key.toString(), value);
  });
}

List<String> _stringList(Object? raw) {
  if (raw is! Iterable) return <String>[];
  return raw.map((value) => value.toString()).toList(growable: false);
}

int? _intOrNull(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse(value?.toString() ?? '');
}
