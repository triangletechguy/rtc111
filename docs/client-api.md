# RTC Client API Integration

This project lets a client integrate their own app with the RTC service, receive short-lived RTC access tokens, and build an Android APK that connects through the provided SDK.

## Services

- Backend API and Socket.IO signaling: `http://localhost:4000`
- Default platform admin key: `rtc-admin-dev-key`
- Default local client API key: `rtc-dev-api-key`

Set these for deployed environments:

```bash
export RTC_ADMIN_KEY="change-this-admin-key"
export RTC_API_KEY="change-this-default-client-key"
export RTC_TOKEN_SECRET="change-this-token-secret"
export RTC_BILLING_RATE_PER_MINUTE="0"
```

## 1. Create A Client App

Use the platform admin key to create an app for a customer/client. The response includes a client API key. Show or store this API key only once.

```bash
curl -X POST http://localhost:4000/admin/apps \
  -H "Authorization: Bearer rtc-admin-dev-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Android App",
    "package_name": "com.acme.video",
    "allowed_origins": ["https://acme.example"],
    "metadata": {
      "plan": "development"
    }
  }'
```

Important response fields:

```json
{
  "app": {
    "app_id": "acme-android-app",
    "name": "Acme Android App"
  },
  "api_key": "rtc_..."
}
```

## 2. Client Server Issues RTC Tokens

The client API key should be used from the client's backend, not hard-coded inside the APK. The Android app should request an RTC token from the client's backend, and that backend should call this RTC Platform API.

Sync or create a user:

```bash
curl -X POST http://localhost:4000/client/users/sync \
  -H "Authorization: Bearer CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "external_user_id": "user-123",
    "name": "Riya",
    "email": "riya@example.com"
  }'
```

Create a room:

```bash
curl -X POST http://localhost:4000/client/rooms \
  -H "Authorization: Bearer CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "room_id": "support-room-1",
    "name": "Support Room 1",
    "room_type": "video",
    "max_participants": 8
  }'
```

Issue an RTC token for the mobile app:

```bash
curl -X POST http://localhost:4000/client/rtc/token \
  -H "Authorization: Bearer CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "external_user_id": "user-123",
    "room_id": "support-room-1",
    "role": "publisher",
    "rtc_mode": "video",
    "permissions": ["join", "publish_audio", "publish_video", "chat", "signal"]
  }'
```

Send the returned `access_token` to the Android app.

## 3. Normal Audio Room SDK

Create audio rooms with `room_type: "voice"` and issue tokens with audio permissions only:

```bash
curl -X POST http://localhost:4000/client/rtc/token \
  -H "Authorization: Bearer CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "external_user_id": "user-123",
    "room_id": "support-room-1",
    "role": "publisher",
    "rtc_mode": "voice",
    "permissions": ["join", "publish_audio", "chat", "signal"]
  }'
```

Android audio-only join:

```kotlin
lateinit var rtc: RtcServiceSdk

rtc = RtcServiceSdk(
    context = this,
    config = RtcServiceSdk.Config.audioRoom(
        signalingUrl = "https://your-rtc-domain.example",
        accessToken = tokenFromYourBackend,
        roomId = "support-room-1"
    ),
    listener = object : RtcServiceSdk.Listener {
        override fun onRoomJoined(roomId: String) {
            // The backend accepted the join.
        }

        override fun onRtcConnectionIndicatorChanged(
            indicator: RtcServiceSdk.ConnectionIndicator
        ) {
            // Show connecting, in-room, waiting-for-peer, peer-connected, or failed.
        }

        override fun onRoomError(message: String) {
            // Show or log the room error.
        }
    }
)

rtc.connectAndJoin()
```

The SDK also exposes `rtc.joinAudioRoom(roomId)` when you already created a connected SDK instance.

## 4. One-To-One Voice Calling

Use `rtc_mode: "voice_call"` for private one-to-one voice rooms. The service caps these rooms at two participants and two microphone seats even if a larger capacity is sent by mistake.

```bash
curl -X POST http://localhost:4000/client/rtc/token \
  -H "Authorization: Bearer CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "external_user_id": "caller-123",
    "room_id": "call-user-123-user-456",
    "role": "publisher",
    "rtc_mode": "voice_call",
    "permissions": ["join", "publish_audio", "chat", "signal"]
  }'
```

Android:

```kotlin
val rtc = RtcServiceSdk(
    context = this,
    config = RtcServiceSdk.Config.voiceCall(
        signalingUrl = "https://your-rtc-domain.example",
        accessToken = tokenFromYourBackend,
        roomId = "call-user-123-user-456"
    ),
    listener = object : RtcServiceSdk.Listener {
        override fun onPeerJoined(peerId: String) {
            // Remote caller is available.
        }

        override fun onRemoteStreamForPeer(peerId: String, stream: org.webrtc.MediaStream) {
            // Remote audio stream is connected.
        }
    }
)

rtc.connectAndJoin()
```

## 5. Group Voice Chat

Use `rtc_mode: "group_voice"` for audio-only rooms with multiple peers. The SDK creates one WebRTC peer connection per remote participant.

```kotlin
val rtc = RtcServiceSdk(
    context = this,
    config = RtcServiceSdk.Config.groupVoice(
        signalingUrl = "https://your-rtc-domain.example",
        accessToken = tokenFromYourBackend,
        roomId = "group-voice-room-1"
    ),
    listener = object : RtcServiceSdk.Listener {
        override fun onRemoteStreamForPeer(peerId: String, stream: org.webrtc.MediaStream) {
            // Handle each participant's remote audio stream.
        }

        override fun onParticipantUpdated(peerId: String, micEnabled: Boolean, cameraEnabled: Boolean) {
            // Update mic badges.
        }
    }
)

rtc.connectAndJoin()
```

## 6. AI Security Foundation

The service blocks synced users whose status is not `active`, records incidents, and exposes security checks/reports over Socket.IO.

```kotlin
rtc.checkSecurity("message or moderation text")
rtc.reportSecurityIncident(
    message = "User is abusing voice room",
    category = "voice_abuse",
    targetUserId = "user-456",
    severity = "high"
)
```

Listen with:

```kotlin
override fun onSecurityChecked(result: org.json.JSONObject) {}
override fun onSecurityIncident(incident: org.json.JSONObject) {}
```

Client backends can inspect recent incidents with `GET /client/security/incidents`.

## 7. Video SDK Modes

Video rooms use the same signaling layer as voice, with one peer connection per remote participant:

```kotlin
val rtc = RtcServiceSdk(
    context = this,
    config = RtcServiceSdk.Config.groupVideo(
        signalingUrl = "https://your-rtc-domain.example",
        accessToken = tokenFromYourBackend,
        roomId = "group-video-room-1"
    ),
    listener = object : RtcServiceSdk.Listener {
        override fun onRemoteStreamForPeer(peerId: String, stream: org.webrtc.MediaStream) {}
        override fun onVideoEffectsChanged(peerId: String, effects: org.json.JSONObject) {}
    }
)

rtc.connectAndJoin()
```

Available Android helpers:

- `RtcServiceSdk.Config.videoCall(...)` and `rtc.joinVideoCall(...)` for one-to-one video calls.
- `RtcServiceSdk.Config.oneToOneVideoCall(...)` and `rtc.joinOneToOneVideoCall(...)` aliases for private one-to-one video calling.
- `RtcServiceSdk.Config.groupVideo(...)` and `rtc.joinGroupVideoRoom(...)` for normal group video chat.
- `RtcServiceSdk.Config.soloVideoLive(...)` and `rtc.joinSoloVideoLive(...)` for solo live video.
- `RtcServiceSdk.Config.livePk(...)` and `rtc.joinLivePkRoom(...)` for live PK rooms.

Use `rtc_mode` values `video_call`, `group_video`, `solo_live`, or `live_pk` when issuing tokens. One-to-one video rooms are capped to two participants by the service, and the default video token helpers include `screen_share` for screen sharing.

One-to-one video with a default live beauty profile:

```kotlin
rtc.connectAndJoinOneToOneVideoCall(
    roomId = "call-user-123-user-456",
    initialEffects = RtcServiceSdk.VideoEffects.natural().toJson()
)
```

Solo live:

```kotlin
rtc.connectAndJoinSoloVideoLive(
    roomId = "host-user-123-live",
    initialEffects = RtcServiceSdk.VideoEffects.glam().toJson()
)
```

## 8. Live Video PK

Live PK state is synchronized through the room:

```kotlin
rtc.startLivePk(opponentUserId = "user-456")
rtc.updateLivePkScore(hostScore = 120, opponentScore = 100)
rtc.endLivePk()
```

Listen with:

```kotlin
override fun onLivePkStateChanged(state: org.json.JSONObject) {}
```

## 9. Screen Share

Web SDK clients can use browser screen sharing with `startScreenShare()` / `stopScreenShare()`. Android apps can start screen share with Android `MediaProjection` permission data:

```kotlin
rtc.startScreenShare(
    mediaProjectionPermissionResultData = resultData,
    mediaProjectionCallback = mediaProjectionCallback
)
rtc.stopScreenShare()
```

If the app owns its own screen capturer, pass it directly with `rtc.startScreenShare(screenCapturer)`. The legacy state-only helpers `rtc.setScreenShareEnabled(true)` / `false` remain available when an app replaces tracks itself. The backend requires the `screen_share` permission when enabling screen share and broadcasts `screen:state`.

## 10. Video Effects, Beauty, Stickers, And Face Detect State

The SDK synchronizes effect settings so all clients and admin panels see the active filter/beauty/sticker state:

```kotlin
rtc.setVideoEffects(
    org.json.JSONObject()
        .put("filter", "soft")
        .put("aiFilter", "portrait")
        .put("sticker", "crown")
        .put("faceDetectEnabled", true)
        .put("beautyEnabled", true)
        .put("beautyLevel", 65)
        .put("smoothingLevel", 50)
        .put("whiteningLevel", 35)
)
```

Convenience helpers:

```kotlin
rtc.setVideoFilter("soft")
rtc.setAiFilter("portrait")
rtc.setSticker("crown")
rtc.setFaceDetectEnabled(true)
rtc.setBeautyLevels(beautyLevel = 65, smoothingLevel = 55, whiteningLevel = 35)
rtc.setBeautyMakeup(org.json.JSONObject().put("lipstick", "rose").put("blush", "peach"))
rtc.applyLiveBeautyPreset("glam")
rtc.clearVideoEffects()
```

The SDK synchronizes this live-effects state and exposes `setVideoEffectProcessor(...)` plus `setCameraCapturer(...)` so the host app can plug in its native beauty, makeup, sticker, AI-filter, and face-detection pipeline without UI code in the SDK.

## 11. Messages, Comments, Gifts, And Moderation SDK

Messages/comments are sent through the signaling SDK, run through the backend AI security filter, and support replies, unsend/delete, voice, and image payloads:

```kotlin
rtc.sendMessage("Hello room")
rtc.replyToMessage(messageId = "msg-id", text = "Reply text")
rtc.sendComment("Nice stream")
rtc.replyToComment(messageId = "comment-id", text = "Reply comment")
rtc.sendVoiceMessage(mediaUrl = "https://cdn.example/voice.webm", durationSeconds = 4.2)
rtc.sendImageMessage(mediaUrl = "https://cdn.example/photo.webp", caption = "Look")
rtc.unsendMessage("msg-id")
rtc.deleteMessage("msg-id", forMe = true)
```

Gift sending accepts animated/static assets including `svga`, `svg`, `png`, `jpg`, `webp`, `gif`, `json`, and `lottie`:

```kotlin
rtc.sendGift(
    giftId = "rose",
    name = "Rose",
    assetUrl = "https://cdn.example/gifts/rose.svga",
    assetType = "svga",
    quantity = 1
)
```

Room settings/admin/moderation helpers are SDK-only; host apps decide how to render controls:

```kotlin
rtc.updateRoomProfile(name = "Late Night Live", profilePictureUrl = "https://cdn.example/room.webp")
rtc.updateRoomMicAmount(6)
rtc.setPrivateRoomPassword("123456")
rtc.clearPrivateRoomPassword()
rtc.setRoomTheme(org.json.JSONObject().put("primary", "#ff4081"))
rtc.setRoomAnnouncement("Be kind. No spam.")
rtc.updateRoomAdmins(admins = org.json.JSONArray().put("mod-user-id"))
rtc.setRoomEntryNotificationEnabled(true)
rtc.likeRoom()
rtc.shareRoom("copy_link")
```

Admin/owner moderation:

```kotlin
rtc.kickUserFromRoom(targetUserId = "bad-user", reason = "spam", durationSeconds = 600)
rtc.requestKickHistory()
rtc.editKickHistory("history-id", org.json.JSONObject().put("reason", "appeal accepted").put("active", false))
rtc.cleanComments()
rtc.muteUserMic(targetUserId = "user-123", enabled = false)
rtc.setChatBan(targetUserId = "user-123", enabled = true, reason = "spam")
rtc.requestChatBanHistory()
rtc.blockUser(blockedUserId = "user-456")
rtc.unblockUser(blockedUserId = "user-456")
rtc.requestBlockedUsers()
```

Listen with `onMessageReceived`, `onMessageBlocked`, `onCommentReceived`, `onGiftReceived`, `onRoomUpdated`, `onRoomKicked`, `onRoomKickHistory`, `onParticipantMicMuted`, `onChatBanStateChanged`, and `onUserBlockUpdated`.

## 12. YouTube Room SDK

Create or token a room with `rtc_mode: "youtube"` and include `youtube_control` for hosts/admins:

```bash
curl -X POST http://localhost:4000/client/rtc/token \
  -H "Authorization: Bearer CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "external_user_id": "host-123",
    "room_id": "watch-room-1",
    "role": "publisher",
    "rtc_mode": "youtube",
    "permissions": ["join", "publish_audio", "chat", "signal", "youtube_control"]
  }'
```

Android apps render YouTube with their own player view and use the SDK to synchronize playback:

```kotlin
rtc = RtcServiceSdk(
    context = this,
    config = RtcServiceSdk.Config.audioRoom(
        signalingUrl = "https://your-rtc-domain.example",
        accessToken = tokenFromYourBackend,
        roomId = "watch-room-1"
    ),
    listener = object : RtcServiceSdk.Listener {
        override fun onYoutubeStateChanged(state: org.json.JSONObject) {
            // Read videoId, playbackState, and positionSeconds, then update your player.
        }
    }
)

rtc.connectAndJoin()
rtc.setYoutubeVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ", title = "Room video")
rtc.playYoutube(positionSeconds = 0.0)
rtc.pauseYoutube(positionSeconds = 12.5)
rtc.seekYoutube(positionSeconds = 45.0)
```

The backend broadcasts `youtube:state` to every participant in the room. Late joiners receive the latest state with `room:joined`.

## 13. Noise Cancellation Button

Android and web SDKs expose a direct toggle:

```kotlin
rtc.setNoiseCancellationEnabled(true)
rtc.setNoiseCancellationEnabled(false)
```

The Android SDK creates WebRTC audio sources with echo cancellation, auto gain control, high-pass filtering, and noise suppression constraints. If the user toggles while already connected, the SDK replaces the local audio track and renegotiates with the peer.

Room state includes `noiseCancellationEnabled` / `noise_cancellation_enabled` for each participant.

## 14. Android Video SDK Usage

Add the built SDK AAR to the client Android app, then connect using the token returned by the client's backend.

```kotlin
lateinit var rtc: RtcServiceSdk

rtc = RtcServiceSdk(
    context = this,
    config = RtcServiceSdk.Config(
        signalingUrl = "https://your-rtc-domain.example",
        accessToken = tokenFromYourBackend,
        roomId = "support-room-1",
        enableAudio = true,
        enableVideo = true
    ),
    listener = object : RtcServiceSdk.Listener {
        override fun onConnected(socketId: String) {
            // Connected to signaling.
        }

        override fun onRoomJoined(roomId: String) {
            // The backend accepted the join.
        }

        override fun onRemoteStream(stream: org.webrtc.MediaStream) {
            // Attach stream to your renderer.
        }

        override fun onError(message: String) {
            // Show or log the error.
        }
    }
)

rtc.attachRenderers(localRenderer, remoteRenderer)
rtc.connectAndJoin()
```

## 15. Company Billing And RTC Indicators

Billing is calculated from RTC sessions recorded by `POST /client/rtc/session/start`, `POST /client/rtc/session/end`, and Socket.IO room joins/leaves. No payment gateway is connected.

Platform admin company summary:

```bash
curl http://localhost:4000/admin/billing/companies \
  -H "Authorization: Bearer rtc-admin-dev-key"
```

Single app billing detail:

```bash
curl http://localhost:4000/admin/apps/acme-android-app/billing \
  -H "Authorization: Bearer rtc-admin-dev-key"
```

Client app usage:

```bash
curl http://localhost:4000/client/billing/usage \
  -H "Authorization: Bearer CLIENT_API_KEY"
```

Responses include `used_seconds`, `used_minutes`, `billable_minutes`, `active_sessions`, `estimated_amount`, and `payment_gateway: false`. Set `RTC_BILLING_RATE_PER_MINUTE` to calculate estimated bills; keep it at `0` if you only need minute totals.

Web SDK helpers:

```js
const adminBilling = await getAdminBilling();
const appBilling = await getAdminAppBilling({ appId: "acme-android-app" });
const clientUsage = await getClientBillingUsage();
```

The Web SDK emits `rtc-connection-indicator` with indicators such as `connecting`, `in_room`, `waiting_for_peer`, `peer_connecting`, `peer_connected`, `reconnecting`, `failed`, and `disconnected`.

```js
rtcClient.on("rtc-connection-indicator", ({ indicator, peerState }) => {
  console.log(indicator, peerState);
});
```

## 16. Build SDK And APK

Build the reusable RTC Android SDK:

```bash
cd rtc-android-sdk
./gradlew :rtc-default-sdk:assembleRelease
```

Output:

```text
rtc-android-sdk/rtc-default-sdk/build/outputs/aar/rtc-default-sdk-release.aar
```

After the client Android project imports this AAR and fetches RTC tokens from its backend, the client can build their APK with their normal Android build command:

```bash
./gradlew assembleRelease
```

## API Summary

Admin endpoints require:

```http
Authorization: Bearer <RTC_ADMIN_KEY>
```

- `GET /admin/apps`
- `POST /admin/apps`
- `GET /admin/billing/companies`
- `GET /admin/apps/:appId`
- `GET /admin/apps/:appId/billing`
- `POST /admin/apps/:appId/keys`
- `POST /admin/apps/:appId/keys/:keyId/revoke`

Client endpoints require:

```http
Authorization: Bearer <CLIENT_API_KEY>
```

- `GET /client/me`
- `POST /client/users/sync`
- `GET /client/rooms`
- `POST /client/rooms`
- `GET /client/rooms/:roomId`
- `POST /client/rtc/token`
- `GET /client/rtc/tokens`
- `POST /client/rtc/token/verify`
- `POST /client/rtc/token/revoke`
- `POST /client/rtc/session/start`
- `POST /client/rtc/session/end`
- `GET /client/billing/usage`

Socket.IO clients authenticate with:

```json
{
  "auth": {
    "token": "RTC_ACCESS_TOKEN"
  }
}
```
