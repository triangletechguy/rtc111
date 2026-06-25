# RTC Android SDK

Standalone Android library build for the RTC Platform SDK.

This project builds the SDK from `../android-app/RtcServiceSdk.kt` and does not include the `Test-rtc` app.

For client app setup with the `.aar` file, Gradle dependencies, runtime permissions, and token flow, see `../docs/android-aar-sdk-integration.md`.

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
RtcServiceSdk.Config.oneToOneVideoCall(signalingUrl, accessToken, roomId)
RtcServiceSdk.Config.groupVideo(signalingUrl, accessToken, roomId)
RtcServiceSdk.Config.soloVideoLive(signalingUrl, accessToken, roomId)
RtcServiceSdk.Config.livePk(signalingUrl, accessToken, roomId)
RtcServiceSdk.Config.screenShare(signalingUrl, accessToken, roomId)
```

One-to-one video, solo live, Live PK, screen share, and effects:

```kotlin
rtc.connectAndJoinOneToOneVideoCall(
    roomId = "call-user-a-user-b",
    initialEffects = RtcServiceSdk.VideoEffects.natural().toJson()
)
rtc.connectAndJoinSoloVideoLive(
    roomId = "host-user-a-live",
    initialEffects = RtcServiceSdk.VideoEffects.glam().toJson()
)
rtc.startLivePk(opponentUserId = "user-b")
rtc.updateLivePkScore(hostScore = 120, opponentScore = 100)
rtc.startScreenShare(resultData, mediaProjectionCallback)
rtc.stopScreenShare()
rtc.setVideoFilter("soft")
rtc.setAiFilter("portrait")
rtc.setSticker("crown")
rtc.setFaceDetectEnabled(true)
rtc.setBeautyLevels(beautyLevel = 65, smoothingLevel = 55, whiteningLevel = 35)
rtc.setBeautyMakeup(JSONObject().put("lipstick", "rose"))
rtc.applyLiveBeautyPreset("glam")
```

The SDK synchronizes screen-share, beauty/filter/sticker/makeup, face-detect, and PK state. Use `setVideoEffectProcessor(...)` or `setCameraCapturer(...)` to plug in the app's native beauty, AI filter, sticker, makeup, and face-detection pipeline without adding UI code to the SDK. Default video/live token helpers include `screen_share`; custom backend tokens should include that permission before calling `startScreenShare(...)` or `setScreenShareEnabled(true)`.

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

Messages, comments, gifts, and room moderation are SDK calls, not UI:

```kotlin
rtc.sendMessage("Hello")
rtc.replyToMessage("msg-id", "Reply")
rtc.sendComment("Nice")
rtc.sendVoiceMessage("https://cdn.example/voice.webm", durationSeconds = 3.5)
rtc.sendImageMessage("https://cdn.example/photo.webp", caption = "Look")
rtc.unsendMessage("msg-id")
rtc.deleteMessage("msg-id", forMe = true)
rtc.sendGift("rose", "Rose", "https://cdn.example/rose.svga", assetType = "svga")

rtc.updateRoomProfile(name = "Live Room", profilePictureUrl = "https://cdn.example/room.webp")
rtc.updateRoomMicAmount(6)
rtc.setPrivateRoomPassword("123456")
rtc.setRoomTheme(JSONObject().put("primary", "#ff4081"))
rtc.setRoomAnnouncement("Welcome")
rtc.updateRoomAdmins(admins = JSONArray().put("mod-user-id"))
rtc.kickUserFromRoom(targetUserId = "bad-user", reason = "spam", durationSeconds = 600)
rtc.cleanComments()
rtc.muteUserMic(targetUserId = "user-123")
rtc.setChatBan(targetUserId = "user-123", enabled = true)
rtc.blockUser("user-456")
rtc.unblockUser("user-456")
rtc.likeRoom()
rtc.shareRoom("copy_link")
```

Company-wise billing is handled by the backend/admin API from recorded RTC sessions, not by the Android UI or a payment gateway. Use `GET /admin/billing/companies`, `GET /admin/apps/:appId/billing`, or `GET /client/billing/usage`; set `RTC_BILLING_RATE_PER_MINUTE` only when estimated currency totals are needed.

Do not put the client API key inside the APK. The expected flow is:

1. Your backend calls `POST /client/rtc/token` with its client API key.
2. Your backend returns the short-lived `access_token` to the Android app.
3. The Android app passes that token to `RtcServiceSdk.Config`.

See `../docs/client-api.md` for the full API flow.
