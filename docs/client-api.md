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

## 3. Android SDK Usage

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
            rtc.joinRoom()
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
rtc.connect()
```

## 4. Build SDK And APK

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
- `GET /admin/apps/:appId`
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

Socket.IO clients authenticate with:

```json
{
  "auth": {
    "token": "RTC_ACCESS_TOKEN"
  }
}
```
