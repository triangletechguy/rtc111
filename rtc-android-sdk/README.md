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

Use the deployed signaling URL:

```kotlin
RtcServiceSdk.Config(
    signalingUrl = "https://funint.online",
    accessToken = tokenFromDashboard,
    roomId = "room1"
)
```
