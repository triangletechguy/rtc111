# RTC Platform

Local RTC service platform with:

- Express API for client verification, user sync, room creation, RTC token issuing, session start, session end, and usage billing.
- Admin API for creating RTC projects, issuing App ID/App Key plus backend server secrets, and viewing company-wise used-minute billing.
- Socket.IO signaling for authenticated WebRTC peers.
- In-memory RTC project, server secret, room, participant, media, and session state for local development.
- Browser SDK and admin dashboard for generating RTC access tokens by app name, viewing company billing, and checking RTC API connection status.
- Android WebRTC SDK wrapper for connect, join, leave, one-to-one voice/video calls, group voice/video chat, solo live, live PK state, MediaProjection screen share, chat/messages/comments with replies and AI filtering, voice/image messages, gifts, room/admin/moderation settings, video effects/beauty/stickers/makeup state, mute audio, noise cancellation, toggle video, speakerphone, signaling, security events, and stream callbacks.

## Run Backend

```bash
cd backend
npm install
npm run dev
```

Backend defaults:

- API URL: `http://localhost:4000`
- App ID: `local-rtc-client`
- App Key: `rtc-dev-app-key`
- Platform admin key: `rtc-admin-dev-key`
- Backend server secret / client API key: `rtc-dev-api-key`
- Token secret: `rtc-dev-secret-change-me`
- Optional billing rate: `RTC_BILLING_RATE_PER_MINUTE` (defaults to `0`; no payment gateway is used)

For real deployments set `RTC_ADMIN_KEY`, `RTC_APP_KEY`, `RTC_API_KEY`, `RTC_TOKEN_SECRET`, and optionally `RTC_BILLING_RATE_PER_MINUTE`.

## Client App Integration

Create an RTC project and server secret:

```bash
curl -X POST https://funint.online/admin/apps \
  -H "Authorization: Bearer RTC_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Client Android App","package_name":"com.client.app"}'
```

The response includes `app_id`, `app_key`, and a backend-only `server_secret`/`api_key`. The client app initializes the SDK with `app_id` and `app_key`, then asks the client's backend for a short-lived RTC token. The backend uses the server secret to call the RTC Platform token API. Mobile and browser apps should never receive the server secret.

Full client/API/Android flow: [docs/client-api.md](docs/client-api.md).
Client API handoff guide: [docs/client-api-handoff.md](docs/client-api-handoff.md).
Android AAR integration guide: [docs/android-aar-sdk-integration.md](docs/android-aar-sdk-integration.md).
API-only integration guide: [docs/api-only-integration.md](docs/api-only-integration.md).

## Run Web Admin Dashboard

```bash
cd web
npm install
npm run dev
```

Open the Vite URL to generate access tokens and review company-wise minute billing. Billing is calculated from RTC sessions; no payment gateway is connected.

## Client API

All `/admin/*` endpoints require:

```http
Authorization: Bearer <RTC_ADMIN_KEY>
```

Admin endpoints:

- `GET /admin/apps`
- `POST /admin/apps`
- `GET /admin/billing/companies`
- `GET /admin/apps/:appId`
- `GET /admin/apps/:appId/billing`
- `POST /admin/apps/:appId/keys`
- `POST /admin/apps/:appId/keys/:keyId/revoke`

All `/client/*` endpoints require:

```http
Authorization: Bearer <RTC_SERVER_SECRET>
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
- `GET /client/security/incidents`
- `POST /client/rtc/session/start`
- `POST /client/rtc/session/end`
- `GET /client/billing/usage`

Billing endpoints report used seconds, used minutes, billable minutes, active sessions, estimated amount, and `payment_gateway: false`. Set `RTC_BILLING_RATE_PER_MINUTE` only if you want estimated currency totals.

Web SDK billing helpers:

- `getAdminBilling()`
- `getAdminAppBilling({ appId })`
- `getClientBillingUsage()`

Web SDK RTC connection indicator:

```js
rtcClient.on("rtc-connection-indicator", ({ indicator, peerState }) => {
  console.log(indicator, peerState);
});
```

## Socket Events

Client emits:

- `room:join`
- `room:leave`
- `media:state`
- `message:send`
- `message:list`
- `message:unsend`
- `message:delete`
- `comment:send`
- `room:comments:clean`
- `gift:send`
- `screen:state`
- `video:effects`
- `room:profile:update`
- `room:settings:update`
- `room:theme:update`
- `room:announcement:update`
- `room:admins:update`
- `room:kick`
- `room:kick:history:list`
- `room:kick:history:update`
- `participant:mic:mute`
- `chat:ban`
- `chat:ban:history:list`
- `chat:ban:history:update`
- `room:like`
- `room:share`
- `user:block`
- `user:unblock`
- `user:block:list`
- `live:pk:update`
- `security:check`
- `security:report`
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
- `message:history`
- `message:received`
- `message:updated`
- `message:blocked`
- `message:unsent`
- `message:deleted`
- `comment:received`
- `comment:cleaned`
- `gift:history`
- `gift:received`
- `room:updated`
- `room:entry`
- `room:kicked`
- `room:kick:history`
- `participant:mic:muted`
- `chat:ban`
- `chat:ban:history`
- `room:like`
- `room:share`
- `user:block:updated`
- `user:block:history`
- `screen:state`
- `video:effects`
- `live:pk:state`
- `security:checked`
- `security:incident`
- `signal`
- `signal:error`
