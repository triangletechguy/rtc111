import 'rtc_gateway_client.dart';
import 'rtc_gateway_voice_session.dart';

export 'rtc_gateway_client.dart';
export 'rtc_gateway_voice_session.dart';

class RtcGatewayServices {
  RtcGatewayServices._({required this.client, required this.voice});

  factory RtcGatewayServices.fromApiUrl({
    required String apiUrl,
    required String clientAppId,
    required String appUserToken,
    String? deviceId,
    String platform = 'flutter',
    RtcGatewayTransport? transport,
    RtcGatewayMediaService? media,
    GatewayPeerCoordinator? peerCoordinator,
  }) {
    final client = RtcGatewayClient.fromApiUrl(
      apiUrl: apiUrl,
      clientAppId: clientAppId,
      appUserToken: appUserToken,
      deviceId: deviceId,
      platform: platform,
      transport: transport,
    );
    return RtcGatewayServices._(
      client: client,
      voice: RtcGatewayVoiceSession(
        client: client,
        media: media,
        peerCoordinator: peerCoordinator,
      ),
    );
  }

  final RtcGatewayClient client;
  final RtcGatewayVoiceSession voice;

  Future<void> dispose() async {
    await voice.dispose();
    await client.dispose();
  }
}
