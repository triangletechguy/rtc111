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

For normal audio rooms, use the audio-only helper so the SDK does not create a camera track:

```kotlin
val rtc = RtcServiceSdk(
    context = this,
    config = RtcServiceSdk.Config.audioRoom(
        signalingUrl = "https://funint.online",
        accessToken = tokenFromYourBackend,
        roomId = "room1"
    ),
    listener = object : RtcServiceSdk.Listener {
        override fun onRoomJoined(roomId: String) {
            // The service accepted the room join.
        }

        override fun onRtcConnectionIndicatorChanged(
            indicator: RtcServiceSdk.ConnectionIndicator
        ) {
            // Update connecting/in-room/waiting/connected/failed UI.
        }
    }
)

rtc.connectAndJoin()
```

One-to-one voice calls use a two-person room:

```kotlin
val rtc = RtcServiceSdk(
    context = this,
    config = RtcServiceSdk.Config.voiceCall(
        signalingUrl = "https://funint.online",
        accessToken = tokenFromYourBackend,
        roomId = "call-user-a-user-b"
    ),
    listener = listener
)

rtc.connectAndJoin()
```

Group voice rooms use one peer connection per remote participant:

```kotlin
val rtc = RtcServiceSdk(
    context = this,
    config = RtcServiceSdk.Config.groupVoice(
        signalingUrl = "https://funint.online",
        accessToken = tokenFromYourBackend,
        roomId = "group-voice-room-1"
    ),
    listener = listener
)
```

Video room helpers:

```kotlin
RtcServiceSdk.Config.videoCall(signalingUrl, accessToken, roomId)
RtcServiceSdk.Config.groupVideo(signalingUrl, accessToken, roomId)
RtcServiceSdk.Config.soloVideoLive(signalingUrl, accessToken, roomId)
RtcServiceSdk.Config.livePk(signalingUrl, accessToken, roomId)
```

Live PK and effects:

```kotlin
rtc.startLivePk(opponentUserId = "user-b")
rtc.updateLivePkScore(hostScore = 120, opponentScore = 100)
rtc.setVideoEffects(JSONObject().put("beautyEnabled", true).put("beautyLevel", 65))
rtc.setScreenShareEnabled(true)
```

The SDK synchronizes screen-share, beauty/filter/sticker/makeup, face-detect, and PK state. The host app still applies the actual Android camera/render effects pipeline.
Default video/live token helpers include `screen_share`; custom backend tokens should include that permission before calling `setScreenShareEnabled(true)`.

Security helpers:

```kotlin
rtc.checkSecurity("message or moderation text")
rtc.reportSecurityIncident(message = "Voice abuse", category = "voice_abuse", severity = "high")
```

For YouTube rooms, render YouTube in the host app and use the SDK to sync playback state:

```kotlin
rtc.joinYoutubeRoom()
rtc.setYoutubeVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ", title = "Room video")
rtc.playYoutube(positionSeconds = 0.0)
rtc.pauseYoutube(positionSeconds = 12.5)
rtc.seekYoutube(positionSeconds = 45.0)
```

Noise cancellation can be attached to a button:

```kotlin
rtc.setNoiseCancellationEnabled(true)
rtc.setNoiseCancellationEnabled(false)
```

Do not put the client API key inside the APK. The expected flow is:

1. Your backend calls `POST /client/rtc/token` with its client API key.
2. Your backend returns the short-lived `access_token` to the Android app.
3. The Android app passes that token to `RtcServiceSdk.Config`.

See `../docs/client-api.md` for the full API flow.
