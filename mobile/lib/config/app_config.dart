class AppConfig {
  static const appName = String.fromEnvironment(
    'APP_NAME',
    defaultValue: 'TalkEachOther',
  );
}
