# RTC Platform

Local RTC service platform with:

- Express API for client verification, user sync, room creation, RTC token issuing, session start, and session end.
- Socket.IO signaling for authenticated WebRTC peers.
- In-memory room, participant, media, and session state for local development.
- Browser SDK and demo UI for video calls, leave room, mute/unmute, camera on/off, speaker on/off, token copy, and participant state.
- Android WebRTC SDK wrapper for connect, join, leave, mute audio, toggle video, speakerphone, signaling, and stream callbacks.

## Run Backend

```bash
cd backend
npm install
npm run dev
```

Backend defaults:

- API URL: `http://localhost:4000`
- Client API key: `rtc-dev-api-key`
- Token secret: `rtc-dev-secret-change-me`

For real deployments set `RTC_API_KEY` and `RTC_TOKEN_SECRET`.

## Run Web Demo

```bash
cd web
npm install
npm run dev
```

Open the Vite URL, start a session, join a room, and open a second browser tab with a different client id to test peer connection.

## Client API

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
