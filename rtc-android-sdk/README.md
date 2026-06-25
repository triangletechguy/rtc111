# RTC Android SDK

Standalone Android library build for the RTC Platform SDK.

This project builds the SDK from `../android-app/RtcServiceSdk.kt` and does not include the `Test-rtc` app.

## Build

```bash
./gradlew :rtc-default-sdk:assembleRelease
```

Output:

```text
rtc-default-sdk/build/outputs/aar/rtc-default-sdk-release.aar
```

## Runtime Endpoint

Use the deployed signaling URL and an RTC access token returned by your backend:

```kotlin
RtcServiceSdk.Config(
    signalingUrl = "https://funint.online",
    accessToken = tokenFromYourBackend,
    roomId = "room1"
)
```

Do not put the client API key inside the APK. The expected flow is:

1. Your backend calls `POST /client/rtc/token` with its client API key.
2. Your backend returns the short-lived `access_token` to the Android app.
3. The Android app passes that token to `RtcServiceSdk.Config`.

See `../docs/client-api.md` for the full API flow.
