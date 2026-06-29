class AppConfig {
  static const _defaultApiBaseUrl = 'https://funint.online/api';

  static const appName = String.fromEnvironment(
    'APP_NAME',
    defaultValue: 'TalkEachOther',
  );

  static const _apiBaseUrlOverride = String.fromEnvironment('API_BASE_URL');
  static const _apiUrlOverride = String.fromEnvironment('API_URL');
  static const _rtcApiUrlOverride = String.fromEnvironment('RTC_API_URL');
  static const _isProduct = bool.fromEnvironment('dart.vm.product');
  static const _rtcSdkTokenOverride = String.fromEnvironment('RTC_SDK_TOKEN');
  static const _rtcClientApiKeyOverride = String.fromEnvironment(
    'RTC_CLIENT_API_KEY',
  );
  static const _debugLocalRtcClientApiKey = String.fromEnvironment(
    'DEBUG_LOCAL_RTC_CLIENT_API_KEY',
    defaultValue: '',
  );
  static const _rtcGatewayClientAppIdOverride = String.fromEnvironment(
    'RTC_GATEWAY_CLIENT_APP_ID',
    defaultValue: '',
  );
  static const _rtcGatewayAppUserTokenOverride = String.fromEnvironment(
    'RTC_GATEWAY_APP_USER_TOKEN',
    defaultValue: '',
  );
  static const _rtcSignalingUrlOverride = String.fromEnvironment(
    'RTC_SIGNALING_URL',
    defaultValue: '',
  );

  static const nativeAndroidRtcEnabled = bool.fromEnvironment(
    'RTC_NATIVE_AAR_ENABLED',
    defaultValue: true,
  );

  static const rtcAppId = String.fromEnvironment(
    'RTC_APP_ID',
    defaultValue: 'talkeachother',
  );

  static const rtcAppKey = String.fromEnvironment(
    'RTC_APP_KEY',
    defaultValue: 'rtc_app_c9a72939d44648fe86c9fbff62e5250b',
  );

  static String get apiBaseUrl => _normalizeApiBaseUrl(
    _firstNonEmpty([
      _apiBaseUrlOverride,
      _apiUrlOverride,
      _rtcApiUrlOverride,
      _defaultApiBaseUrl,
    ]),
  );

  static String get signalingUrl => apiOriginUrl;

  static String get apiOriginUrl => _originFromApiBaseUrl(apiBaseUrl);

  static String get rtcGatewayOrigin => apiOriginUrl;

  static String get rtcGatewayPath => '/api/rtc';

  static String get rtcNetworkConfigPath => '/rtc-network-config';

  static String get rtcApiBaseUrl =>
      _normalizeApiBaseUrl(_firstNonEmpty([_rtcApiUrlOverride, apiBaseUrl]));

  static String get rtcGatewayApiUrl => rtcApiBaseUrl;

  static String get rtcSignalingUrl {
    final explicit = _rtcSignalingUrlOverride.trim();
    if (explicit.isNotEmpty) return _trimTrailingSlashes(explicit);
    return apiOriginUrl;
  }

  static String get rtcGatewayClientAppId {
    final explicit = _rtcGatewayClientAppIdOverride.trim();
    if (explicit.isNotEmpty) return explicit;
    if (!_isProduct && _isLocalDevelopmentUrl(apiBaseUrl)) {
      return 'teo_live_accenture';
    }
    return '';
  }

  static String get rtcGatewayAppUserToken =>
      _rtcGatewayAppUserTokenOverride.trim();

  static String get rtcSdkToken {
    final explicit = _rtcSdkTokenOverride.trim();
    return explicit;
  }

  static String get rtcClientApiKey {
    final explicit = _rtcClientApiKeyOverride.trim();
    if (explicit.isNotEmpty) return explicit;

    final debugKey = _debugLocalRtcClientApiKey.trim();
    if (!_isProduct &&
        debugKey.isNotEmpty &&
        _isLocalDevelopmentUrl(apiBaseUrl)) {
      return debugKey;
    }

    return '';
  }

  static void requireRtcClientCredential() {
    if (rtcSdkToken.isNotEmpty || rtcClientApiKey.trim().isNotEmpty) {
      return;
    }
    throw StateError(
      'The compatibility RTC client requires --dart-define=RTC_SDK_TOKEN=... '
      'or --dart-define=RTC_CLIENT_API_KEY=.... New API-only apps should use '
      'the RTC gateway SDK with RTC_API_URL and RTC_GATEWAY_CLIENT_APP_ID.',
    );
  }

  static String requireRtcGatewayClientAppId() {
    final appId = rtcGatewayClientAppId.trim();
    if (appId.isEmpty) {
      throw StateError(
        'RTC_GATEWAY_CLIENT_APP_ID is required for API-only gateway RTC.',
      );
    }
    return appId;
  }

  static String requireRtcGatewayAppUserToken({String fallback = ''}) {
    final token = rtcGatewayAppUserToken.isNotEmpty
        ? rtcGatewayAppUserToken
        : fallback.trim();
    if (token.isEmpty) {
      throw StateError(
        'RTC_GATEWAY_APP_USER_TOKEN is required for API-only gateway RTC.',
      );
    }
    return token;
  }

  static void requireRtcGatewayAuth({String appUserToken = ''}) {
    requireRtcGatewayClientAppId();
    requireRtcGatewayAppUserToken(fallback: appUserToken);
  }

  static String rtcGatewayAppUserTokenOr(String fallback) {
    return rtcGatewayAppUserToken.isNotEmpty
        ? rtcGatewayAppUserToken
        : fallback.trim();
  }

  static Never legacySignalingOverrideRemoved() {
    throw UnsupportedError(
      'SIGNALING_URL is no longer part of API-only RTC builds. Use API_URL or '
      'RTC_API_URL and the gateway path /api/rtc.',
    );
  }

  static String requireRtcClientApiKey() {
    if (rtcClientApiKey.trim().isEmpty) {
      throw StateError(
        'RTC_CLIENT_API_KEY is required. Pass it with '
        '--dart-define=RTC_CLIENT_API_KEY=...',
      );
    }
    return rtcClientApiKey;
  }

  static bool _isLocalDevelopmentUrl(String value) {
    final uri = Uri.tryParse(value);
    final host = uri?.host.toLowerCase();
    return host == '10.0.2.2' ||
        host == '10.0.3.2' ||
        host == '127.0.0.1' ||
        host == 'localhost';
  }

  static String _firstNonEmpty(List<String> values) {
    for (final value in values) {
      final trimmed = value.trim();
      if (trimmed.isNotEmpty) return trimmed;
    }
    return '';
  }

  static String _normalizeApiBaseUrl(String value) {
    final trimmed = _trimTrailingSlashes(value.trim());
    final uri = Uri.tryParse(trimmed);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) return trimmed;

    final path = _trimTrailingSlashes(uri.path);
    if (path.isEmpty || path == '/') {
      return uri.replace(path: '/api', query: null, fragment: null).toString();
    }

    return uri.replace(path: path, query: null, fragment: null).toString();
  }

  static String _originFromApiBaseUrl(String value) {
    final normalized = _trimTrailingSlashes(value.trim());
    final uri = Uri.tryParse(normalized);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      return normalized.replaceFirst(RegExp(r'/api$'), '');
    }

    final segments = uri.pathSegments.toList();
    if (segments.isNotEmpty && segments.last == 'api') {
      segments.removeLast();
    }
    final path = segments.isEmpty ? '' : '/${segments.join('/')}';
    return _trimTrailingSlashes(
      uri.replace(path: path, query: null, fragment: null).toString(),
    );
  }

  static String _trimTrailingSlashes(String value) {
    return value.replaceFirst(RegExp(r'/+$'), '');
  }
}
