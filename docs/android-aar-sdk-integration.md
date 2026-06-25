# Android AAR SDK Integration

This guide shows how to integrate the RTC Android SDK AAR into a client Android app and connect with a short-lived RTC access token.

## Integration Flow

1. The platform admin creates a client app and client API key.
2. The client backend stores the client API key securely.
3. The Android app asks the client backend for an RTC token.
4. The client backend calls `POST /client/rtc/token`.
5. The Android app passes the returned `access_token` to `RtcServiceSdk.Config`.

Do not put the client API key in the APK. The APK should only receive short-lived RTC access tokens.

## Build The SDK AAR

From this repository:

```bash
cd rtc-android-sdk
./gradlew :rtc-default-sdk:assembleRelease
```

Output:

```text
rtc-android-sdk/rtc-default-sdk/build/outputs/aar/rtc-default-sdk-release.aar
```

The SDK package exposed by the AAR is:

```kotlin
import com.rtcone.sdk.RtcServiceSdk
```

## Add The AAR To The Android App

Copy the release AAR into the client Android app:

```text
app/libs/rtc-default-sdk-release.aar
```

In the client app module Gradle file, add the local AAR and runtime dependencies. Local AAR files do not bring a Maven POM with transitive dependencies, so the host app must include WebRTC and Socket.IO explicitly.

Kotlin DSL:

```kotlin
android {
    compileSdk = 36

    defaultConfig {
        minSdk = 23
    }
}

dependencies {
    implementation(files("libs/rtc-default-sdk-release.aar"))
    implementation("io.github.webrtc-sdk:android:144.7559.09")
    implementation("io.socket:socket.io-client:2.1.2") {
        exclude(group = "org.json", module = "json")
    }
}
```

Groovy DSL:

```groovy
android {
    compileSdk 36

    defaultConfig {
        minSdk 23
    }
}

dependencies {
    implementation files("libs/rtc-default-sdk-release.aar")
    implementation "io.github.webrtc-sdk:android:144.7559.09"
    implementation("io.socket:socket.io-client:2.1.2") {
        exclude group: "org.json", module: "json"
    }
}
```

Make sure the Android project has `google()` and `mavenCentral()` in its repositories.

## Permissions

The AAR manifest declares:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

The host app still needs to request runtime camera and microphone permissions before starting video or audio.

```kotlin
private val requestRtcPermissions =
    registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        val cameraGranted = result[Manifest.permission.CAMERA] == true
        val micGranted = result[Manifest.permission.RECORD_AUDIO] == true

        if (cameraGranted && micGranted) {
            startRtc()
        }
    }

private fun requestPermissionsThenStart() {
    requestRtcPermissions.launch(
        arrayOf(
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO
        )
    )
}
```

Audio-only rooms only require microphone permission at runtime.

## Issue A Token From The Client Backend

The Android app should call the client backend with the user's normal app session. The client backend then calls the RTC platform with its private client API key:

```bash
curl -X POST https://funint.online/client/rtc/token \
  -H "Authorization: Bearer CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "external_user_id": "user-123",
    "room_id": "support-room-1",
    "role": "publisher",
    "rtc_mode": "video",
    "permissions": ["join", "publish_audio", "publish_video", "screen_share", "chat", "signal"]
  }'
```

Important response fields:

```json
{
  "access_token": "JWT_TOKEN",
  "token_type": "Bearer",
  "expires_in": "1h",
  "room_id": "support-room-1",
  "user_id": "user-123",
  "rtc_mode": "video",
  "permissions": ["join", "publish_audio", "publish_video", "screen_share", "chat", "signal"]
}
```

Return only `access_token` and the room metadata needed by the Android app.

The token is checked during the Socket.IO/WebRTC signaling connection. If the token expires or is revoked, fetch a fresh token from the client backend and create a new `RtcServiceSdk` instance with the new token.

## Start A Video Room

Create or reference two `SurfaceViewRenderer` views for local and remote video. Then initialize the SDK with the signaling URL, token, room id, and listener callbacks.

```kotlin
import com.rtcone.sdk.RtcServiceSdk
import org.webrtc.MediaStream
import org.webrtc.SurfaceViewRenderer

private var rtc: RtcServiceSdk? = null

private lateinit var localRenderer: SurfaceViewRenderer
private lateinit var remoteRenderer: SurfaceViewRenderer

private fun startRtc() {
    val accessToken = tokenFromYourBackend
    val roomId = "support-room-1"

    val nextRtc = RtcServiceSdk(
        context = this,
        config = RtcServiceSdk.Config.videoCall(
            signalingUrl = "https://funint.online",
            accessToken = accessToken,
            roomId = roomId
        ),
        listener = object : RtcServiceSdk.Listener {
            override fun onConnected(socketId: String) {
                // Signaling socket connected.
            }

            override fun onRoomJoined(roomId: String) {
                // The backend accepted the room join.
            }

            override fun onLocalStream(stream: MediaStream) {
                // Local media is ready.
            }

            override fun onRemoteStream(stream: MediaStream) {
                // Remote media is attached by the SDK when renderers are provided.
            }

            override fun onRtcConnectionIndicatorChanged(
                indicator: RtcServiceSdk.ConnectionIndicator
            ) {
                // Update UI for CONNECTING, IN_ROOM, PEER_CONNECTED, FAILED, etc.
            }

            override fun onError(message: String) {
                // Show or log the connection error.
            }
        }
    )

    rtc = nextRtc
    nextRtc.attachRenderers(localRenderer, remoteRenderer)
    nextRtc.connectAndJoinVideoCall(
        roomId = roomId,
        initialEffects = RtcServiceSdk.VideoEffects.natural().toJson()
    )
}
```

## Start An Audio-Only Room

For voice rooms, issue a token with audio permissions and use the audio room config so the SDK does not create a camera track.

```kotlin
val rtc = RtcServiceSdk(
    context = this,
    config = RtcServiceSdk.Config.audioRoom(
        signalingUrl = "https://funint.online",
        accessToken = tokenFromYourBackend,
        roomId = "voice-room-1"
    ),
    listener = listener
)

rtc.connectAndJoin()
```

Token request example:

```bash
curl -X POST https://funint.online/client/rtc/token \
  -H "Authorization: Bearer CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "external_user_id": "user-123",
    "room_id": "voice-room-1",
    "role": "publisher",
    "rtc_mode": "voice",
    "permissions": ["join", "publish_audio", "chat", "signal"]
  }'
```

## Common Controls

```kotlin
rtc?.muteLocalAudio(true)
rtc?.muteLocalAudio(false)

rtc?.setLocalVideoEnabled(false)
rtc?.setLocalVideoEnabled(true)

rtc?.setSpeakerphoneOn(true)
rtc?.setNoiseCancellationEnabled(true)

rtc?.sendMessage("Hello")
rtc?.leaveRoom()
```

For screen share, the host app must request Android `MediaProjection` permission, then pass the result data into the SDK:

```kotlin
rtc?.startScreenShare(resultData, mediaProjectionCallback)
rtc?.stopScreenShare()
```

The token must include `screen_share` permission for screen sharing.

## Lifecycle

Release the SDK when the call screen is closed:

```kotlin
override fun onDestroy() {
    rtc?.leaveRoom()
    rtc?.release()
    rtc = null
    super.onDestroy()
}
```

If the user leaves the room but stays on the screen, call `leaveRoom()`. If the screen is finished or a new token is needed, call `release()` and create a new SDK instance.

## Troubleshooting

- `Access token must be provided`: the Android app passed a blank token. Fetch `access_token` from the client backend before creating `RtcServiceSdk`.
- `RTC token is required`: the SDK could not authenticate the signaling socket. Confirm the token is passed as `accessToken`.
- `Invalid or expired RTC token`: request a new token from the client backend. Tokens currently expire after `1h`.
- `RTC token room does not match saved token`: the token was issued for a different `room_id` than the SDK `roomId`.
- `Connect before joining a room`: call `connectAndJoin()` or wait for `onConnected()` before calling `joinRoom()`.
- `Video is disabled in this SDK config`: the SDK was created with an audio-only config. Use `RtcServiceSdk.Config.videoCall(...)` for camera or screen share.
- No remote video: confirm both users joined the same room, both tokens include `signal`, and publishers include `publish_video` for video rooms.
- Build cannot find WebRTC or Socket.IO classes: add the explicit dependencies shown above because a local AAR import does not resolve transitive dependencies.

## Related Docs

- Full client API and SDK flow: [client-api.md](client-api.md)
- Android SDK source README: [../rtc-android-sdk/README.md](../rtc-android-sdk/README.md)
