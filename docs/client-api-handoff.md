# Client API Handoff

Use this document when you need to give a customer/client API access so they can integrate RTC service into their own app.

## What You Provide To The Client

Share these values with the client's app and backend teams:

```text
RTC_API_BASE_URL=https://funint.online
RTC_APP_ID=<client_app_id>
RTC_APP_KEY=<client_app_key>
RTC_SERVER_SECRET=<backend_only_server_secret>
RTC_CLIENT_API_KEY=<backend_only_server_secret>
```

Share these docs:

```text
docs/client-api-handoff.md
docs/api-only-integration.md
docs/android-aar-sdk-integration.md
```

Do not share:

```text
RTC_ADMIN_KEY
RTC_TOKEN_SECRET
server .env files
database/internal storage access
other clients' API keys
```

`RTC_APP_ID` and `RTC_APP_KEY` are SDK initialization values. `RTC_SERVER_SECRET` / `RTC_CLIENT_API_KEY` is for the client's backend only and must not be hard-coded inside an Android APK, iOS app, browser app, or desktop app.

## Generate An RTC Project

Run this from your platform/admin environment:

```bash
curl -X POST https://funint.online/admin/apps \
  -H "Authorization: Bearer RTC_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Client Company App",
    "package_name": "com.client.app",
    "allowed_origins": ["https://client.example"],
    "key_label": "Client production server secret"
  }'
```

Give the client these response fields:

```json
{
  "app": {
    "app_id": "client-company-app",
    "app_key": "app_...",
    "name": "Client Company App"
  },
  "server_secret": "rtc_...",
  "api_key": "rtc_..."
}
```

The client app initializes the SDK with `app_id` and `app_key`. The client backend stores `server_secret` / `api_key` as a backend secret:

```text
RTC_APP_ID=client-company-app
RTC_APP_KEY=app_...
RTC_SERVER_SECRET=rtc_...
RTC_CLIENT_API_KEY=rtc_...
RTC_API_BASE_URL=https://funint.online
```

## Client Integration Flow

The client should follow this SDK flow:

1. Developer creates an RTC project in the admin dashboard.
2. RTC Platform returns App ID, App Key, and backend-only server secret.
3. Developer installs the SDK in the mobile or web app.
4. Client app initializes the SDK with App ID and App Key.
5. Client app asks the client's backend server for an RTC token.
6. The backend authenticates the app user and calls `POST /client/rtc/token` with the server secret.
7. Client app uses the token to join an RTC room/channel.
8. Audio, video, chat, and signaling start after the room join is accepted.

The client app should not call your `/client/*` APIs directly unless it is a trusted server-side app.

## Required Client Backend Endpoints

The client can expose its own app-facing endpoint, such as:

```text
POST https://client.example/api/rtc/token
```

That endpoint authenticates the app user using the client's normal login/session and then calls your RTC Platform API:

```bash
curl -X POST https://funint.online/client/rtc/token \
  -H "Authorization: Bearer RTC_SERVER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "app_id": "client-company-app",
    "app_key": "app_...",
    "external_user_id": "user-123",
    "room_id": "support-room-1",
    "role": "publisher",
    "rtc_mode": "video",
    "permissions": ["join", "publish_audio", "publish_video", "chat", "signal"]
  }'
```

Then the client backend returns a safe app-facing response:

```json
{
  "accessToken": "JWT_TOKEN",
  "expiresAt": "<ISO_EXPIRES_AT>",
  "appId": "client-company-app",
  "appKey": "app_...",
  "roomId": "support-room-1",
  "rtcMode": "video"
}
```

## Minimal API Calls

### 1. Verify API Key

```bash
curl https://funint.online/client/me \
  -H "Authorization: Bearer RTC_CLIENT_API_KEY"
```

### 2. Sync User

```bash
curl -X POST https://funint.online/client/users/sync \
  -H "Authorization: Bearer RTC_CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "external_user_id": "user-123",
    "name": "User Name",
    "email": "user@example.com"
  }'
```

### 3. Create Room

```bash
curl -X POST https://funint.online/client/rooms \
  -H "Authorization: Bearer RTC_CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "room_id": "support-room-1",
    "name": "Support Room 1",
    "room_type": "video",
    "max_participants": 8
  }'
```

### 4. Issue RTC Token

```bash
curl -X POST https://funint.online/client/rtc/token \
  -H "Authorization: Bearer RTC_CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "external_user_id": "user-123",
    "room_id": "support-room-1",
    "role": "publisher",
    "rtc_mode": "video",
    "permissions": ["join", "publish_audio", "publish_video", "chat", "signal"]
  }'
```

Important response fields:

```json
{
  "access_token": "JWT_TOKEN",
  "token_type": "Bearer",
  "expires_in": "1h",
  "app_id": "client-company-app",
  "user_id": "user-123",
  "room_id": "support-room-1",
  "role": "publisher",
  "rtc_mode": "video",
  "permissions": ["join", "publish_audio", "publish_video", "chat", "signal"]
}
```

## Permission Sets

Use the narrowest permission set needed by the feature.

```json
{
  "audio_room": ["join", "publish_audio", "chat", "signal"],
  "video_room": ["join", "publish_audio", "publish_video", "chat", "signal"],
  "screen_share": ["join", "publish_audio", "publish_video", "screen_share", "chat", "signal"],
  "moderator": ["join", "publish_audio", "publish_video", "chat", "signal", "moderate"]
}
```

## Token Usage

Android AAR SDK:

```kotlin
RtcServiceSdk.Config.videoCall(
    signalingUrl = "https://funint.online",
    accessToken = tokenFromClientBackend,
    roomId = "support-room-1"
)
```

Custom Socket.IO/WebRTC client:

```json
{
  "auth": {
    "token": "RTC_ACCESS_TOKEN"
  }
}
```

The signaling server also accepts `auth.accessToken` or `Authorization: Bearer RTC_ACCESS_TOKEN` during the Socket.IO handshake.

## Session And Billing APIs

If the integration does not rely on SDK room join/leave events, the client backend should explicitly start and end RTC sessions.

Start session:

```bash
curl -X POST https://funint.online/client/rtc/session/start \
  -H "Authorization: Bearer RTC_CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "external_user_id": "user-123",
    "room_id": "support-room-1",
    "role": "publisher",
    "rtc_mode": "video",
    "mic_enabled": true,
    "camera_enabled": true
  }'
```

End session:

```bash
curl -X POST https://funint.online/client/rtc/session/end \
  -H "Authorization: Bearer RTC_CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "external_user_id": "user-123",
    "room_id": "support-room-1"
  }'
```

Read usage:

```bash
curl https://funint.online/client/billing/usage \
  -H "Authorization: Bearer RTC_CLIENT_API_KEY"
```

## Token Management

List issued tokens:

```bash
curl https://funint.online/client/rtc/tokens \
  -H "Authorization: Bearer RTC_CLIENT_API_KEY"
```

Verify a token:

```bash
curl -X POST https://funint.online/client/rtc/token/verify \
  -H "Authorization: Bearer RTC_CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "RTC_ACCESS_TOKEN"
  }'
```

Revoke a token:

```bash
curl -X POST https://funint.online/client/rtc/token/revoke \
  -H "Authorization: Bearer RTC_CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "RTC_ACCESS_TOKEN"
  }'
```

## Client-Facing Checklist

Before handing integration details to the client:

1. Create a dedicated RTC project.
2. Save its App ID, App Key, and backend-only server secret.
3. Confirm `GET /client/me` works with that server secret.
4. Confirm a token can be issued for a test user and room.
5. Share `RTC_API_BASE_URL`, `RTC_APP_ID`, `RTC_APP_KEY`, and the backend-only `RTC_SERVER_SECRET`.
6. Tell the client to keep `RTC_SERVER_SECRET` / `RTC_CLIENT_API_KEY` on their backend only.
7. Share the Android AAR only if they are building an Android SDK integration.

## Support Notes For The Client

Common errors:

```text
401 Valid client API key is required
```

The backend did not send `Authorization: Bearer RTC_SERVER_SECRET`, or the server secret was revoked.

```text
app_name or external_user_id is required
```

The token request needs `external_user_id`.

```text
RTC token room does not match saved token
```

The app tried to join a different room than the `room_id` used when issuing the token.

```text
Invalid or expired RTC token
```

Request a new RTC access token from the client backend. Tokens currently expire after `1h`.

## Full Endpoint List

Client backend endpoints:

```text
GET  /client/me
POST /client/users/sync
GET  /client/rooms
POST /client/rooms
GET  /client/rooms/:roomId
POST /client/rtc/token
GET  /client/rtc/tokens
POST /client/rtc/token/verify
POST /client/rtc/token/revoke
POST /client/rtc/session/start
POST /client/rtc/session/end
GET  /client/billing/usage
GET  /client/security/incidents
```

Admin-only endpoints:

```text
GET  /admin/apps
POST /admin/apps
GET  /admin/billing/companies
GET  /admin/apps/:appId
GET  /admin/apps/:appId/billing
POST /admin/apps/:appId/keys
POST /admin/apps/:appId/keys/:keyId/revoke
```

Only your platform/admin team should use the admin endpoints.
