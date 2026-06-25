# API-Only App Integration

This guide is for apps that integrate with the RTC Platform through HTTP APIs only. Use it when you are not importing the Android `.aar` SDK or browser SDK and only need backend-driven user, room, token, session, security, and billing operations.

## Architecture

1. A platform admin creates a client app and client API key.
2. The client backend stores the client API key in server-side secrets.
3. The client app talks only to the client backend.
4. The client backend calls the RTC Platform REST API.
5. The client backend returns only safe data to the app, such as room metadata or a short-lived RTC access token.

Never ship the client API key in a mobile app, web app, desktop app, or other distributed client.

## Base URLs And Auth

Production:

```text
https://funint.online
```

Local development, if running the backend locally:

```text
http://localhost:4000
```

Admin endpoints use the platform admin key:

```http
Authorization: Bearer <RTC_ADMIN_KEY>
```

Client endpoints use the per-client API key:

```http
Authorization: Bearer <CLIENT_API_KEY>
```

Default local development keys:

```text
RTC_ADMIN_KEY=rtc-admin-dev-key
CLIENT_API_KEY=rtc-dev-api-key
```

## 1. Check Service Health

```bash
curl https://funint.online/health
```

Useful response fields:

```json
{
  "status": "ok",
  "clientApps": 1,
  "activeApiKeys": 1,
  "rooms": 0,
  "users": 0,
  "activeTokens": 0,
  "activeSessions": 0,
  "connectedParticipants": 0
}
```

## 2. Create A Client App

This is a platform-admin action. Store the returned `api_key` securely on the client backend.

```bash
curl -X POST https://funint.online/admin/apps \
  -H "Authorization: Bearer RTC_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme App",
    "package_name": "com.acme.app",
    "allowed_origins": ["https://app.acme.example"],
    "key_label": "Production backend key",
    "metadata": {
      "environment": "production"
    }
  }'
```

Important response fields:

```json
{
  "app": {
    "app_id": "acme-app",
    "name": "Acme App"
  },
  "api_key": "rtc_..."
}
```

## 3. Verify Client Credentials

Use this from the client backend to verify that the configured client API key belongs to the expected app.

```bash
curl https://funint.online/client/me \
  -H "Authorization: Bearer CLIENT_API_KEY"
```

Response includes the app record and capability names such as `users.sync`, `rooms.create`, `rtc.token`, `rtc.session.start`, and `billing.usage`.

## 4. Sync Users

Call this whenever your app needs the RTC Platform to know about a user before creating sessions or tokens.

```bash
curl -X POST https://funint.online/client/users/sync \
  -H "Authorization: Bearer CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "external_user_id": "user-123",
    "name": "Riya",
    "email": "riya@example.com",
    "avatar_url": "https://cdn.example/users/user-123.webp",
    "status": "active",
    "metadata": {
      "plan": "pro"
    }
  }'
```

Important response field:

```json
{
  "user": {
    "externalUserId": "user-123",
    "name": "Riya",
    "status": "active"
  }
}
```

## 5. Create Or Update Rooms

```bash
curl -X POST https://funint.online/client/rooms \
  -H "Authorization: Bearer CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "room_id": "support-room-1",
    "name": "Support Room 1",
    "room_type": "video",
    "max_participants": 8,
    "chat_enabled": true,
    "join_enabled": true,
    "metadata": {
      "ticket_id": "SUP-1001"
    }
  }'
```

Supported room modes include `voice`, `group_voice`, `video`, `video_call`, `group_video`, `solo_live`, `live_pk`, `screen_share`, and `youtube`.

Important response fields:

```json
{
  "room": {
    "room_id": "support-room-1",
    "name": "Support Room 1",
    "room_type": "video",
    "max_participants": 8,
    "chat_enabled": true,
    "join_enabled": true
  }
}
```

List rooms:

```bash
curl https://funint.online/client/rooms \
  -H "Authorization: Bearer CLIENT_API_KEY"
```

Get one room and its live state:

```bash
curl https://funint.online/client/rooms/support-room-1 \
  -H "Authorization: Bearer CLIENT_API_KEY"
```

## 6. Issue RTC Access Tokens

Issue tokens from the client backend only. The RTC access token is safe to return to the app because it is scoped, saved by the backend, and short-lived.

```bash
curl -X POST https://funint.online/client/rtc/token \
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

Important response fields:

```json
{
  "access_token": "JWT_TOKEN",
  "token_type": "Bearer",
  "expires_in": "1h",
  "app_id": "acme-app",
  "user_id": "user-123",
  "room_id": "support-room-1",
  "role": "publisher",
  "rtc_mode": "video",
  "permissions": ["join", "publish_audio", "publish_video", "chat", "signal"]
}
```

Common permission sets:

```json
{
  "voice": ["join", "publish_audio", "chat", "signal"],
  "video": ["join", "publish_audio", "publish_video", "chat", "signal"],
  "screen_share": ["join", "publish_audio", "publish_video", "screen_share", "chat", "signal"],
  "moderator": ["join", "publish_audio", "publish_video", "chat", "signal", "moderate"]
}
```

## 7. Broker Tokens From Your Backend

Example Node/Express route:

```js
app.post("/api/rtc/token", requireAppUser, async (req, res) => {
  const response = await fetch(`${process.env.RTC_API_BASE_URL}/client/rtc/token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RTC_CLIENT_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      external_user_id: req.user.id,
      room_id: req.body.roomId,
      role: "publisher",
      rtc_mode: req.body.rtcMode ?? "video",
      permissions: ["join", "publish_audio", "publish_video", "chat", "signal"]
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    res.status(response.status).json({ error: error.error ?? "Unable to issue RTC token" });
    return;
  }

  const token = await response.json();
  res.json({
    accessToken: token.access_token,
    expiresAt: token.expires_at,
    roomId: token.room_id,
    rtcMode: token.rtc_mode
  });
});
```

## 8. Use Tokens In A Custom RTC Client

If you are not using the Android AAR or browser SDK but still want realtime RTC behavior, your custom client must authenticate the signaling socket with the RTC access token returned by the API.

Socket.IO auth payload:

```json
{
  "auth": {
    "token": "RTC_ACCESS_TOKEN"
  }
}
```

The server also accepts `auth.accessToken` or an HTTP `Authorization: Bearer RTC_ACCESS_TOKEN` header during the Socket.IO handshake.

If your app only needs server-side provisioning, usage reporting, or dashboard data, you do not need to open a signaling socket.

## 9. Verify, List, And Revoke Tokens

List saved tokens for the client app:

```bash
curl https://funint.online/client/rtc/tokens \
  -H "Authorization: Bearer CLIENT_API_KEY"
```

Verify one token:

```bash
curl -X POST https://funint.online/client/rtc/token/verify \
  -H "Authorization: Bearer CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "RTC_ACCESS_TOKEN"
  }'
```

Revoke one token:

```bash
curl -X POST https://funint.online/client/rtc/token/revoke \
  -H "Authorization: Bearer CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "RTC_ACCESS_TOKEN"
  }'
```

After revocation, the token can no longer authenticate signaling.

## 10. Track Sessions And Billing

If your integration is API-only and not using the SDK's room join/leave flow, record sessions explicitly so usage and billing stay accurate.

Start a session and receive an RTC token in the same response:

```bash
curl -X POST https://funint.online/client/rtc/session/start \
  -H "Authorization: Bearer CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "external_user_id": "user-123",
    "room_id": "support-room-1",
    "role": "publisher",
    "rtc_mode": "video",
    "mic_enabled": true,
    "camera_enabled": true,
    "noise_cancellation_enabled": true
  }'
```

End a session:

```bash
curl -X POST https://funint.online/client/rtc/session/end \
  -H "Authorization: Bearer CLIENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "external_user_id": "user-123",
    "room_id": "support-room-1"
  }'
```

Read client usage:

```bash
curl https://funint.online/client/billing/usage \
  -H "Authorization: Bearer CLIENT_API_KEY"
```

Usage responses include `used_seconds`, `used_minutes`, `billable_minutes`, `active_sessions`, `estimated_amount`, and `payment_gateway: false`.

## 11. Admin Operations

List client apps:

```bash
curl https://funint.online/admin/apps \
  -H "Authorization: Bearer RTC_ADMIN_KEY"
```

Create an additional API key:

```bash
curl -X POST https://funint.online/admin/apps/acme-app/keys \
  -H "Authorization: Bearer RTC_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Rotated backend key"
  }'
```

Revoke an API key:

```bash
curl -X POST https://funint.online/admin/apps/acme-app/keys/key_123/revoke \
  -H "Authorization: Bearer RTC_ADMIN_KEY"
```

Read billing for all companies:

```bash
curl https://funint.online/admin/billing/companies \
  -H "Authorization: Bearer RTC_ADMIN_KEY"
```

Read billing for one app:

```bash
curl https://funint.online/admin/apps/acme-app/billing \
  -H "Authorization: Bearer RTC_ADMIN_KEY"
```

## 12. Security Incidents

The platform stores recent security incidents by client app.

```bash
curl https://funint.online/client/security/incidents \
  -H "Authorization: Bearer CLIENT_API_KEY"
```

This is useful for dashboard-only integrations that want to monitor blocked messages, moderation reports, or abuse events collected by signaling clients.

## API Summary

Admin endpoints:

```text
GET  /admin/apps
POST /admin/apps
GET  /admin/billing/companies
GET  /admin/apps/:appId
GET  /admin/apps/:appId/billing
POST /admin/apps/:appId/keys
POST /admin/apps/:appId/keys/:keyId/revoke
```

Client endpoints:

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

Compatibility token endpoint for local/default-client development:

```text
POST /rtc-token
```

Prefer `POST /client/rtc/token` for real client integrations.

## Related Docs

- Client API handoff package: [client-api-handoff.md](client-api-handoff.md)
- Full client API, Android, and SDK flow: [client-api.md](client-api.md)
- Android AAR SDK integration: [android-aar-sdk-integration.md](android-aar-sdk-integration.md)
