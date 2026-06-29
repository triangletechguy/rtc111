import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rtc_enterprise_mobile/sdk/rtc_enterprise_client_sdk.dart';

void main() {
  test('issues RTC tokens through the client API', () async {
    final adapter = _MockHttpAdapter((options) {
      expect(options.method, 'POST');
      expect(options.uri.path, '/api/client/rtc/token');
      expect(options.headers['x-rtc-api-key'], 'client-key');
      expect(options.data, isA<Map>());

      final body = Map<String, dynamic>.from(options.data as Map);
      expect(body['external_user_id'], 'company-user-1');
      expect(body['room_id'], 44);
      expect(body['role'], 'admin');
      expect(body['rtc_mode'], 'video');

      return _MockResponse.ok({
        'rtc_token': 'rtc-token',
        'local_uid': 908,
        'expires_in': 900,
        'expires_at': '2026-06-17T12:00:00.000Z',
        'room': {
          'id': 44,
          'signaling_room': 'webrtc_tenant_1_room_44',
          'rtc_profile': {
            'channel_profile': 'live_broadcasting',
            'media_type': 'video',
          },
        },
        'external_user': {'external_user_id': 'company-user-1'},
      });
    });
    final sdk = _sdk(adapter);

    final token = await sdk.issueRtcToken(
      const RtcTokenRequest(
        externalUserId: 'company-user-1',
        roomId: 44,
        role: RtcRoomRole.roomAdmin,
        rtcMode: 'video',
      ),
    );

    expect(token.rtcToken, 'rtc-token');
    expect(token.signalingRoom, 'webrtc_tenant_1_room_44');
    expect(token.roomId, 44);
    expect(token.localUid, 908);
    expect(token.channelProfile, 'live_broadcasting');
    expect(token.mediaType, 'video');
  });

  test('maps client API errors to typed exceptions', () async {
    final adapter = _MockHttpAdapter((_) {
      return const _MockResponse(422, {
        'code': 'permission_denied',
        'message': 'Check RTC token payload.',
        'errors': {'room_id': 'room_id must be a positive integer.'},
      });
    });
    final sdk = _sdk(adapter);

    await expectLater(
      sdk.issueRtcToken(
        const RtcTokenRequest(externalUserId: 'company-user-1', roomId: 0),
      ),
      throwsA(
        isA<RtcClientApiException>()
            .having((error) => error.statusCode, 'statusCode', 422)
            .having((error) => error.code, 'code', 'permission_denied')
            .having(
              (error) => error.errors['room_id'],
              'room_id error',
              'room_id must be a positive integer.',
            ),
      ),
    );
  });

  test('updates RTC media state through the client API', () async {
    final adapter = _MockHttpAdapter((options) {
      expect(options.method, 'POST');
      expect(options.uri.path, '/api/client/rtc/session/media-state');
      expect(options.headers['x-rtc-api-key'], 'client-key');

      final body = Map<String, dynamic>.from(options.data as Map);
      expect(body['external_user_id'], 'company-user-1');
      expect(body['room_id'], 44);
      expect(body['session_id'], 7001);
      expect(body['role'], 'publisher');
      expect(body['rtc_mode'], 'video');
      expect(body['mic_enabled'], isFalse);
      expect(body['camera_enabled'], isTrue);
      expect(body['screen_shared'], isFalse);

      return _MockResponse.ok({
        'participant': {
          'id': 8001,
          'session_id': 7001,
          'mic_enabled': 0,
          'camera_enabled': 1,
          'screen_shared': 0,
        },
        'rtc': {
          'mic_enabled': false,
          'camera_enabled': true,
          'screen_shared': false,
        },
      });
    });
    final sdk = _sdk(adapter);

    final state = await sdk.updateMediaState(
      const RtcMediaStateRequest(
        externalUserId: 'company-user-1',
        roomId: 44,
        sessionId: 7001,
        rtcMode: 'video',
        microphoneEnabled: false,
        cameraEnabled: true,
        screenShared: false,
      ),
    );

    expect(state.participant['id'], 8001);
    expect(state.microphoneEnabled, isFalse);
    expect(state.cameraEnabled, isTrue);
    expect(state.screenShared, isFalse);
  });

  test('sends RTC quality samples through the client API', () async {
    final adapter = _MockHttpAdapter((options) {
      expect(options.method, 'POST');
      expect(options.uri.path, '/api/client/rtc/session/quality');
      expect(options.headers['x-rtc-api-key'], 'client-key');

      final body = Map<String, dynamic>.from(options.data as Map);
      expect(body['external_user_id'], 'company-user-1');
      expect(body['room_id'], 44);
      expect(body['session_id'], 7001);
      expect(body['quality'], 'degraded');
      expect(body['peer_count'], 3);
      expect(body['measured_peer_count'], 2);
      expect(body['packet_loss_pct'], 2.5);
      expect(
        Map<String, dynamic>.from(body['peer_states'] as Map),
        containsPair('connected', 2),
      );

      return _MockResponse.ok({
        'sample': {
          'id': 9101,
          'quality': 'degraded',
          'participantStatus': 'degraded',
        },
      });
    });
    final sdk = _sdk(adapter);

    final result = await sdk.sendQualitySample(
      const RtcQualitySampleRequest(
        externalUserId: 'company-user-1',
        roomId: 44,
        sessionId: 7001,
        quality: 'degraded',
        peerCount: 3,
        measuredPeerCount: 2,
        packetLossPct: 2.5,
        peerStates: {'connected': 2},
      ),
    );

    expect(result.sampleId, 9101);
    expect(result.quality, 'degraded');
    expect(result.participantStatus, 'degraded');
  });

  test('verifies integration with sdk token header', () async {
    final adapter = _MockHttpAdapter((options) {
      expect(options.method, 'GET');
      expect(options.uri.path, '/api/client/me');
      expect(options.headers['x-rtc-sdk-token'], 'sdk-token');
      expect(options.headers.containsKey('x-rtc-api-key'), isFalse);

      return _MockResponse.ok({
        'integration_status': 'ready',
        'auth': 'sdk_token',
        'app': {'name': 'Client Mobile'},
        'tenant': {'name': 'Acme RTC'},
      });
    });
    final dio = Dio(
      BaseOptions(
        baseUrl: 'https://rtc.test/api',
        headers: const {'Accept': 'application/json'},
      ),
    )..httpClientAdapter = adapter;
    final sdk = RtcEnterpriseClientSdk(
      apiBaseUrl: 'https://rtc.test/api',
      sdkToken: ' sdk-token ',
      dio: dio,
    );

    final result = await sdk.verifyIntegration();

    expect(result['integration_status'], 'ready');
    expect(result['auth'], 'sdk_token');
  });

  test('fetches ICE and TURN config for mobile peer connections', () async {
    final adapter = _MockHttpAdapter((options) {
      expect(options.method, 'GET');
      expect(options.uri.path, '/api/rtc-network-config');
      expect(options.headers['x-rtc-api-key'], 'client-key');

      return _MockResponse.ok({
        'iceServers': [
          {
            'urls': ['stun:stun.l.google.com:19302'],
          },
          {
            'urls': [
              'turn:funint.online:3478?transport=udp',
              'turns:funint.online:5349?transport=tcp',
            ],
            'username': '12345:rtc',
            'credential': 'secret',
          },
        ],
        'iceTransportPolicy': 'all',
        'turnConfigured': true,
        'turnCredentialType': 'ephemeral',
        'turnExpiresAt': 12345,
        'turnTtlSeconds': 3600,
      });
    });
    final sdk = _sdk(adapter);

    final config = await sdk.getRtcConfig();

    expect(config.turnConfigured, isTrue);
    expect(config.iceServers, hasLength(2));
    expect(config.iceServers.last.username, '12345:rtc');

    final peerConfig = config.toPeerConnectionConfiguration();
    final iceServers = peerConfig['iceServers'] as List<Object?>;
    expect(iceServers, hasLength(2));
    expect(
      iceServers.last,
      containsPair('urls', [
        'turn:funint.online:3478?transport=udp',
        'turns:funint.online:5349?transport=tcp',
      ]),
    );
  });

  test('falls back to legacy RTC config path for older backends', () async {
    final seenPaths = <String>[];
    final adapter = _MockHttpAdapter((options) {
      seenPaths.add(options.uri.path);
      if (options.uri.path == '/api/rtc-network-config') {
        return const _MockResponse(404, {'message': 'Route not found'});
      }
      expect(options.uri.path, '/api/rtc/config');

      return _MockResponse.ok({
        'iceServers': [
          {
            'urls': ['stun:stun.l.google.com:19302'],
          },
        ],
        'iceTransportPolicy': 'all',
        'turnConfigured': false,
      });
    });
    final sdk = _sdk(adapter);

    final config = await sdk.getRtcConfig();

    expect(seenPaths, ['/api/rtc-network-config', '/api/rtc/config']);
    expect(config.iceServers, hasLength(1));
    expect(config.turnConfigured, isFalse);
  });
}

RtcEnterpriseClientSdk _sdk(_MockHttpAdapter adapter) {
  final dio = Dio(
    BaseOptions(
      baseUrl: 'https://rtc.test/api',
      headers: const {'Accept': 'application/json'},
    ),
  )..httpClientAdapter = adapter;

  return RtcEnterpriseClientSdk(
    apiBaseUrl: 'https://rtc.test/api',
    apiKey: ' client-key ',
    dio: dio,
  );
}

class _MockHttpAdapter implements HttpClientAdapter {
  _MockHttpAdapter(this.handler);

  final FutureOr<_MockResponse> Function(RequestOptions options) handler;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final response = await handler(options);
    return ResponseBody.fromString(
      jsonEncode(response.body),
      response.statusCode,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class _MockResponse {
  const _MockResponse(this.statusCode, this.body);

  _MockResponse.ok(this.body) : statusCode = 200;

  final int statusCode;
  final Object? body;
}
