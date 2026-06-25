# RTC Platform

Local RTC service platform with:

- Express API for client verification, user sync, room creation, RTC token issuing, session start, and session end.
- Admin API for creating client apps and issuing per-client API keys.
- Socket.IO signaling for authenticated WebRTC peers.
- In-memory client app, API key, room, participant, media, and session state for local development.
- Browser SDK and admin dashboard for generating RTC access tokens by app name.
- Android WebRTC SDK wrapper for connect, join, leave, mute audio, toggle video, speakerphone, signaling, and stream callbacks.

## Run Backend

```bash
cd backend
npm install
npm run dev
```

Backend defaults:

- API URL: `http://localhost:4000`
- Platform admin key: `rtc-admin-dev-key`
- Client API key: `rtc-dev-api-key`
- Token secret: `rtc-dev-secret-change-me`

For real deployments set `RTC_ADMIN_KEY`, `RTC_API_KEY`, and `RTC_TOKEN_SECRET`.

## Client App Integration

Create a client app and API key:

```bash
curl -X POST http://localhost:4000/admin/apps \
  -H "Authorization: Bearer rtc-admin-dev-key" \
  -H "Content-Type: application/json" \
  -d '{"name":"Client Android App","package_name":"com.client.app"}'
```

The client's backend uses the returned `api_key` to sync users, create rooms, and issue short-lived RTC tokens. The Android APK should receive only the RTC access token, not the client API key.

Full client/API/Android flow: [docs/client-api.md](docs/client-api.md).

## Run Web Admin Dashboard

```bash
cd web
npm install
npm run dev
```

Open the Vite URL, enter the app name, and generate an access token to use with the SDK in the client app.

## Client API

All `/admin/*` endpoints require:

```http
Authorization: Bearer rtc-admin-dev-key
```

Admin endpoints:

- `GET /admin/apps`
- `POST /admin/apps`
- `GET /admin/apps/:appId`
- `POST /admin/apps/:appId/keys`
- `POST /admin/apps/:appId/keys/:keyId/revoke`

All `/client/*` endpoints require:

```http
Authorization: Bearer rtc-dev-api-key
```

Supported endpoints:

- `GET /health`
- `POST /rtc-token`
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

## Socket Events

Client emits:

- `room:join`
- `room:leave`
- `media:state`
- `signal`

Server emits:

- `room:joined`
- `room:left`
- `room:state`
- `room:error`
- `room:full`
- `existing-users`
- `user-joined`
- `user-left`
- `participant:joined`
- `participant:updated`
- `participant:left`
- `signal`
- `signal:error`
