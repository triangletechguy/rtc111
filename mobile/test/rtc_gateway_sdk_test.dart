import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:rtc_enterprise_mobile/sdk/rtc_gateway_client.dart';

void main() {
  group('RtcGatewayEndpoint', () {
    test('derives public gateway from an API base URL', () {
      final endpoint = RtcGatewayEndpoint.fromApiUrl(
        'https://funint.online/api',
      );

      expect(endpoint.origin, 'https://funint.online');
      expect(endpoint.path, '/api/rtc');
      expect(endpoint.metadataUrl, 'https://funint.online/api/rtc');
      expect(
        endpoint.networkConfigUrl,
        'https://funint.online/api/rtc-network-config',
      );
    });

    test('keeps reverse proxy path prefixes', () {
      final endpoint = RtcGatewayEndpoint.fromApiUrl(
        'https://example.com/tenant-a/api',
      );

      expect(endpoint.origin, 'https://example.com');
      expect(endpoint.path, '/tenant-a/api/rtc');
      expect(endpoint.metadataUrl, 'https://example.com/tenant-a/api/rtc');
    });
  });

  group('RtcGatewayClient.fromApiUrl', () {
    test('connects using the derived gateway path and auth', () async {
      final transport = _FakeGatewayTransport();
      final client = RtcGatewayClient.fromApiUrl(
        apiUrl: 'https://funint.online/api',
        clientAppId: 'client-app',
        appUserToken: 'user-token',
        deviceId: 'device-1',
        transport: transport,
      );

      await client.connect();

      expect(transport.origin, 'https://funint.online');
      expect(transport.path, '/api/rtc');
      expect(transport.auth, containsPair('clientAppId', 'client-app'));
      expect(transport.auth, containsPair('appUserToken', 'user-token'));
      expect(client.gatewayOrigin, 'https://funint.online');
      expect(client.gatewayPath, '/api/rtc');
    });

    test('sends quality samples over the command channel', () async {
      final transport = _FakeGatewayTransport();
      final client = RtcGatewayClient.fromApiUrl(
        apiUrl: 'https://funint.online/api',
        clientAppId: 'client-app',
        appUserToken: 'user-token',
        deviceId: 'device-1',
        transport: transport,
      );

      final event = await client.sendQualitySample(
        const RtcGatewayQualitySampleRequest(
          roomId: 44,
          externalUserId: 'company-user-1',
          sessionId: 7001,
          quality: 'good',
          peerCount: 2,
          measuredPeerCount: 2,
          peerStates: {'connected': 2},
        ),
      );

      expect(event.type, 'quality.recorded');
      expect(transport.commands, hasLength(1));
      final command = transport.commands.single;
      expect(command['type'], 'quality.sample');
      final payload = Map<String, Object?>.from(command['payload'] as Map);
      expect(payload['roomId'], 44);
      expect(payload['externalUserId'], 'company-user-1');
      expect(payload['sessionId'], 7001);
      expect(payload['quality'], 'good');
      expect(payload['peerCount'], 2);
    });
  });
}

class _FakeGatewayTransport implements RtcGatewayTransport {
  final _events = StreamController<RtcGatewayEvent>.broadcast();
  bool connected = false;
  String? origin;
  String? path;
  Map<String, Object?> auth = const {};
  final commands = <Map<String, Object?>>[];

  @override
  Stream<RtcGatewayEvent> get events => _events.stream;

  @override
  bool get isConnected => connected;

  @override
  Future<void> connect({
    required String origin,
    required String path,
    required Map<String, Object?> auth,
    required List<String> transports,
    required Duration timeout,
  }) async {
    this.origin = origin;
    this.path = path;
    this.auth = auth;
    connected = true;
  }

  @override
  void emitCommand(Map<String, Object?> command) {
    commands.add(Map<String, Object?>.from(command));
    if (command['type'] != 'quality.sample') return;

    scheduleMicrotask(() {
      if (_events.isClosed) return;
      _events.add(
        RtcGatewayEvent(
          type: 'quality.recorded',
          requestId: command['requestId']?.toString(),
          payload: const {
            'sample': {
              'id': 9101,
              'quality': 'good',
              'participantStatus': 'online',
            },
          },
        ),
      );
    });
  }

  @override
  Future<void> disconnect() async {
    connected = false;
    await _events.close();
  }
}
