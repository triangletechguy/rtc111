import express, { type NextFunction, type Request, type Response } from "express";
import http from "http";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { randomUUID } from "crypto";
import { Server, type Socket } from "socket.io";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";
const RTC_TOKEN_ISSUER = "rtc-platform";
const RTC_TOKEN_SECRET = process.env.RTC_TOKEN_SECRET ?? "rtc-dev-secret-change-me";
const RTC_TOKEN_EXPIRES_IN: SignOptions["expiresIn"] = "1h";
const RTC_API_KEY = process.env.RTC_API_KEY ?? "rtc-dev-api-key";
const RTC_APP_KEY = process.env.RTC_APP_KEY ?? "rtc-dev-app-key";
const RTC_ADMIN_KEY = process.env.RTC_ADMIN_KEY ?? "rtc-admin-dev-key";
const DEFAULT_ROOM_CAPACITY = Number(process.env.RTC_DEFAULT_ROOM_CAPACITY ?? 8);
const parsedBillingRate = Number(process.env.RTC_BILLING_RATE_PER_MINUTE ?? 0);
const RTC_BILLING_RATE_PER_MINUTE =
  Number.isFinite(parsedBillingRate) && parsedBillingRate > 0 ? parsedBillingRate : 0;
const DEFAULT_CLIENT_APP_ID = "local-rtc-client";

type RtcPermission =
  | "join"
  | "publish_audio"
  | "publish_video"
  | "screen_share"
  | "chat"
  | "signal"
  | "moderate"
  | string;

type RtcAccessToken = JwtPayload & {
  scope: "rtc";
  appId: string;
  appKey?: string;
  userId: string;
  externalUserId?: string;
  roomId?: string;
  role: string;
  rtcMode: string;
  permissions: RtcPermission[];
};

type ClientApp = {
  id: string;
  appKey: string;
  name: string;
  packageName?: string;
  allowedOrigins: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type StoredApiKey = {
  id: string;
  appId: string;
  secret: string;
  label: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
};

type ExternalUser = {
  appId: string;
  externalUserId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type RoomRecord = {
  appId: string;
  id: string;
  name: string;
  profilePictureUrl?: string;
  roomType: string;
  privacyType: string;
  maxParticipants: number;
  maxMicCount: number;
  chatEnabled: boolean;
  joinEnabled: boolean;
  entryNotificationsEnabled: boolean;
  password?: string;
  theme: Record<string, unknown>;
  announcement?: RoomAnnouncement;
  superAdmins: string[];
  admins: string[];
  likeCount: number;
  shareCount: number;
  createdBy?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type SessionRecord = {
  id: string;
  appId: string;
  roomId: string;
  userId: string;
  externalUserId?: string;
  role: string;
  rtcMode: string;
  micEnabled: boolean;
  cameraEnabled: boolean;
  speakerEnabled: boolean;
  noiseCancellationEnabled: boolean;
  permissions: RtcPermission[];
  startedAt: string;
  endedAt?: string;
};

type ParticipantState = {
  socketId: string;
  appId: string;
  roomId: string;
  userId: string;
  externalUserId?: string;
  role: string;
  rtcMode: string;
  micEnabled: boolean;
  cameraEnabled: boolean;
  speakerEnabled: boolean;
  noiseCancellationEnabled: boolean;
  screenShareEnabled: boolean;
  videoEffects: VideoEffectState;
  permissions: RtcPermission[];
  joinedAt: string;
  lastSeenAt: string;
};

type VideoEffectState = {
  filter: string;
  aiFilter: string;
  sticker: string;
  faceDetectEnabled: boolean;
  beautyEnabled: boolean;
  beautyLevel: number;
  smoothingLevel: number;
  whiteningLevel: number;
  eyeLevel: number;
  faceSlimLevel: number;
  makeup: Record<string, unknown>;
  updatedAt?: string;
};

type YoutubeRoomState = {
  appId: string;
  roomId: string;
  videoId: string;
  videoUrl?: string;
  title?: string;
  playbackState: "ready" | "playing" | "paused" | "stopped";
  positionSeconds: number;
  updatedAt: string;
  updatedBy: string;
};

type LivePkState = {
  appId: string;
  roomId: string;
  status: "idle" | "matching" | "active" | "ended";
  hostUserId: string;
  opponentUserId?: string;
  hostScore: number;
  opponentScore: number;
  startedAt?: string;
  endedAt?: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
};

type RoomAnnouncement = {
  id: string;
  text: string;
  pinned: boolean;
  createdBy: string;
  updatedAt: string;
};

type ChatMessageKind = "message" | "comment" | "voice" | "image";

type ChatMessageRecord = {
  id: string;
  appId: string;
  roomId: string;
  senderSocketId: string;
  senderUserId: string;
  senderExternalUserId?: string;
  kind: ChatMessageKind;
  text: string;
  mediaUrl?: string;
  mimeType?: string;
  durationSeconds?: number;
  replyToMessageId?: string;
  status: "sent" | "unsent" | "deleted";
  deletedForUserIds: string[];
  security: ReturnType<typeof evaluateSecurityContent>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type GiftRecord = {
  id: string;
  appId: string;
  roomId: string;
  senderSocketId: string;
  senderUserId: string;
  senderExternalUserId?: string;
  giftId: string;
  name: string;
  assetUrl: string;
  assetType: string;
  quantity: number;
  receiverUserId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type RoomHistoryRecord = {
  id: string;
  appId: string;
  roomId: string;
  targetUserId: string;
  targetSocketId?: string;
  actorUserId: string;
  reason: string;
  permanent: boolean;
  expiresAt?: string;
  active: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type UserBlockRecord = {
  id: string;
  appId: string;
  blockerUserId: string;
  blockedUserId: string;
  reason: string;
  active: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type SecurityIncident = {
  id: string;
  appId: string;
  roomId?: string;
  reporterSocketId?: string;
  reporterUserId?: string;
  targetUserId?: string;
  category: string;
  severity: "low" | "medium" | "high";
  message: string;
  blocked: boolean;
  createdAt: string;
  metadata: Record<string, unknown>;
};

type StoredRtcToken = {
  token: string;
  tokenId: string;
  appId: string;
  appKey?: string;
  userId: string;
  externalUserId?: string;
  roomId?: string;
  role: string;
  rtcMode: string;
  permissions: RtcPermission[];
  issuedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  lastUsedAt?: string;
};

type ClientAuthedRequest = Request & {
  clientApp?: ClientApp;
  clientApiKey?: StoredApiKey;
};

const clientApps = new Map<string, ClientApp>();
const apiKeysBySecret = new Map<string, StoredApiKey>();
const users = new Map<string, ExternalUser>();
const rooms = new Map<string, RoomRecord>();
const sessions = new Map<string, SessionRecord>();
const activeSessionByUserRoom = new Map<string, string>();
const roomParticipants = new Map<string, Map<string, ParticipantState>>();
const youtubeRoomStates = new Map<string, YoutubeRoomState>();
const livePkStates = new Map<string, LivePkState>();
const roomMessages = new Map<string, ChatMessageRecord[]>();
const roomGifts = new Map<string, GiftRecord[]>();
const roomKickHistory = new Map<string, RoomHistoryRecord[]>();
const roomChatBanHistory = new Map<string, RoomHistoryRecord[]>();
const userBlockHistory = new Map<string, UserBlockRecord[]>();
const roomLikeUsers = new Map<string, Set<string>>();
const securityIncidents: SecurityIncident[] = [];

/**
 * IMPORTANT:
 * This stores generated access tokens in backend memory.
 * For production, replace this Map with a real DB table.
 *
 * token string -> token record
 */
const issuedRtcTokens = new Map<string, StoredRtcToken>();

let nextRoomId = 1;

bootstrapDefaultClientApp();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

app.use((req, _res, next) => {
  if (req.url === "/api") {
    req.url = "/";
  } else if (req.url.startsWith("/api/")) {
    req.url = req.url.slice("/api".length);
  }

  next();
});

app.get("/", (_req, res) => {
  res.type("html").send(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>RTC Backend</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #f6f8fb;
            color: #172026;
            font: 16px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          main {
            width: min(720px, calc(100% - 32px));
            padding: 28px;
            border: 1px solid #d9e0e8;
            border-radius: 8px;
            background: #fff;
            box-shadow: 0 18px 45px rgba(21, 34, 50, 0.08);
          }
          h1 {
            margin: 0 0 8px;
            font-size: 32px;
            line-height: 1.1;
          }
          p {
            margin: 0 0 14px;
            color: #52606c;
          }
          code {
            display: inline-block;
            padding: 3px 6px;
            border-radius: 4px;
            background: #eef2f7;
            color: #172026;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>RTC Backend is running</h1>
          <p>Socket.IO signaling is listening on <code>localhost:${PORT}</code>.</p>
          <p>Health check: <code>/health</code></p>
          <p>Admin API: <code>/admin/apps</code>, <code>/admin/billing/companies</code></p>
          <p>Compatibility token endpoint: <code>POST /rtc-token</code></p>
          <p>Client API: <code>/client/me</code>, <code>/client/users/sync</code>, <code>/client/rooms</code>, <code>/client/rtc/token</code>, <code>/client/rtc/session/start</code>, <code>/client/rtc/session/end</code>, <code>/client/billing/usage</code></p>
        </main>
      </body>
    </html>
  `);
});

app.get("/health", (_req, res) => {
  cleanupExpiredTokens();

  res.json({
    status: "ok",
    clientApps: clientApps.size,
    activeApiKeys: Array.from(apiKeysBySecret.values()).filter((apiKey) => !apiKey.revokedAt).length,
    rooms: rooms.size,
    users: users.size,
    issuedTokens: issuedRtcTokens.size,
    activeTokens: Array.from(issuedRtcTokens.values()).filter((token) => isStoredTokenActive(token)).length,
    activeSessions: Array.from(sessions.values()).filter((session) => !session.endedAt).length,
    usedRtcMinutes: roundNumber(
      Array.from(sessions.values()).reduce(
        (totalSeconds, session) => totalSeconds + getSessionDurationSeconds(session),
        0,
      ) / 60,
    ),
    billableRtcMinutes: Array.from(sessions.values()).reduce(
      (totalMinutes, session) => totalMinutes + getSessionBillableMinutes(session),
      0,
    ),
    connectedParticipants: Array.from(roomParticipants.values()).reduce(
      (count, participants) => count + participants.size,
      0,
    ),
  });
});

app.get("/admin/apps", requireAdminAuth, (_req, res) => {
  res.json({
    apps: Array.from(clientApps.values()).map(serializeClientApp),
  });
});

app.get("/admin/billing/companies", requireAdminAuth, (_req, res) => {
  const generatedAt = new Date().toISOString();
  const billing = Array.from(clientApps.values()).map((clientApp) =>
    getCompanyBillingSummary(clientApp.id, { generatedAt }),
  );

  res.json({
    generatedAt,
    generated_at: generatedAt,
    ratePerMinute: RTC_BILLING_RATE_PER_MINUTE,
    rate_per_minute: RTC_BILLING_RATE_PER_MINUTE,
    currency: "USD",
    paymentGateway: false,
    payment_gateway: false,
    billing,
    companies: billing,
  });
});

app.post("/admin/apps", requireAdminAuth, (req, res) => {
  const name = readString(req.body?.name) || readString(req.body?.app_name);

  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const requestedAppId = readString(req.body?.app_id) || readString(req.body?.appId);
  const packageName = readString(req.body?.package_name) || readString(req.body?.packageName);
  const allowedOrigins = readStringArray(req.body?.allowed_origins ?? req.body?.allowedOrigins);
  const metadata = readRecord(req.body?.metadata) ?? {};
  const keyLabel = readString(req.body?.key_label) || readString(req.body?.keyLabel) || "Default API key";
  const appId = createUniqueAppId(requestedAppId || name);
  const { app: clientApp, apiKey } = createClientApp({
    id: appId,
    name,
    packageName,
    allowedOrigins,
    metadata,
    keyLabel,
  });
  const serializedApp = serializeClientApp(clientApp);
  const serializedServerKey = serializeApiKey(apiKey, true);

  res.status(201).json({
    app: serializedApp,
    appId: clientApp.id,
    app_id: clientApp.id,
    appKey: clientApp.appKey,
    app_key: clientApp.appKey,
    apiKey: serializedServerKey,
    api_key: apiKey.secret,
    serverKey: serializedServerKey,
    server_key: serializedServerKey,
    serverSecret: apiKey.secret,
    server_secret: apiKey.secret,
    integration: {
      apiBaseUrl: `http://localhost:${PORT}`,
      api_base_url: `http://localhost:${PORT}`,
      appId: clientApp.id,
      app_id: clientApp.id,
      appKey: clientApp.appKey,
      app_key: clientApp.appKey,
      authorizationHeader: `Bearer ${apiKey.secret}`,
      authorization_header: `Bearer ${apiKey.secret}`,
      serverAuthorizationHeader: `Bearer ${apiKey.secret}`,
      server_authorization_header: `Bearer ${apiKey.secret}`,
    },
  });
});

app.get("/admin/apps/:appId", requireAdminAuth, (req, res) => {
  const appId = readString(req.params.appId);
  const clientApp = clientApps.get(appId);

  if (!clientApp) {
    res.status(404).json({ error: "Client app not found" });
    return;
  }

  res.json({
    app: serializeClientApp(clientApp),
    apiKeys: Array.from(apiKeysBySecret.values())
      .filter((apiKey) => apiKey.appId === appId)
      .map((apiKey) => serializeApiKey(apiKey)),
  });
});

app.delete("/admin/apps/:appId", requireAdminAuth, (req, res) => {
  const appId = readString(req.params.appId);
  const clientApp = clientApps.get(appId);

  if (!clientApp) {
    res.status(404).json({ deleted: false, error: "Client app not found" });
    return;
  }

  if (appId === DEFAULT_CLIENT_APP_ID) {
    res.status(400).json({
      deleted: false,
      error: "The default local development client app cannot be deleted",
    });
    return;
  }

  const deleted = deleteClientApp(appId);

  res.json({
    deleted: true,
    app: serializeClientApp(clientApp),
    ...deleted,
  });
});

app.get("/admin/apps/:appId/billing", requireAdminAuth, (req, res) => {
  const appId = readString(req.params.appId);
  const clientApp = clientApps.get(appId);

  if (!clientApp) {
    res.status(404).json({ error: "Client app not found" });
    return;
  }

  const generatedAt = new Date().toISOString();

  res.json({
    generatedAt,
    generated_at: generatedAt,
    billing: getCompanyBillingSummary(appId, {
      generatedAt,
      includeSessions: true,
    }),
  });
});

app.post("/admin/apps/:appId/keys", requireAdminAuth, (req, res) => {
  const appId = readString(req.params.appId);
  const clientApp = clientApps.get(appId);

  if (!clientApp) {
    res.status(404).json({ error: "Client app not found" });
    return;
  }

  const apiKey = createApiKey({
    appId,
    label: readString(req.body?.label) || readString(req.body?.key_label) || "API key",
  });

  res.status(201).json({
    app: serializeClientApp(clientApp),
    apiKey: serializeApiKey(apiKey, true),
    api_key: apiKey.secret,
    serverKey: serializeApiKey(apiKey, true),
    server_key: serializeApiKey(apiKey, true),
    serverSecret: apiKey.secret,
    server_secret: apiKey.secret,
  });
});

app.post("/admin/apps/:appId/keys/:keyId/revoke", requireAdminAuth, (req, res) => {
  const appId = readString(req.params.appId);
  const keyId = readString(req.params.keyId);
  const apiKey = findApiKeyById(appId, keyId);

  if (!apiKey) {
    res.status(404).json({ revoked: false, error: "API key not found" });
    return;
  }

  apiKey.revokedAt = new Date().toISOString();

  res.json({
    revoked: true,
    apiKey: serializeApiKey(apiKey),
  });
});

app.post("/rtc-token", (req, res) => {
  const roomId = readString(req.body?.roomId) || "room1";
  const userId = readString(req.body?.userId) || `web-${randomUUID()}`;
  const role = readString(req.body?.role) || "publisher";
  const rtcMode = readString(req.body?.rtcMode) || readString(req.body?.rtc_mode) || "video";
  const permissions = readPermissions(req.body?.permissions, defaultPermissionsForRtcMode(rtcMode));

  ensureRoomForRtcMode(DEFAULT_CLIENT_APP_ID, roomId, rtcMode);

  res.json(issueToken({ appId: DEFAULT_CLIENT_APP_ID, roomId, userId, role, rtcMode, permissions }));
});

app.get("/client/me", requireClientAuth, (req, res) => {
  const clientApp = getClientApp(req);

  res.json({
    app: serializeClientApp(clientApp),
    id: clientApp.id,
    name: clientApp.name,
    environment: process.env.NODE_ENV ?? "development",
    tokenIssuer: RTC_TOKEN_ISSUER,
    capabilities: [
      "users.sync",
      "rooms.create",
      "rooms.state",
      "project.credentials",
      "rtc.token",
      "rtc.session.start",
      "rtc.session.end",
      "rtc.signaling",
      "rtc.media_state",
      "rtc.audio_room",
      "rtc.one_to_one_voice_call",
      "rtc.group_voice_chat",
      "rtc.video_call",
      "rtc.group_video_chat",
      "rtc.solo_video_live",
      "rtc.live_video_pk",
      "rtc.screen_share",
      "rtc.video_effects",
      "rtc.youtube_room",
      "rtc.ai_security",
      "rtc.token.saved_validation",
      "rtc.connection_indicator",
      "billing.usage",
    ],
  });
});

app.post("/client/users/sync", requireClientAuth, (req, res) => {
  const clientApp = getClientApp(req);
  const externalUserId = readString(req.body?.external_user_id) || readString(req.body?.externalUserId);

  if (!externalUserId) {
    res.status(400).json({ error: "external_user_id is required" });
    return;
  }

  const now = new Date().toISOString();
  const existing = users.get(scopedKey(clientApp.id, externalUserId));
  const user: ExternalUser = {
    appId: clientApp.id,
    externalUserId,
    name: readString(req.body?.name) || existing?.name || externalUserId,
    email: readString(req.body?.email) || existing?.email || "",
    avatarUrl: readString(req.body?.avatar_url) || readString(req.body?.avatarUrl) || existing?.avatarUrl,
    status: readString(req.body?.status) || existing?.status || "active",
    metadata: readRecord(req.body?.metadata) ?? existing?.metadata ?? {},
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  users.set(scopedKey(clientApp.id, externalUserId), user);
  res.status(existing ? 200 : 201).json({ user });
});

app.get("/client/rooms", requireClientAuth, (req, res) => {
  const clientApp = getClientApp(req);

  res.json({
    rooms: Array.from(rooms.values())
      .filter((room) => room.appId === clientApp.id)
      .map(serializeRoom),
  });
});

app.post("/client/rooms", requireClientAuth, (req, res) => {
  const clientApp = getClientApp(req);
  const externalUserId = readString(req.body?.external_user_id) || readString(req.body?.externalUserId);
  const roomId = readString(req.body?.room_id) || readString(req.body?.roomId) || String(nextRoomId++);
  const roomType = readString(req.body?.room_type) || readString(req.body?.roomType) || "voice";
  const defaultCapacity = getDefaultRoomCapacityForMode(roomType);
  let room = ensureRoom(clientApp.id, roomId, {
    name: readString(req.body?.name) || `Room ${roomId}`,
    profilePictureUrl: readString(req.body?.profile_picture_url) || readString(req.body?.profilePictureUrl),
    roomType,
    privacyType: readString(req.body?.privacy_type) || readString(req.body?.privacyType) || "public",
    maxParticipants: readPositiveNumber(req.body?.max_participants)
      ?? readPositiveNumber(req.body?.maxParticipants)
      ?? readPositiveNumber(req.body?.max_mic_count)
      ?? readPositiveNumber(req.body?.maxMicCount)
      ?? defaultCapacity.maxParticipants,
    maxMicCount: readPositiveNumber(req.body?.max_mic_count)
      ?? readPositiveNumber(req.body?.maxMicCount)
      ?? defaultCapacity.maxMicCount,
    chatEnabled: readBoolean(req.body?.chat_enabled, readBoolean(req.body?.chatEnabled, true)),
    joinEnabled: readBoolean(req.body?.join_enabled, readBoolean(req.body?.joinEnabled, true)),
    entryNotificationsEnabled: readBoolean(
      req.body?.entry_notifications_enabled,
      readBoolean(req.body?.entryNotificationsEnabled, true),
    ),
    password: readString(req.body?.password) || readString(req.body?.room_password) || readString(req.body?.roomPassword),
    theme: readRecord(req.body?.theme) ?? {},
    announcement: readAnnouncement(req.body?.announcement, externalUserId || "system"),
    superAdmins: readStringArray(req.body?.super_admins ?? req.body?.superAdmins),
    admins: readStringArray(req.body?.admins),
    createdBy: externalUserId,
    metadata: readRecord(req.body?.metadata) ?? {},
  });

  if ((isOneToOneVoiceMode(roomType) || isOneToOneVideoMode(roomType)) && (room.maxParticipants > 2 || room.maxMicCount > 2)) {
    room = ensureRoom(clientApp.id, roomId, {
      roomType: normalizeRtcMode(roomType),
      maxParticipants: 2,
      maxMicCount: 2,
    });
  }

  res.status(201).json({
    room: serializeRoom(room),
    room_id: Number.isFinite(Number(room.id)) ? Number(room.id) : room.id,
  });
});

app.get("/client/rooms/:roomId", requireClientAuth, (req, res) => {
  const clientApp = getClientApp(req);
  const roomId = readString(req.params.roomId);
  const room = rooms.get(scopedKey(clientApp.id, roomId));

  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  res.json({
    room: serializeRoom(room),
    state: getRoomState(clientApp.id, room.id),
  });
});

app.post("/client/rtc/token", requireClientAuth, (req, res) => {
  const clientApp = getClientApp(req);
  const requestedAppId =
    readString(req.body?.app_id) ||
    readString(req.body?.appId) ||
    readString(req.header("x-rtc-app-id"));
  const requestedAppKey =
    readString(req.body?.app_key) ||
    readString(req.body?.appKey) ||
    readString(req.header("x-rtc-app-key"));
  const appName = readString(req.body?.app_name) || readString(req.body?.appName);
  const externalUserId = readString(req.body?.external_user_id) || readString(req.body?.externalUserId) || appName;
  const roomId = readString(req.body?.room_id) || readString(req.body?.roomId);

  if (requestedAppId && requestedAppId !== clientApp.id) {
    res.status(403).json({ error: "app_id does not match the authenticated RTC project" });
    return;
  }

  if (requestedAppKey && requestedAppKey !== clientApp.appKey) {
    res.status(403).json({ error: "app_key does not match the authenticated RTC project" });
    return;
  }

  if (!externalUserId) {
    res.status(400).json({ error: "app_name or external_user_id is required" });
    return;
  }

  ensureExternalUser(clientApp.id, externalUserId);

  const role = readString(req.body?.role) || "publisher";
  const rtcMode = readString(req.body?.rtc_mode) || readString(req.body?.rtcMode) || "video";
  const permissions = readPermissions(req.body?.permissions, defaultPermissionsForRtcMode(rtcMode));

  if (roomId) {
    ensureRoomForRtcMode(clientApp.id, roomId, rtcMode);
  }

  res.json(issueToken({
    appId: clientApp.id,
    ...(roomId ? { roomId } : {}),
    userId: externalUserId,
    externalUserId,
    role,
    rtcMode,
    permissions,
  }));
});

app.post("/client/rtc/session/start", requireClientAuth, (req, res) => {
  const clientApp = getClientApp(req);
  const externalUserId = readString(req.body?.external_user_id) || readString(req.body?.externalUserId);
  const roomId = readString(req.body?.room_id) || readString(req.body?.roomId);

  if (!externalUserId) {
    res.status(400).json({ error: "external_user_id is required" });
    return;
  }

  if (!roomId) {
    res.status(400).json({ error: "room_id is required" });
    return;
  }

  const role = readString(req.body?.role) || "publisher";
  const rtcMode = readString(req.body?.rtc_mode) || readString(req.body?.rtcMode) || "voice";
  ensureExternalUser(clientApp.id, externalUserId);
  ensureRoomForRtcMode(clientApp.id, roomId, rtcMode);
  const micEnabled = readBoolean(req.body?.mic_enabled, readBoolean(req.body?.micEnabled, true));
  const cameraEnabled = readBoolean(
    req.body?.camera_enabled,
    readBoolean(req.body?.cameraEnabled, !isAudioOnlyRtcMode(rtcMode)),
  );
  const noiseCancellationEnabled = readBoolean(
    req.body?.noise_cancellation_enabled,
    readBoolean(req.body?.noiseCancellationEnabled, true),
  );
  const permissions = readPermissions(req.body?.permissions, defaultPermissionsForRtcMode(rtcMode, cameraEnabled));

  const session = startSession({
    appId: clientApp.id,
    roomId,
    userId: externalUserId,
    externalUserId,
    role,
    rtcMode,
    micEnabled,
    cameraEnabled,
    speakerEnabled: true,
    noiseCancellationEnabled,
    permissions,
  });

  res.status(201).json({
    session,
    ...issueToken({
      appId: clientApp.id,
      roomId,
      userId: externalUserId,
      externalUserId,
      role,
      rtcMode,
      permissions,
    }),
  });
});

app.post("/client/rtc/session/end", requireClientAuth, (req, res) => {
  const clientApp = getClientApp(req);
  const externalUserId = readString(req.body?.external_user_id) || readString(req.body?.externalUserId);
  const roomId = readString(req.body?.room_id) || readString(req.body?.roomId);

  if (!externalUserId || !roomId) {
    res.status(400).json({ error: "external_user_id and room_id are required" });
    return;
  }

  const session = endSession(clientApp.id, roomId, externalUserId);
  res.json({ ended: Boolean(session), session });
});

app.get("/client/billing/usage", requireClientAuth, (req, res) => {
  const clientApp = getClientApp(req);
  const generatedAt = new Date().toISOString();

  res.json({
    generatedAt,
    generated_at: generatedAt,
    billing: getCompanyBillingSummary(clientApp.id, {
      generatedAt,
      includeSessions: true,
    }),
  });
});

/**
 * Admin/dashboard helper:
 * List generated tokens that backend currently saved.
 */
app.get("/client/rtc/tokens", requireClientAuth, (req, res) => {
  const clientApp = getClientApp(req);

  cleanupExpiredTokens();

  res.json({
    tokens: Array.from(issuedRtcTokens.values())
      .filter((token) => token.appId === clientApp.id)
      .map(serializeStoredToken),
  });
});

/**
 * Admin/dashboard/helper:
 * Verify whether a client token is the exact saved backend token.
 */
app.post("/client/rtc/token/verify", requireClientAuth, (req, res) => {
  const clientApp = getClientApp(req);
  const token = readString(req.body?.token) || getBearerToken(req.header("authorization"));

  if (!token) {
    res.status(400).json({
      valid: false,
      error: "token is required",
    });
    return;
  }

  try {
    const decoded = verifyRtcToken(token);
    const storedToken = issuedRtcTokens.get(token)!;

    if (storedToken.appId !== clientApp.id) {
      res.status(403).json({
        valid: false,
        error: "RTC token belongs to another client app",
      });
      return;
    }

    res.json({
      valid: true,
      token: serializeStoredToken(storedToken),
      decoded,
    });
  } catch (error) {
    res.status(401).json({
      valid: false,
      error: error instanceof Error ? error.message : "Invalid token",
    });
  }
});

/**
 * Admin/dashboard/helper:
 * Revoke generated token so SDK/client can no longer connect.
 */
app.post("/client/rtc/token/revoke", requireClientAuth, (req, res) => {
  const clientApp = getClientApp(req);
  const token = readString(req.body?.token);

  if (!token) {
    res.status(400).json({ revoked: false, error: "token is required" });
    return;
  }

  const storedToken = issuedRtcTokens.get(token);

  if (!storedToken || storedToken.appId !== clientApp.id) {
    res.status(404).json({ revoked: false, error: "Token was not found in backend" });
    return;
  }

  storedToken.revokedAt = new Date().toISOString();

  res.json({
    revoked: true,
    token: serializeStoredToken(storedToken),
  });
});

app.get("/client/security/incidents", requireClientAuth, (req, res) => {
  const clientApp = getClientApp(req);

  res.json({
    incidents: securityIncidents
      .filter((incident) => incident.appId === clientApp.id)
      .slice(-200)
      .reverse(),
  });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.use((socket, next) => {
  const token = getTokenFromHandshake(socket.handshake.auth, socket.handshake.headers.authorization);

  if (!token) {
    next(new Error("RTC token is required"));
    return;
  }

  try {
    const decoded = verifyRtcToken(token);

    socket.data.accessToken = token;
    socket.data.appId = decoded.appId;
    socket.data.appKey = decoded.appKey;
    socket.data.userId = decoded.userId;
    socket.data.externalUserId = decoded.externalUserId;
    socket.data.tokenRoomId = decoded.roomId;
    socket.data.role = decoded.role;
    socket.data.rtcMode = decoded.rtcMode;
    socket.data.permissions = decoded.permissions;
    next();
  } catch (error) {
    next(new Error(error instanceof Error ? error.message : "Invalid or expired RTC token"));
  }
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id, socket.data.appId, socket.data.userId);

  socket.on("room:join", (payload: Record<string, unknown> = {}) => {
    const appId = readString(socket.data.appId) || DEFAULT_CLIENT_APP_ID;
    const roomId = readString(payload.roomId);

    if (!roomId) {
      socket.emit("room:error", { message: "Room id is required" });
      return;
    }

    if (!hasPermission(socket, "join")) {
      socket.emit("room:error", { message: "Token does not allow joining rooms" });
      return;
    }

    const tokenRoomId = socket.data.tokenRoomId as string | undefined;

    if (tokenRoomId && tokenRoomId !== roomId) {
      socket.emit("room:error", { message: "Token is not valid for this room" });
      return;
    }

    const room = ensureRoom(appId, roomId);
    const previousRoomId = socket.data.roomId as string | undefined;
    const externalUserId = readString(socket.data.externalUserId);
    const syncedUser = externalUserId ? users.get(scopedKey(appId, externalUserId)) : undefined;

    if (syncedUser && syncedUser.status !== "active") {
      const incident = recordSecurityIncident({
        appId,
        roomId,
        reporterSocketId: socket.id,
        reporterUserId: externalUserId,
        category: "user_status",
        severity: "high",
        message: `Blocked inactive user status: ${syncedUser.status}`,
        blocked: true,
        metadata: { status: syncedUser.status },
      });

      socket.emit("security:incident", incident);
      socket.emit("room:error", { message: "User is not allowed to join this room" });
      return;
    }

    const userKey = externalUserId || readString(socket.data.userId);
    const activeKick = findActiveRoomHistoryRecord(roomKickHistory, appId, roomId, userKey);

    if (activeKick) {
      socket.emit("room:error", {
        message: activeKick.permanent ? "User is permanently kicked from this room" : "User is temporarily kicked from this room",
        kick: serializeRoomHistoryRecord(activeKick),
      });
      return;
    }

    if (!room.joinEnabled && !canManageRoomByIdentity(room, userKey, socket.data.role as string | undefined)) {
      socket.emit("room:error", { message: "Room join is disabled" });
      return;
    }

    const password = readString(payload.password ?? payload.roomPassword ?? payload.room_password);

    if (room.password && room.password !== password && !canManageRoomByIdentity(room, userKey, socket.data.role as string | undefined)) {
      socket.emit("room:error", { message: "Room password is required" });
      return;
    }

    if (previousRoomId && previousRoomId !== roomId) {
      leaveCurrentRoom(socket, "joined-another-room");
    }

    const participants = getParticipants(appId, roomId);

    if (!participants.has(socket.id) && participants.size >= room.maxParticipants) {
      socket.emit("room:full", {
        roomId,
        maxParticipants: room.maxParticipants,
        message: "Room is full",
      });
      return;
    }

    const rtcMode = (socket.data.rtcMode as string | undefined) ?? room.roomType;
    const micEnabled = readBoolean(payload.micEnabled, true);
    const cameraEnabled = readBoolean(payload.cameraEnabled, !isAudioOnlyRtcMode(rtcMode));
    const noiseCancellationEnabled = readBoolean(payload.noiseCancellationEnabled, true);
    const screenShareEnabled = readBoolean(payload.screenShareEnabled, false);
    const videoEffects = readVideoEffectState(payload.videoEffects ?? payload.video_effects);

    if (micEnabled && !hasPermission(socket, "publish_audio")) {
      socket.emit("room:error", { message: "Token does not allow audio publishing" });
      return;
    }

    if (cameraEnabled && !hasPermission(socket, "publish_video")) {
      socket.emit("room:error", { message: "Token does not allow video publishing" });
      return;
    }

    if (cameraEnabled && isAudioOnlyRtcMode(rtcMode)) {
      socket.emit("room:error", { message: "Audio rooms do not allow camera publishing" });
      return;
    }

    if (screenShareEnabled && !hasPermission(socket, "screen_share")) {
      socket.emit("room:error", { message: "Token does not allow screen sharing" });
      return;
    }

    const existingParticipant = participants.get(socket.id);
    const activeMicCount = Array.from(participants.values()).filter(
      (participant) => participant.socketId !== socket.id && participant.micEnabled,
    ).length;

    if (micEnabled && !existingParticipant?.micEnabled && activeMicCount >= room.maxMicCount) {
      socket.emit("room:error", {
        roomId,
        maxMicCount: room.maxMicCount,
        message: "Room microphone seats are full",
      });
      return;
    }

    const participant: ParticipantState = {
      socketId: socket.id,
      appId,
      roomId,
      userId: socket.data.userId as string,
      externalUserId: socket.data.externalUserId as string | undefined,
      role: (socket.data.role as string | undefined) ?? "publisher",
      rtcMode,
      micEnabled,
      cameraEnabled,
      speakerEnabled: readBoolean(payload.speakerEnabled, true),
      noiseCancellationEnabled,
      screenShareEnabled,
      videoEffects,
      permissions: readPermissions(socket.data.permissions, ["join", "signal"]),
      joinedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };

    participants.set(socket.id, participant);
    socket.join(roomChannel(appId, roomId));
    socket.data.roomId = roomId;

    startSession({
      appId,
      roomId,
      userId: participant.userId,
      externalUserId: participant.externalUserId,
      role: participant.role,
      rtcMode: participant.rtcMode,
      micEnabled: participant.micEnabled,
      cameraEnabled: participant.cameraEnabled,
      speakerEnabled: participant.speakerEnabled,
      noiseCancellationEnabled: participant.noiseCancellationEnabled,
      permissions: participant.permissions,
    });

    socket.emit("room:joined", {
      room: serializeRoom(room),
      participant: serializeParticipant(participant),
      state: getRoomState(appId, roomId),
      youtubeState: getYoutubeRoomState(appId, roomId),
      youtube_state: getYoutubeRoomState(appId, roomId),
      livePkState: getLivePkState(appId, roomId),
      live_pk_state: getLivePkState(appId, roomId),
    });

    socket.emit(
      "existing-users",
      Array.from(participants.keys()).filter((socketId) => socketId !== socket.id),
    );

    const youtubeState = getYoutubeRoomState(appId, roomId);

    if (youtubeState) {
      socket.emit("youtube:state", youtubeState);
    }

    const livePkState = getLivePkState(appId, roomId);

    if (livePkState) {
      socket.emit("live:pk:state", livePkState);
    }

    socket.emit("message:history", {
      messages: getRoomMessages(appId, roomId).slice(-50).map(serializeChatMessage),
    });

    socket.emit("gift:history", {
      gifts: getRoomGifts(appId, roomId).slice(-50).map(serializeGift),
    });

    socket.to(roomChannel(appId, roomId)).emit("user-joined", socket.id);
    socket.to(roomChannel(appId, roomId)).emit("participant:joined", serializeParticipant(participant));
    if (room.entryNotificationsEnabled) {
      socket.to(roomChannel(appId, roomId)).emit("room:entry", {
        participant: serializeParticipant(participant),
        message: `${participant.externalUserId ?? participant.userId} joined the room`,
        createdAt: new Date().toISOString(),
      });
    }
    io.to(roomChannel(appId, roomId)).emit("room:state", getRoomState(appId, roomId));
  });

  socket.on("room:leave", () => {
    leaveCurrentRoom(socket, "left", true);
  });

  socket.on("media:state", (payload: Record<string, unknown> = {}) => {
    const appId = readString(socket.data.appId) || DEFAULT_CLIENT_APP_ID;
    const roomId = socket.data.roomId as string | undefined;

    if (!roomId) {
      socket.emit("room:error", { message: "Join a room before updating media state" });
      return;
    }

    const participants = getParticipants(appId, roomId);
    const participant = participants.get(socket.id);

    if (!participant) {
      return;
    }

    const room = ensureRoom(appId, roomId);
    const nextMicEnabled = readBoolean(payload.micEnabled, participant.micEnabled);
    const nextCameraEnabled = readBoolean(payload.cameraEnabled, participant.cameraEnabled);

    if (nextMicEnabled && !participant.permissions.includes("publish_audio") && !participant.permissions.includes("moderate")) {
      socket.emit("room:error", { message: "Token does not allow audio publishing" });
      return;
    }

    if (nextCameraEnabled && !participant.permissions.includes("publish_video") && !participant.permissions.includes("moderate")) {
      socket.emit("room:error", { message: "Token does not allow video publishing" });
      return;
    }

    if (nextCameraEnabled && isAudioOnlyRtcMode(participant.rtcMode)) {
      socket.emit("room:error", { message: "Audio rooms do not allow camera publishing" });
      return;
    }

    const activeMicCount = Array.from(participants.values()).filter(
      (otherParticipant) => otherParticipant.socketId !== socket.id && otherParticipant.micEnabled,
    ).length;

    if (nextMicEnabled && !participant.micEnabled && activeMicCount >= room.maxMicCount) {
      socket.emit("room:error", {
        roomId,
        maxMicCount: room.maxMicCount,
        message: "Room microphone seats are full",
      });
      return;
    }

    participant.micEnabled = nextMicEnabled;
    participant.cameraEnabled = nextCameraEnabled;
    participant.speakerEnabled = readBoolean(payload.speakerEnabled, participant.speakerEnabled);
    participant.noiseCancellationEnabled = readBoolean(
      payload.noiseCancellationEnabled,
      participant.noiseCancellationEnabled,
    );
    const nextScreenShareEnabled = readBoolean(payload.screenShareEnabled, participant.screenShareEnabled);

    if (nextScreenShareEnabled && !participant.permissions.includes("screen_share") && !participant.permissions.includes("moderate")) {
      socket.emit("room:error", { message: "Token does not allow screen sharing" });
      return;
    }

    participant.screenShareEnabled = nextScreenShareEnabled;

    if (payload.videoEffects || payload.video_effects) {
      participant.videoEffects = readVideoEffectState(payload.videoEffects ?? payload.video_effects, participant.videoEffects);
      io.to(roomChannel(appId, roomId)).emit("video:effects", {
        participant: serializeParticipant(participant),
        effects: participant.videoEffects,
      });
    }
    participant.lastSeenAt = new Date().toISOString();

    const sessionId = activeSessionByUserRoom.get(
      sessionKey(appId, roomId, participant.externalUserId ?? participant.userId),
    );
    const session = sessionId ? sessions.get(sessionId) : undefined;

    if (session && !session.endedAt) {
      session.micEnabled = participant.micEnabled;
      session.cameraEnabled = participant.cameraEnabled;
      session.speakerEnabled = participant.speakerEnabled;
      session.noiseCancellationEnabled = participant.noiseCancellationEnabled;
    }

    io.to(roomChannel(appId, roomId)).emit("participant:updated", serializeParticipant(participant));
    io.to(roomChannel(appId, roomId)).emit("screen:state", {
      participant: serializeParticipant(participant),
      screenShareEnabled: participant.screenShareEnabled,
      screen_share_enabled: participant.screenShareEnabled,
    });
    io.to(roomChannel(appId, roomId)).emit("room:state", getRoomState(appId, roomId));
  });

  socket.on("screen:state", (payload: Record<string, unknown> = {}) => {
    const appId = readString(socket.data.appId) || DEFAULT_CLIENT_APP_ID;
    const roomId = socket.data.roomId as string | undefined;

    if (!roomId) {
      socket.emit("room:error", { message: "Join a room before updating screen share state" });
      return;
    }

    const participant = getParticipants(appId, roomId).get(socket.id);

    if (!participant) {
      return;
    }

    const enabled = readBoolean(payload.enabled ?? payload.screenShareEnabled ?? payload.screen_share_enabled, false);

    if (enabled && !participant.permissions.includes("screen_share") && !participant.permissions.includes("moderate")) {
      socket.emit("room:error", { message: "Token does not allow screen sharing" });
      return;
    }

    participant.screenShareEnabled = enabled;
    participant.lastSeenAt = new Date().toISOString();

    io.to(roomChannel(appId, roomId)).emit("screen:state", {
      participant: serializeParticipant(participant),
      screenShareEnabled: enabled,
      screen_share_enabled: enabled,
    });
    io.to(roomChannel(appId, roomId)).emit("participant:updated", serializeParticipant(participant));
    io.to(roomChannel(appId, roomId)).emit("room:state", getRoomState(appId, roomId));
  });

  socket.on("video:effects", (payload: Record<string, unknown> = {}) => {
    const appId = readString(socket.data.appId) || DEFAULT_CLIENT_APP_ID;
    const roomId = socket.data.roomId as string | undefined;

    if (!roomId) {
      socket.emit("room:error", { message: "Join a room before updating video effects" });
      return;
    }

    const participant = getParticipants(appId, roomId).get(socket.id);

    if (!participant) {
      return;
    }

    participant.videoEffects = readVideoEffectState(payload, participant.videoEffects);
    participant.lastSeenAt = new Date().toISOString();

    io.to(roomChannel(appId, roomId)).emit("video:effects", {
      participant: serializeParticipant(participant),
      effects: participant.videoEffects,
    });
    io.to(roomChannel(appId, roomId)).emit("participant:updated", serializeParticipant(participant));
  });

  socket.on("live:pk:update", (payload: Record<string, unknown> = {}) => {
    const appId = readString(socket.data.appId) || DEFAULT_CLIENT_APP_ID;
    const roomId = socket.data.roomId as string | undefined;

    if (!roomId) {
      socket.emit("room:error", { message: "Join a room before updating live PK state" });
      return;
    }

    const participant = getParticipants(appId, roomId).get(socket.id);

    if (!participant) {
      return;
    }

    if (!canControlLive(participant)) {
      socket.emit("room:error", { message: "Token does not allow live PK control" });
      return;
    }

    const previousState = livePkStates.get(scopedKey(appId, roomId));
    const status = readLivePkStatus(payload.status) ?? previousState?.status ?? "idle";
    const now = new Date().toISOString();
    const state: LivePkState = {
      appId,
      roomId,
      status,
      hostUserId: readString(payload.hostUserId)
        || readString(payload.host_user_id)
        || previousState?.hostUserId
        || participant.externalUserId
        || participant.userId,
      opponentUserId: readString(payload.opponentUserId)
        || readString(payload.opponent_user_id)
        || previousState?.opponentUserId,
      hostScore: readNonNegativeNumber(payload.hostScore ?? payload.host_score, previousState?.hostScore ?? 0),
      opponentScore: readNonNegativeNumber(payload.opponentScore ?? payload.opponent_score, previousState?.opponentScore ?? 0),
      startedAt: status === "active" ? previousState?.startedAt ?? now : previousState?.startedAt,
      endedAt: status === "ended" ? now : undefined,
      updatedAt: now,
      metadata: readRecord(payload.metadata) ?? previousState?.metadata ?? {},
    };

    livePkStates.set(scopedKey(appId, roomId), state);
    io.to(roomChannel(appId, roomId)).emit("live:pk:state", serializeLivePkState(state));
  });

  socket.on("youtube:update", (payload: Record<string, unknown> = {}) => {
    const appId = readString(socket.data.appId) || DEFAULT_CLIENT_APP_ID;
    const roomId = socket.data.roomId as string | undefined;

    if (!roomId) {
      socket.emit("youtube:error", { message: "Join a room before updating YouTube playback" });
      return;
    }

    const participants = getParticipants(appId, roomId);
    const participant = participants.get(socket.id);

    if (!participant) {
      socket.emit("youtube:error", { message: "Participant is not in this room" });
      return;
    }

    if (!canControlYoutube(participant)) {
      socket.emit("youtube:error", { message: "Token does not allow YouTube room control" });
      return;
    }

    const videoInput = readString(payload.videoId)
      || readString(payload.video_id)
      || readString(payload.videoUrl)
      || readString(payload.video_url);
    const previousState = getYoutubeRoomState(appId, roomId);
    const videoId = parseYoutubeVideoId(videoInput) || previousState?.videoId || "";

    if (!videoId) {
      socket.emit("youtube:error", { message: "A valid YouTube video id or URL is required" });
      return;
    }

    const playbackState = readYoutubePlaybackState(payload.playbackState ?? payload.playback_state)
      ?? previousState?.playbackState
      ?? "ready";
    const positionSeconds = readNonNegativeNumber(
      payload.positionSeconds ?? payload.position_seconds,
      previousState?.positionSeconds ?? 0,
    );
    const videoUrl = readString(payload.videoUrl) || readString(payload.video_url) || previousState?.videoUrl;
    const title = readString(payload.title) || previousState?.title;
    const state: YoutubeRoomState = {
      appId,
      roomId,
      videoId,
      ...(videoUrl ? { videoUrl } : {}),
      ...(title ? { title } : {}),
      playbackState,
      positionSeconds,
      updatedAt: new Date().toISOString(),
      updatedBy: participant.externalUserId ?? participant.userId,
    };

    youtubeRoomStates.set(scopedKey(appId, roomId), state);
    io.to(roomChannel(appId, roomId)).emit("youtube:state", serializeYoutubeRoomState(state));
  });

  socket.on("security:check", (payload: Record<string, unknown> = {}, callback?: (result: unknown) => void) => {
    const appId = readString(socket.data.appId) || DEFAULT_CLIENT_APP_ID;
    const roomId = socket.data.roomId as string | undefined;
    const text = readString(payload.text ?? payload.message ?? payload.content);
    const category = readString(payload.category) || "text";
    const result = evaluateSecurityContent(text, category);

    if (!result.allowed) {
      const incident = recordSecurityIncident({
        appId,
        roomId,
        reporterSocketId: socket.id,
        reporterUserId: readString(socket.data.externalUserId) || readString(socket.data.userId),
        category,
        severity: result.severity,
        message: result.reason,
        blocked: true,
        metadata: {
          signals: result.signals,
        },
      });

      emitSecurityIncident(appId, roomId, incident);
    }

    const response = {
      allowed: result.allowed,
      severity: result.severity,
      reason: result.reason,
      signals: result.signals,
    };

    if (typeof callback === "function") {
      callback(response);
      return;
    }

    socket.emit("security:checked", response);
  });

  socket.on("security:report", (payload: Record<string, unknown> = {}) => {
    const appId = readString(socket.data.appId) || DEFAULT_CLIENT_APP_ID;
    const roomId = socket.data.roomId as string | undefined;
    const category = readString(payload.category) || "manual_report";
    const message = readString(payload.message) || "Security report";
    const result = evaluateSecurityContent(message, category);
    const incident = recordSecurityIncident({
      appId,
      roomId,
      reporterSocketId: socket.id,
      reporterUserId: readString(socket.data.externalUserId) || readString(socket.data.userId),
      targetUserId: readString(payload.targetUserId) || readString(payload.target_user_id),
      category,
      severity: readSecuritySeverity(payload.severity) ?? result.severity,
      message,
      blocked: readBoolean(payload.blocked, !result.allowed),
      metadata: readRecord(payload.metadata) ?? {
        signals: result.signals,
      },
    });

    if (roomId) {
      emitSecurityIncident(appId, roomId, incident);
    } else {
      socket.emit("security:incident", incident);
    }
  });

  socket.on("message:send", (payload: Record<string, unknown> = {}, callback?: (result: unknown) => void) => {
    handleSendRoomMessage(socket, payload, undefined, callback);
  });

  socket.on("comment:send", (payload: Record<string, unknown> = {}, callback?: (result: unknown) => void) => {
    handleSendRoomMessage(socket, payload, "comment", callback);
  });

  socket.on("message:list", (payload: Record<string, unknown> = {}, callback?: (result: unknown) => void) => {
    const result = withJoinedParticipant(socket, "message:error", (context) => {
      const limit = readBoundedNumber(payload.limit, 50, 1, 200);
      return { messages: getRoomMessages(context.appId, context.roomId).slice(-limit).map(serializeChatMessage) };
    });

    if (callback) {
      callback(result);
    } else {
      socket.emit("message:history", result);
    }
  });

  socket.on("message:unsend", (payload: Record<string, unknown> = {}) => {
    updateMessageStatus(socket, payload, "unsent");
  });

  socket.on("message:delete", (payload: Record<string, unknown> = {}) => {
    updateMessageStatus(socket, payload, "deleted");
  });

  socket.on("gift:send", (payload: Record<string, unknown> = {}, callback?: (result: unknown) => void) => {
    const result = withJoinedParticipant(socket, "gift:error", ({ appId, roomId, participant }) => {
      const assetUrl = readString(payload.assetUrl ?? payload.asset_url ?? payload.url);
      const assetType = normalizeGiftAssetType(payload.assetType ?? payload.asset_type ?? assetUrl);

      if (!assetUrl || !assetType) {
        return { error: "Gift asset must be svga, svg, png, jpg, jpeg, webp, gif, json, or lottie" };
      }

      const gift: GiftRecord = {
        id: randomUUID(),
        appId,
        roomId,
        senderSocketId: socket.id,
        senderUserId: participant.userId,
        senderExternalUserId: participant.externalUserId,
        giftId: readString(payload.giftId ?? payload.gift_id) || randomUUID(),
        name: readString(payload.name) || "Gift",
        assetUrl,
        assetType,
        quantity: readBoundedNumber(payload.quantity, 1, 1, 999),
        receiverUserId: readString(payload.receiverUserId ?? payload.receiver_user_id),
        metadata: readRecord(payload.metadata) ?? {},
        createdAt: new Date().toISOString(),
      };

      getRoomGifts(appId, roomId).push(gift);
      trimRecords(getRoomGifts(appId, roomId), 500);
      io.to(roomChannel(appId, roomId)).emit("gift:received", serializeGift(gift));
      return { gift: serializeGift(gift) };
    });

    callback?.(result);
  });

  socket.on("room:profile:update", (payload: Record<string, unknown> = {}) => {
    updateRoomProfile(socket, payload);
  });

  socket.on("room:settings:update", (payload: Record<string, unknown> = {}) => {
    updateRoomSettings(socket, payload);
  });

  socket.on("room:theme:update", (payload: Record<string, unknown> = {}) => {
    updateRoomTheme(socket, payload);
  });

  socket.on("room:announcement:update", (payload: Record<string, unknown> = {}) => {
    updateRoomAnnouncement(socket, payload);
  });

  socket.on("room:admins:update", (payload: Record<string, unknown> = {}) => {
    updateRoomAdmins(socket, payload);
  });

  socket.on("room:kick", (payload: Record<string, unknown> = {}) => {
    kickRoomUser(socket, payload);
  });

  socket.on("room:kick:history:list", (payload: Record<string, unknown> = {}, callback?: (result: unknown) => void) => {
    const result = withJoinedParticipant(socket, "room:error", ({ appId, roomId, participant }) => {
      if (!canManageRoom(participant, ensureRoom(appId, roomId))) {
        return { error: "Only room admins can read kick history" };
      }

      return {
        history: getRoomHistory(roomKickHistory, appId, roomId).map(serializeRoomHistoryRecord),
      };
    });

    if (callback) {
      callback(result);
    } else {
      socket.emit("room:kick:history", result);
    }
  });

  socket.on("room:kick:history:update", (payload: Record<string, unknown> = {}) => {
    updateRoomHistoryRecord(socket, payload, roomKickHistory, "room:kick:history");
  });

  socket.on("room:comments:clean", (payload: Record<string, unknown> = {}) => {
    cleanRoomComments(socket, payload);
  });

  socket.on("comment:clean", (payload: Record<string, unknown> = {}) => {
    cleanRoomComments(socket, payload);
  });

  socket.on("participant:mic:mute", (payload: Record<string, unknown> = {}) => {
    muteParticipantMic(socket, payload);
  });

  socket.on("chat:ban", (payload: Record<string, unknown> = {}) => {
    setChatBan(socket, payload);
  });

  socket.on("chat:ban:history:list", (payload: Record<string, unknown> = {}, callback?: (result: unknown) => void) => {
    const result = withJoinedParticipant(socket, "chat:error", ({ appId, roomId, participant }) => {
      if (!canManageRoom(participant, ensureRoom(appId, roomId))) {
        return { error: "Only room admins can read chat ban history" };
      }

      return {
        history: getRoomHistory(roomChatBanHistory, appId, roomId).map(serializeRoomHistoryRecord),
      };
    });

    if (callback) {
      callback(result);
    } else {
      socket.emit("chat:ban:history", result);
    }
  });

  socket.on("chat:ban:history:update", (payload: Record<string, unknown> = {}) => {
    updateRoomHistoryRecord(socket, payload, roomChatBanHistory, "chat:ban:history");
  });

  socket.on("room:like", (_payload: Record<string, unknown> = {}) => {
    likeRoom(socket);
  });

  socket.on("room:share", (payload: Record<string, unknown> = {}) => {
    shareRoom(socket, payload);
  });

  socket.on("user:block", (payload: Record<string, unknown> = {}) => {
    setUserBlock(socket, payload, true);
  });

  socket.on("user:unblock", (payload: Record<string, unknown> = {}) => {
    setUserBlock(socket, payload, false);
  });

  socket.on("user:block:list", (_payload: Record<string, unknown> = {}, callback?: (result: unknown) => void) => {
    const appId = readString(socket.data.appId) || DEFAULT_CLIENT_APP_ID;
    const blockerUserId = getSocketUserKey(socket);
    const blocks = getUserBlockHistory(appId, blockerUserId).map(serializeUserBlockRecord);
    const result = { blocks };
    if (callback) {
      callback(result);
    } else {
      socket.emit("user:block:history", result);
    }
  });

  socket.on("signal", ({ to, data }: { to?: string; data?: unknown } = {}) => {
    if (typeof to !== "string" || !data || !hasPermission(socket, "signal")) {
      return;
    }

    const fromAppId = readString(socket.data.appId) || DEFAULT_CLIENT_APP_ID;
    const fromRoomId = socket.data.roomId as string | undefined;
    const targetRoom = findParticipantRoom(to);

    if (!fromRoomId || targetRoom?.appId !== fromAppId || targetRoom.roomId !== fromRoomId) {
      socket.emit("signal:error", { message: "Target peer is not in the same room" });
      return;
    }

    io.to(to).emit("signal", {
      from: socket.id,
      data,
    });
  });

  socket.on("disconnect", (reason) => {
    leaveCurrentRoom(socket, reason);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`RTC Server running on http://${HOST}:${PORT}`);
  console.log(`Open backend status at http://localhost:${PORT}`);
});

function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req.header("authorization"));

  if (!token || token !== RTC_ADMIN_KEY) {
    res.status(401).json({
      error: "Valid admin API key is required",
      hint: "Set Authorization: Bearer <RTC_ADMIN_KEY>. The local dev default is rtc-admin-dev-key.",
    });
    return;
  }

  next();
}

function requireClientAuth(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req.header("authorization"));
  const apiKey = token ? apiKeysBySecret.get(token) : undefined;

  if (!apiKey || apiKey.revokedAt) {
    res.status(401).json({
      error: "Valid client API key is required",
      hint: "Set Authorization: Bearer <client_api_key>. The local dev default is rtc-dev-api-key.",
    });
    return;
  }

  const clientApp = clientApps.get(apiKey.appId);

  if (!clientApp) {
    res.status(401).json({
      error: "Client app for this API key was not found",
    });
    return;
  }

  apiKey.lastUsedAt = new Date().toISOString();
  (req as ClientAuthedRequest).clientApp = clientApp;
  (req as ClientAuthedRequest).clientApiKey = apiKey;
  next();
}

function getClientApp(req: Request) {
  return (req as ClientAuthedRequest).clientApp ?? clientApps.get(DEFAULT_CLIENT_APP_ID)!;
}

function bootstrapDefaultClientApp() {
  if (clientApps.has(DEFAULT_CLIENT_APP_ID)) {
    return;
  }

  createClientApp({
    id: DEFAULT_CLIENT_APP_ID,
    appKey: RTC_APP_KEY,
    name: "RTC Platform Client",
    packageName: "local.dev",
    allowedOrigins: ["*"],
    metadata: { environment: "development" },
    keyLabel: "Local development API key",
    apiKey: RTC_API_KEY,
  });
}

function createClientApp({
  id,
  appKey,
  name,
  packageName,
  allowedOrigins = [],
  metadata = {},
  keyLabel = "Default API key",
  apiKey,
}: {
  id: string;
  name: string;
  packageName?: string;
  allowedOrigins?: string[];
  metadata?: Record<string, unknown>;
  keyLabel?: string;
  apiKey?: string;
  appKey?: string;
}) {
  const now = new Date().toISOString();
  const appRecord: ClientApp = {
    id,
    appKey: appKey || createRtcAppKey(),
    name,
    ...(packageName ? { packageName } : {}),
    allowedOrigins,
    metadata,
    createdAt: now,
    updatedAt: now,
  };

  clientApps.set(id, appRecord);

  const keyRecord = createApiKey({
    appId: id,
    label: keyLabel,
    secret: apiKey,
  });

  return { app: appRecord, apiKey: keyRecord };
}

function createApiKey({
  appId,
  label,
  secret,
}: {
  appId: string;
  label: string;
  secret?: string;
}) {
  const keyRecord: StoredApiKey = {
    id: `key_${randomUUID()}`,
    appId,
    secret: secret || createClientApiKeySecret(),
    label,
    createdAt: new Date().toISOString(),
  };

  apiKeysBySecret.set(keyRecord.secret, keyRecord);
  return keyRecord;
}

function findApiKeyById(appId: string, keyId: string) {
  return Array.from(apiKeysBySecret.values()).find(
    (apiKey) => apiKey.appId === appId && apiKey.id === keyId,
  );
}

function deleteClientApp(appId: string) {
  const scopedPrefix = `${encodeURIComponent(appId)}:`;
  const deleted = {
    apiKeys: 0,
    users: 0,
    rooms: 0,
    sessions: 0,
    rtcTokens: 0,
    roomStates: 0,
    messages: 0,
    moderationRecords: 0,
    securityIncidents: 0,
    sockets: 0,
  };

  clientApps.delete(appId);

  for (const [secret, apiKey] of apiKeysBySecret.entries()) {
    if (apiKey.appId === appId) {
      apiKeysBySecret.delete(secret);
      deleted.apiKeys += 1;
    }
  }

  deleted.users += deleteMapEntriesByScopedPrefix(users, scopedPrefix);
  deleted.rooms += deleteMapEntriesByScopedPrefix(rooms, scopedPrefix);
  deleted.roomStates += deleteMapEntriesByScopedPrefix(roomParticipants, scopedPrefix);
  deleted.roomStates += deleteMapEntriesByScopedPrefix(youtubeRoomStates, scopedPrefix);
  deleted.roomStates += deleteMapEntriesByScopedPrefix(livePkStates, scopedPrefix);
  deleted.messages += deleteMapEntriesByScopedPrefix(roomMessages, scopedPrefix);
  deleted.messages += deleteMapEntriesByScopedPrefix(roomGifts, scopedPrefix);
  deleted.moderationRecords += deleteMapEntriesByScopedPrefix(roomKickHistory, scopedPrefix);
  deleted.moderationRecords += deleteMapEntriesByScopedPrefix(roomChatBanHistory, scopedPrefix);
  deleted.moderationRecords += deleteMapEntriesByScopedPrefix(userBlockHistory, scopedPrefix);
  deleted.moderationRecords += deleteMapEntriesByScopedPrefix(roomLikeUsers, scopedPrefix);

  for (const [sessionId, session] of sessions.entries()) {
    if (session.appId === appId) {
      sessions.delete(sessionId);
      deleted.sessions += 1;
    }
  }

  deleted.sessions += deleteMapEntriesByScopedPrefix(activeSessionByUserRoom, scopedPrefix);

  for (const [token, storedToken] of issuedRtcTokens.entries()) {
    if (storedToken.appId === appId) {
      issuedRtcTokens.delete(token);
      deleted.rtcTokens += 1;
    }
  }

  for (let index = securityIncidents.length - 1; index >= 0; index -= 1) {
    if (securityIncidents[index]?.appId === appId) {
      securityIncidents.splice(index, 1);
      deleted.securityIncidents += 1;
    }
  }

  for (const socket of io.sockets.sockets.values()) {
    if (readString(socket.data.appId) === appId) {
      leaveCurrentRoom(socket, "client_app_deleted", true);
      socket.emit("room:error", "Client app was deleted");
      socket.disconnect(true);
      deleted.sockets += 1;
    }
  }

  return deleted;
}

function deleteMapEntriesByScopedPrefix<K extends string, V>(store: Map<K, V>, scopedPrefix: string) {
  let deleted = 0;

  for (const key of Array.from(store.keys())) {
    if (key.startsWith(scopedPrefix)) {
      store.delete(key);
      deleted += 1;
    }
  }

  return deleted;
}

function createClientApiKeySecret() {
  return `rtc_${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`;
}

function createRtcAppKey() {
  return `app_${randomUUID().replace(/-/g, "")}`;
}

function issueToken({
  appId,
  roomId,
  userId,
  externalUserId,
  role,
  rtcMode,
  permissions,
}: {
  appId: string;
  roomId?: string;
  userId: string;
  externalUserId?: string;
  role: string;
  rtcMode: string;
  permissions: RtcPermission[];
}) {
  const tokenId = randomUUID();
  const appKey = clientApps.get(appId)?.appKey;

  const payload: RtcAccessToken = {
    scope: "rtc",
    appId,
    ...(appKey ? { appKey } : {}),
    userId,
    ...(externalUserId ? { externalUserId } : {}),
    ...(roomId ? { roomId } : {}),
    role,
    rtcMode,
    permissions,
  };

  const token = jwt.sign(payload, RTC_TOKEN_SECRET, {
    expiresIn: RTC_TOKEN_EXPIRES_IN,
    issuer: RTC_TOKEN_ISSUER,
    subject: userId,
    jwtid: tokenId,
  });

  const decoded = jwt.decode(token) as JwtPayload | null;
  const issuedAt = typeof decoded?.iat === "number"
    ? new Date(decoded.iat * 1000).toISOString()
    : new Date().toISOString();
  const expiresAt = typeof decoded?.exp === "number"
    ? new Date(decoded.exp * 1000).toISOString()
    : undefined;

  const storedToken: StoredRtcToken = {
    token,
    tokenId,
    appId,
    ...(appKey ? { appKey } : {}),
    userId,
    externalUserId,
    ...(roomId ? { roomId } : {}),
    role,
    rtcMode,
    permissions,
    issuedAt,
    expiresAt,
  };

  issuedRtcTokens.set(token, storedToken);

  return {
    token,
    accessToken: token,
    access_token: token,
    tokenId,
    token_id: tokenId,
    tokenType: "Bearer",
    token_type: "Bearer",
    expiresIn: RTC_TOKEN_EXPIRES_IN,
    expires_in: RTC_TOKEN_EXPIRES_IN,
    expiresAt,
    expires_at: expiresAt,
    appId,
    app_id: appId,
    ...(appKey ? { appKey, app_key: appKey } : {}),
    userId,
    user_id: userId,
    ...(externalUserId ? { externalUserId, external_user_id: externalUserId } : {}),
    ...(roomId
      ? {
        roomId,
        room_id: Number.isFinite(Number(roomId)) ? Number(roomId) : roomId,
      }
      : {}),
    role,
    rtcMode,
    rtc_mode: rtcMode,
    permissions,
  };
}

function verifyRtcToken(token: string) {
  cleanupExpiredTokens();

  const storedToken = issuedRtcTokens.get(token);

  if (!storedToken) {
    throw new Error("RTC token is not saved in backend");
  }

  if (storedToken.revokedAt) {
    throw new Error("RTC token was revoked");
  }

  if (storedToken.expiresAt && Date.now() >= Date.parse(storedToken.expiresAt)) {
    issuedRtcTokens.delete(token);
    throw new Error("RTC token is expired");
  }

  const decoded = jwt.verify(token, RTC_TOKEN_SECRET, {
    issuer: RTC_TOKEN_ISSUER,
  }) as RtcAccessToken;

  if (decoded.scope !== "rtc" || typeof decoded.userId !== "string" || typeof decoded.appId !== "string") {
    throw new Error("Invalid RTC token payload");
  }

  if (decoded.appId !== storedToken.appId) {
    throw new Error("RTC token client app does not match saved token");
  }

  if (storedToken.appKey && decoded.appKey !== storedToken.appKey) {
    throw new Error("RTC token app key does not match saved token");
  }

  if (decoded.jti && decoded.jti !== storedToken.tokenId) {
    throw new Error("RTC token id does not match saved token");
  }

  if (decoded.userId !== storedToken.userId) {
    throw new Error("RTC token user does not match saved token");
  }

  if (decoded.externalUserId !== storedToken.externalUserId) {
    throw new Error("RTC token external user does not match saved token");
  }

  if (decoded.roomId !== storedToken.roomId) {
    throw new Error("RTC token room does not match saved token");
  }

  storedToken.lastUsedAt = new Date().toISOString();

  return {
    ...decoded,
    appId: decoded.appId || storedToken.appId,
    appKey: decoded.appKey || storedToken.appKey,
    role: readString(decoded.role) || storedToken.role || "publisher",
    rtcMode: readString(decoded.rtcMode) || storedToken.rtcMode || "video",
    permissions: readPermissions(decoded.permissions, storedToken.permissions),
  };
}

function getTokenFromHandshake(socketAuth: unknown, authorizationHeader: string | string[] | undefined) {
  if (
    socketAuth &&
    typeof socketAuth === "object" &&
    "token" in socketAuth &&
    typeof socketAuth.token === "string"
  ) {
    return socketAuth.token;
  }

  if (
    socketAuth &&
    typeof socketAuth === "object" &&
    "accessToken" in socketAuth &&
    typeof socketAuth.accessToken === "string"
  ) {
    return socketAuth.accessToken;
  }

  const authorization = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]
    : authorizationHeader;

  return getBearerToken(authorization);
}

function getBearerToken(authorization: string | undefined) {
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }

  return "";
}

function cleanupExpiredTokens() {
  const now = Date.now();

  for (const [token, storedToken] of issuedRtcTokens.entries()) {
    if (storedToken.expiresAt && now >= Date.parse(storedToken.expiresAt)) {
      issuedRtcTokens.delete(token);
    }
  }
}

function isStoredTokenActive(storedToken: StoredRtcToken) {
  if (storedToken.revokedAt) {
    return false;
  }

  if (storedToken.expiresAt && Date.now() >= Date.parse(storedToken.expiresAt)) {
    return false;
  }

  return true;
}

function serializeStoredToken(storedToken: StoredRtcToken) {
  return {
    tokenId: storedToken.tokenId,
    token_id: storedToken.tokenId,
    tokenPreview: `${storedToken.token.slice(0, 24)}...${storedToken.token.slice(-12)}`,
    token_preview: `${storedToken.token.slice(0, 24)}...${storedToken.token.slice(-12)}`,
    appId: storedToken.appId,
    app_id: storedToken.appId,
    appKey: storedToken.appKey,
    app_key: storedToken.appKey,
    userId: storedToken.userId,
    user_id: storedToken.userId,
    externalUserId: storedToken.externalUserId,
    external_user_id: storedToken.externalUserId,
    roomId: storedToken.roomId,
    room_id: Number.isFinite(Number(storedToken.roomId)) ? Number(storedToken.roomId) : storedToken.roomId,
    role: storedToken.role,
    rtcMode: storedToken.rtcMode,
    rtc_mode: storedToken.rtcMode,
    permissions: storedToken.permissions,
    issuedAt: storedToken.issuedAt,
    issued_at: storedToken.issuedAt,
    expiresAt: storedToken.expiresAt,
    expires_at: storedToken.expiresAt,
    revokedAt: storedToken.revokedAt,
    revoked_at: storedToken.revokedAt,
    lastUsedAt: storedToken.lastUsedAt,
    last_used_at: storedToken.lastUsedAt,
    active: isStoredTokenActive(storedToken),
  };
}

function serializeClientApp(clientApp: ClientApp) {
  return {
    id: clientApp.id,
    appId: clientApp.id,
    app_id: clientApp.id,
    appKey: clientApp.appKey,
    app_key: clientApp.appKey,
    name: clientApp.name,
    packageName: clientApp.packageName,
    package_name: clientApp.packageName,
    allowedOrigins: clientApp.allowedOrigins,
    allowed_origins: clientApp.allowedOrigins,
    metadata: clientApp.metadata,
    createdAt: clientApp.createdAt,
    created_at: clientApp.createdAt,
    updatedAt: clientApp.updatedAt,
    updated_at: clientApp.updatedAt,
  };
}

function serializeApiKey(apiKey: StoredApiKey, includeSecret = false) {
  return {
    id: apiKey.id,
    keyId: apiKey.id,
    key_id: apiKey.id,
    appId: apiKey.appId,
    app_id: apiKey.appId,
    label: apiKey.label,
    keyPreview: `${apiKey.secret.slice(0, 10)}...${apiKey.secret.slice(-8)}`,
    key_preview: `${apiKey.secret.slice(0, 10)}...${apiKey.secret.slice(-8)}`,
    ...(includeSecret
      ? {
        secret: apiKey.secret,
        apiKey: apiKey.secret,
        api_key: apiKey.secret,
        clientApiKey: apiKey.secret,
        client_api_key: apiKey.secret,
        serverSecret: apiKey.secret,
        server_secret: apiKey.secret,
      }
      : {}),
    createdAt: apiKey.createdAt,
    created_at: apiKey.createdAt,
    lastUsedAt: apiKey.lastUsedAt,
    last_used_at: apiKey.lastUsedAt,
    revokedAt: apiKey.revokedAt,
    revoked_at: apiKey.revokedAt,
    active: !apiKey.revokedAt,
  };
}

function createUniqueAppId(value: string) {
  const base = slugify(value) || `app-${randomUUID().slice(0, 8)}`;
  let candidate = base;
  let suffix = 2;

  while (clientApps.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function scopedKey(...parts: string[]) {
  return parts.map((part) => encodeURIComponent(part)).join(":");
}

function roomChannel(appId: string, roomId: string) {
  return scopedKey("room", appId, roomId);
}

function ensureExternalUser(appId: string, externalUserId: string) {
  const key = scopedKey(appId, externalUserId);

  if (users.has(key)) {
    return users.get(key)!;
  }

  const now = new Date().toISOString();
  const user: ExternalUser = {
    appId,
    externalUserId,
    name: externalUserId,
    email: "",
    status: "active",
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };

  users.set(key, user);
  return user;
}

function ensureRoom(appId: string, roomId: string, overrides: Partial<RoomRecord> = {}) {
  const key = scopedKey(appId, roomId);
  const existing = rooms.get(key);
  const now = new Date().toISOString();

  if (existing) {
    const updated: RoomRecord = {
      ...existing,
      ...overrides,
      appId,
      id: roomId,
      theme: overrides.theme ?? existing.theme ?? {},
      superAdmins: overrides.superAdmins ?? existing.superAdmins ?? [],
      admins: overrides.admins ?? existing.admins ?? [],
      joinEnabled: overrides.joinEnabled ?? existing.joinEnabled ?? true,
      entryNotificationsEnabled: overrides.entryNotificationsEnabled ?? existing.entryNotificationsEnabled ?? true,
      likeCount: overrides.likeCount ?? existing.likeCount ?? 0,
      shareCount: overrides.shareCount ?? existing.shareCount ?? 0,
      metadata: overrides.metadata ?? existing.metadata,
      updatedAt: now,
    };
    rooms.set(key, updated);
    return updated;
  }

  const room: RoomRecord = {
    appId,
    id: roomId,
    name: overrides.name ?? `Room ${roomId}`,
    roomType: overrides.roomType ?? "video",
    privacyType: overrides.privacyType ?? "public",
    maxParticipants: overrides.maxParticipants ?? DEFAULT_ROOM_CAPACITY,
    maxMicCount: overrides.maxMicCount ?? DEFAULT_ROOM_CAPACITY,
    chatEnabled: overrides.chatEnabled ?? true,
    joinEnabled: overrides.joinEnabled ?? true,
    entryNotificationsEnabled: overrides.entryNotificationsEnabled ?? true,
    password: overrides.password,
    theme: overrides.theme ?? {},
    announcement: overrides.announcement,
    superAdmins: overrides.superAdmins ?? [],
    admins: overrides.admins ?? [],
    likeCount: overrides.likeCount ?? 0,
    shareCount: overrides.shareCount ?? 0,
    createdBy: overrides.createdBy,
    metadata: overrides.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };

  rooms.set(key, room);
  return room;
}

function ensureRoomForRtcMode(appId: string, roomId: string, rtcMode: string) {
  const existing = rooms.get(scopedKey(appId, roomId));

  if (existing) {
    if ((isOneToOneVoiceMode(rtcMode) || isOneToOneVideoMode(rtcMode)) && (existing.maxParticipants > 2 || existing.maxMicCount > 2)) {
      return ensureRoom(appId, roomId, {
        roomType: normalizeRtcMode(rtcMode),
        maxParticipants: 2,
        maxMicCount: 2,
      });
    }

    return existing;
  }

  const capacity = getDefaultRoomCapacityForMode(rtcMode);

  return ensureRoom(appId, roomId, {
    name: `Room ${roomId}`,
    roomType: normalizeRtcMode(rtcMode),
    maxParticipants: capacity.maxParticipants,
    maxMicCount: capacity.maxMicCount,
  });
}

function getCompanyBillingSummary(
  appId: string,
  {
    generatedAt = new Date().toISOString(),
    includeSessions = false,
  }: { generatedAt?: string; includeSessions?: boolean } = {},
) {
  const clientApp = clientApps.get(appId);
  const now = Date.parse(generatedAt);
  const timestamp = Number.isFinite(now) ? now : Date.now();
  const appSessions = Array.from(sessions.values()).filter((session) => session.appId === appId);
  const usageByMode: Record<
    string,
    {
      rtcMode: string;
      rtc_mode: string;
      usedSeconds: number;
      used_seconds: number;
      usedMinutes: number;
      used_minutes: number;
      billableMinutes: number;
      billable_minutes: number;
      sessions: number;
      activeSessions: number;
      active_sessions: number;
    }
  > = {};

  let usedSeconds = 0;
  let billableMinutes = 0;
  let activeSessions = 0;

  for (const session of appSessions) {
    const durationSeconds = getSessionDurationSeconds(session, timestamp);
    const sessionBillableMinutes = getSessionBillableMinutes(session, timestamp);
    const rtcMode = normalizeRtcMode(session.rtcMode);

    usedSeconds += durationSeconds;
    billableMinutes += sessionBillableMinutes;

    if (!session.endedAt) {
      activeSessions += 1;
    }

    const existingMode = usageByMode[rtcMode] ?? {
      rtcMode,
      rtc_mode: rtcMode,
      usedSeconds: 0,
      used_seconds: 0,
      usedMinutes: 0,
      used_minutes: 0,
      billableMinutes: 0,
      billable_minutes: 0,
      sessions: 0,
      activeSessions: 0,
      active_sessions: 0,
    };

    existingMode.usedSeconds += durationSeconds;
    existingMode.used_seconds = existingMode.usedSeconds;
    existingMode.usedMinutes = roundNumber(existingMode.usedSeconds / 60);
    existingMode.used_minutes = existingMode.usedMinutes;
    existingMode.billableMinutes += sessionBillableMinutes;
    existingMode.billable_minutes = existingMode.billableMinutes;
    existingMode.sessions += 1;

    if (!session.endedAt) {
      existingMode.activeSessions += 1;
      existingMode.active_sessions = existingMode.activeSessions;
    }

    usageByMode[rtcMode] = existingMode;
  }

  const estimatedAmount = roundNumber(billableMinutes * RTC_BILLING_RATE_PER_MINUTE);
  const recentSessions = [...appSessions]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, 100)
    .map((session) => serializeBillingSession(session, timestamp));

  return {
    appId,
    app_id: appId,
    companyName: clientApp?.name ?? appId,
    company_name: clientApp?.name ?? appId,
    totalSessions: appSessions.length,
    total_sessions: appSessions.length,
    activeSessions,
    active_sessions: activeSessions,
    usedSeconds,
    used_seconds: usedSeconds,
    usedMinutes: roundNumber(usedSeconds / 60),
    used_minutes: roundNumber(usedSeconds / 60),
    billableMinutes,
    billable_minutes: billableMinutes,
    ratePerMinute: RTC_BILLING_RATE_PER_MINUTE,
    rate_per_minute: RTC_BILLING_RATE_PER_MINUTE,
    estimatedAmount,
    estimated_amount: estimatedAmount,
    currency: "USD",
    paymentGateway: false,
    payment_gateway: false,
    usageByMode: Object.values(usageByMode),
    usage_by_mode: Object.values(usageByMode),
    generatedAt,
    generated_at: generatedAt,
    ...(includeSessions ? { sessions: recentSessions } : {}),
  };
}

function serializeBillingSession(session: SessionRecord, now = Date.now()) {
  const durationSeconds = getSessionDurationSeconds(session, now);
  const billableMinutes = getSessionBillableMinutes(session, now);
  const estimatedAmount = roundNumber(billableMinutes * RTC_BILLING_RATE_PER_MINUTE);

  return {
    ...session,
    active: !session.endedAt,
    durationSeconds,
    duration_seconds: durationSeconds,
    usedMinutes: roundNumber(durationSeconds / 60),
    used_minutes: roundNumber(durationSeconds / 60),
    billableMinutes,
    billable_minutes: billableMinutes,
    estimatedAmount,
    estimated_amount: estimatedAmount,
  };
}

function getSessionDurationSeconds(session: SessionRecord, now = Date.now()) {
  const startedAt = Date.parse(session.startedAt);
  const endedAt = session.endedAt ? Date.parse(session.endedAt) : now;

  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
    return 0;
  }

  return Math.max(0, Math.ceil((endedAt - startedAt) / 1000));
}

function getSessionBillableMinutes(session: SessionRecord, now = Date.now()) {
  const durationSeconds = getSessionDurationSeconds(session, now);

  if (durationSeconds === 0) {
    return 0;
  }

  return Math.ceil(durationSeconds / 60);
}

function roundNumber(value: number, fractionDigits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(fractionDigits));
}

function startSession(input: Omit<SessionRecord, "id" | "startedAt">) {
  const key = sessionKey(input.appId, input.roomId, input.externalUserId ?? input.userId);
  const existingSessionId = activeSessionByUserRoom.get(key);
  const existingSession = existingSessionId ? sessions.get(existingSessionId) : undefined;

  if (existingSession && !existingSession.endedAt) {
    Object.assign(existingSession, input);
    return existingSession;
  }

  const session: SessionRecord = {
    id: randomUUID(),
    ...input,
    startedAt: new Date().toISOString(),
  };

  sessions.set(session.id, session);
  activeSessionByUserRoom.set(key, session.id);
  return session;
}

function endSession(appId: string, roomId: string, userId: string) {
  const key = sessionKey(appId, roomId, userId);
  const sessionId = activeSessionByUserRoom.get(key);
  const session = sessionId ? sessions.get(sessionId) : undefined;

  if (!session || session.endedAt) {
    return null;
  }

  session.endedAt = new Date().toISOString();
  activeSessionByUserRoom.delete(key);
  return session;
}

function sessionKey(appId: string, roomId: string, userId: string) {
  return scopedKey(appId, roomId, userId);
}

function getParticipants(appId: string, roomId: string) {
  const key = scopedKey(appId, roomId);

  if (!roomParticipants.has(key)) {
    roomParticipants.set(key, new Map());
  }

  return roomParticipants.get(key)!;
}

function leaveCurrentRoom(socket: Socket, reason: string, notifySelf = false) {
  const appId = readString(socket.data.appId) || DEFAULT_CLIENT_APP_ID;
  const roomId = socket.data.roomId as string | undefined;

  if (!roomId) {
    return;
  }

  const participants = getParticipants(appId, roomId);
  const participant = participants.get(socket.id);

  participants.delete(socket.id);
  socket.leave(roomChannel(appId, roomId));
  socket.data.roomId = undefined;

  if (participant) {
    endSession(appId, roomId, participant.externalUserId ?? participant.userId);
    socket.to(roomChannel(appId, roomId)).emit("user-left", socket.id);
    socket.to(roomChannel(appId, roomId)).emit("participant:left", {
      participant: serializeParticipant(participant),
      reason,
    });
  }

  if (notifySelf) {
    socket.emit("room:left", { roomId, reason });
  }

  if (participants.size === 0) {
    roomParticipants.delete(scopedKey(appId, roomId));
    return;
  }

  io.to(roomChannel(appId, roomId)).emit("room:state", getRoomState(appId, roomId));
}

function findParticipantRoom(socketId: string) {
  for (const participants of roomParticipants.values()) {
    const participant = participants.get(socketId);

    if (participant) {
      return {
        appId: participant.appId,
        roomId: participant.roomId,
      };
    }
  }

  return null;
}

function hasPermission(socket: Socket, permission: RtcPermission) {
  const permissions = readPermissions(socket.data.permissions, []);
  return permissions.includes(permission) || permissions.includes("moderate");
}

function defaultPermissionsForRtcMode(rtcMode: string, cameraEnabled = !isAudioOnlyRtcMode(rtcMode)): RtcPermission[] {
  const normalized = normalizeRtcMode(rtcMode);

  return [
    "join",
    "publish_audio",
    ...(cameraEnabled && !isAudioOnlyRtcMode(rtcMode) ? ["publish_video"] : []),
    ...((cameraEnabled && !isAudioOnlyRtcMode(rtcMode)) || isScreenShareRtcMode(normalized) ? ["screen_share"] : []),
    "chat",
    "signal",
    ...(normalized === "youtube" || normalized === "youtube_room" ? ["youtube_control"] : []),
    ...(isLiveRtcMode(normalized) ? ["live_control"] : []),
    "security_report",
  ];
}

function isAudioOnlyRtcMode(rtcMode: string) {
  const normalized = normalizeRtcMode(rtcMode);
  return normalized === "voice"
    || normalized === "audio"
    || normalized === "voice_call"
    || normalized === "one_to_one_voice"
    || normalized === "one_to_one_voice_call"
    || normalized === "group_voice"
    || normalized === "group_voice_chat"
    || normalized === "youtube"
    || normalized === "youtube_room";
}

function isOneToOneVoiceMode(rtcMode: string) {
  const normalized = normalizeRtcMode(rtcMode);
  return normalized === "voice_call"
    || normalized === "one_to_one_voice"
    || normalized === "one_to_one_voice_call";
}

function isOneToOneVideoMode(rtcMode: string) {
  const normalized = normalizeRtcMode(rtcMode);
  return normalized === "video_call"
    || normalized === "one_to_one_video"
    || normalized === "one_to_one_video_call";
}

function isScreenShareRtcMode(rtcMode: string) {
  const normalized = normalizeRtcMode(rtcMode);
  return normalized === "screen_share" || normalized === "screen";
}

function isLiveRtcMode(rtcMode: string) {
  const normalized = normalizeRtcMode(rtcMode);
  return normalized === "solo_live"
    || normalized === "solo_video_live"
    || normalized === "live_pk"
    || normalized === "live_video_pk";
}

function getDefaultRoomCapacityForMode(rtcMode: string) {
  if (isOneToOneVoiceMode(rtcMode) || isOneToOneVideoMode(rtcMode)) {
    return { maxParticipants: 2, maxMicCount: 2 };
  }

  return { maxParticipants: DEFAULT_ROOM_CAPACITY, maxMicCount: DEFAULT_ROOM_CAPACITY };
}

function normalizeRtcMode(rtcMode: string) {
  return readString(rtcMode).toLowerCase() || "video";
}

function evaluateSecurityContent(text: string, category: string) {
  const normalized = text.toLowerCase();
  const signals: string[] = [];

  if (/(?:kill|suicide|bomb|terror|weapon|shoot)/i.test(text)) {
    signals.push("violence_or_self_harm");
  }

  if (/(?:password|otp|verification code|credit card|bank account|ssn|social security)/i.test(text)) {
    signals.push("sensitive_data_request");
  }

  if (/(?:hate|slur|racial|abuse|harass)/i.test(text)) {
    signals.push("harassment_or_hate");
  }

  if (/(.)\1{8,}/.test(normalized) || normalized.length > 1200) {
    signals.push("spam_pattern");
  }

  const severity = signals.some((signal) => signal === "violence_or_self_harm" || signal === "sensitive_data_request")
    ? "high"
    : signals.length > 0
      ? "medium"
      : "low";

  return {
    allowed: signals.length === 0,
    severity: severity as SecurityIncident["severity"],
    reason: signals.length > 0
      ? `Security check flagged ${category}: ${signals.join(", ")}`
      : "Security check passed",
    signals,
  };
}

function recordSecurityIncident(input: Omit<SecurityIncident, "id" | "createdAt">) {
  const incident: SecurityIncident = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...input,
  };

  securityIncidents.push(incident);

  if (securityIncidents.length > 1000) {
    securityIncidents.splice(0, securityIncidents.length - 1000);
  }

  return incident;
}

function emitSecurityIncident(appId: string, roomId: string | undefined, incident: SecurityIncident) {
  if (!roomId) {
    return;
  }

  io.to(roomChannel(appId, roomId)).emit("security:incident", incident);
}

function withJoinedParticipant<T>(
  socket: Socket,
  errorEvent: string,
  handler: (context: {
    appId: string;
    roomId: string;
    room: RoomRecord;
    participants: Map<string, ParticipantState>;
    participant: ParticipantState;
  }) => T,
) {
  const appId = readString(socket.data.appId) || DEFAULT_CLIENT_APP_ID;
  const roomId = socket.data.roomId as string | undefined;

  if (!roomId) {
    const error = { error: "Join a room before using this SDK function" };
    socket.emit(errorEvent, error);
    return error;
  }

  const participants = getParticipants(appId, roomId);
  const participant = participants.get(socket.id);

  if (!participant) {
    const error = { error: "Participant is not in this room" };
    socket.emit(errorEvent, error);
    return error;
  }

  return handler({
    appId,
    roomId,
    room: ensureRoom(appId, roomId),
    participants,
    participant,
  });
}

function handleSendRoomMessage(
  socket: Socket,
  payload: Record<string, unknown>,
  kindOverride?: ChatMessageKind,
  callback?: (result: unknown) => void,
) {
  const result = withJoinedParticipant(socket, "message:error", ({ appId, roomId, room, participant }) => {
    if (!room.chatEnabled) {
      return { error: "Room chat is disabled" };
    }

    if (!participant.permissions.includes("chat") && !participant.permissions.includes("moderate")) {
      return { error: "Token does not allow chat" };
    }

    const senderUserId = participant.externalUserId ?? participant.userId;
    const activeBan = findActiveRoomHistoryRecord(roomChatBanHistory, appId, roomId, senderUserId);

    if (activeBan && !canManageRoom(participant, room)) {
      return {
        error: "User is chat banned in this room",
        ban: serializeRoomHistoryRecord(activeBan),
      };
    }

    const kind = kindOverride ?? readMessageKind(payload.kind ?? payload.type);
    const text = readString(payload.text ?? payload.message ?? payload.content ?? payload.caption);
    const mediaUrl = readString(payload.mediaUrl ?? payload.media_url ?? payload.url);
    const mimeType = readString(payload.mimeType ?? payload.mime_type);

    if ((kind === "message" || kind === "comment") && !text) {
      return { error: "Message text is required" };
    }

    if (kind === "voice" && !isAllowedVoiceMedia(mediaUrl, mimeType)) {
      return { error: "Voice message requires an audio media URL" };
    }

    if (kind === "image" && !isAllowedImageMedia(mediaUrl, mimeType)) {
      return { error: "Image message requires png, jpg, jpeg, webp, gif, svg, or svga media" };
    }

    const securityText = [text, readString(payload.altText ?? payload.alt_text), mediaUrl].filter(Boolean).join(" ");
    const security = evaluateSecurityContent(securityText, kind);

    if (!security.allowed) {
      const incident = recordSecurityIncident({
        appId,
        roomId,
        reporterSocketId: socket.id,
        reporterUserId: senderUserId,
        category: `message_${kind}`,
        severity: security.severity,
        message: security.reason,
        blocked: true,
        metadata: {
          signals: security.signals,
          text,
          mediaUrl,
        },
      });

      emitSecurityIncident(appId, roomId, incident);
      const blocked = {
        allowed: false,
        security,
        incident,
      };
      socket.emit("message:blocked", blocked);
      return blocked;
    }

    const now = new Date().toISOString();
    const message: ChatMessageRecord = {
      id: randomUUID(),
      appId,
      roomId,
      senderSocketId: socket.id,
      senderUserId: participant.userId,
      senderExternalUserId: participant.externalUserId,
      kind,
      text,
      mediaUrl,
      mimeType,
      durationSeconds: readNonNegativeNumber(payload.durationSeconds ?? payload.duration_seconds, 0),
      replyToMessageId: readString(payload.replyToMessageId ?? payload.reply_to_message_id),
      status: "sent",
      deletedForUserIds: [],
      security,
      metadata: readRecord(payload.metadata) ?? {},
      createdAt: now,
      updatedAt: now,
    };

    getRoomMessages(appId, roomId).push(message);
    trimRecords(getRoomMessages(appId, roomId), 1000);

    const eventName = kind === "comment" ? "comment:received" : "message:received";
    io.to(roomChannel(appId, roomId)).emit(eventName, serializeChatMessage(message));
    io.to(roomChannel(appId, roomId)).emit("message:received", serializeChatMessage(message));
    return { message: serializeChatMessage(message) };
  });

  callback?.(result);
}

function updateMessageStatus(socket: Socket, payload: Record<string, unknown>, status: "unsent" | "deleted") {
  withJoinedParticipant(socket, "message:error", ({ appId, roomId, room, participant }) => {
    const messageId = readString(payload.messageId ?? payload.message_id ?? payload.id);
    const message = getRoomMessages(appId, roomId).find((item) => item.id === messageId);

    if (!message) {
      return { error: "Message was not found" };
    }

    const senderUserId = message.senderExternalUserId ?? message.senderUserId;
    const participantUserId = participant.externalUserId ?? participant.userId;

    if (senderUserId !== participantUserId && !canManageRoom(participant, room)) {
      return { error: "Only sender or room admin can update this message" };
    }

    if (status === "deleted" && readBoolean(payload.forMe ?? payload.for_me, false)) {
      if (!message.deletedForUserIds.includes(participantUserId)) {
        message.deletedForUserIds.push(participantUserId);
      }
    } else {
      message.status = status;
    }

    message.updatedAt = new Date().toISOString();
    const eventName = status === "unsent" ? "message:unsent" : "message:deleted";
    io.to(roomChannel(appId, roomId)).emit(eventName, serializeChatMessage(message));
    io.to(roomChannel(appId, roomId)).emit("message:updated", serializeChatMessage(message));
    return { message: serializeChatMessage(message) };
  });
}

function updateRoomProfile(socket: Socket, payload: Record<string, unknown>) {
  withJoinedParticipant(socket, "room:error", ({ appId, roomId, room, participant }) => {
    if (!canManageRoom(participant, room)) {
      return { error: "Only room admins can update room profile" };
    }

    const updated = ensureRoom(appId, roomId, {
      name: readString(payload.name) || room.name,
      profilePictureUrl: readString(payload.profilePictureUrl ?? payload.profile_picture_url) || room.profilePictureUrl,
    });

    emitRoomUpdated(appId, roomId, updated, "room:profile");
    return { room: serializeRoom(updated) };
  });
}

function updateRoomSettings(socket: Socket, payload: Record<string, unknown>) {
  withJoinedParticipant(socket, "room:error", ({ appId, roomId, room, participant }) => {
    if (!canManageRoom(participant, room)) {
      return { error: "Only room admins can update room settings" };
    }

    const clearPassword = readBoolean(payload.clearPassword ?? payload.clear_password, false);
    const password = readString(payload.password ?? payload.roomPassword ?? payload.room_password);
    const updated = ensureRoom(appId, roomId, {
      maxParticipants: readPositiveNumber(payload.maxParticipants ?? payload.max_participants) ?? room.maxParticipants,
      maxMicCount: readPositiveNumber(payload.maxMicCount ?? payload.max_mic_count ?? payload.micAmount ?? payload.mic_amount) ?? room.maxMicCount,
      chatEnabled: readBoolean(payload.chatEnabled ?? payload.chat_enabled, room.chatEnabled),
      joinEnabled: readBoolean(payload.joinEnabled ?? payload.join_enabled, room.joinEnabled),
      entryNotificationsEnabled: readBoolean(
        payload.entryNotificationsEnabled ?? payload.entry_notifications_enabled,
        room.entryNotificationsEnabled,
      ),
      privacyType: readString(payload.privacyType ?? payload.privacy_type) || (password ? "private" : room.privacyType),
      password: clearPassword ? undefined : password || room.password,
    });

    emitRoomUpdated(appId, roomId, updated, "room:settings");
    return { room: serializeRoom(updated) };
  });
}

function updateRoomTheme(socket: Socket, payload: Record<string, unknown>) {
  withJoinedParticipant(socket, "room:error", ({ appId, roomId, room, participant }) => {
    if (!canManageRoom(participant, room)) {
      return { error: "Only room admins can update room theme" };
    }

    const theme = readRecord(payload.theme) ?? payload;
    const updated = ensureRoom(appId, roomId, {
      theme: {
        ...room.theme,
        ...theme,
      },
    });

    emitRoomUpdated(appId, roomId, updated, "room:theme");
    return { room: serializeRoom(updated) };
  });
}

function updateRoomAnnouncement(socket: Socket, payload: Record<string, unknown>) {
  withJoinedParticipant(socket, "room:error", ({ appId, roomId, room, participant }) => {
    if (!canManageRoom(participant, room)) {
      return { error: "Only room admins can update announcements" };
    }

    const text = readString(payload.text ?? payload.message ?? payload.announcement);
    const announcement = text
      ? {
        id: readString(payload.id) || room.announcement?.id || randomUUID(),
        text,
        pinned: readBoolean(payload.pinned, true),
        createdBy: participant.externalUserId ?? participant.userId,
        updatedAt: new Date().toISOString(),
      }
      : undefined;
    const updated = ensureRoom(appId, roomId, { announcement });

    io.to(roomChannel(appId, roomId)).emit("room:announcement", updated.announcement ?? null);
    emitRoomUpdated(appId, roomId, updated, "room:announcement");
    return { room: serializeRoom(updated) };
  });
}

function updateRoomAdmins(socket: Socket, payload: Record<string, unknown>) {
  withJoinedParticipant(socket, "room:error", ({ appId, roomId, room, participant }) => {
    if (!canManageRoom(participant, room)) {
      return { error: "Only room admins can update admin settings" };
    }

    const updated = ensureRoom(appId, roomId, {
      superAdmins: readStringArray(payload.superAdmins ?? payload.super_admins).length
        ? readStringArray(payload.superAdmins ?? payload.super_admins)
        : room.superAdmins,
      admins: readStringArray(payload.admins).length ? readStringArray(payload.admins) : room.admins,
    });

    emitRoomUpdated(appId, roomId, updated, "room:admins");
    return { room: serializeRoom(updated) };
  });
}

function kickRoomUser(socket: Socket, payload: Record<string, unknown>) {
  withJoinedParticipant(socket, "room:error", ({ appId, roomId, room, participants, participant }) => {
    if (!canManageRoom(participant, room)) {
      return { error: "Only room admins can kick users" };
    }

    const target = findParticipant(participants, payload);
    const targetUserId = readString(payload.targetUserId ?? payload.target_user_id)
      || target?.externalUserId
      || target?.userId;

    if (!targetUserId) {
      return { error: "targetUserId or targetSocketId is required" };
    }

    const now = new Date().toISOString();
    const durationSeconds = readNonNegativeNumber(payload.durationSeconds ?? payload.duration_seconds, 0);
    const permanent = readBoolean(payload.permanent, durationSeconds <= 0);
    const record: RoomHistoryRecord = {
      id: randomUUID(),
      appId,
      roomId,
      targetUserId,
      targetSocketId: target?.socketId ?? readString(payload.targetSocketId ?? payload.target_socket_id),
      actorUserId: participant.externalUserId ?? participant.userId,
      reason: readString(payload.reason) || "Kicked from room",
      permanent,
      expiresAt: permanent ? undefined : new Date(Date.now() + durationSeconds * 1000).toISOString(),
      active: true,
      metadata: readRecord(payload.metadata) ?? {},
      createdAt: now,
      updatedAt: now,
    };

    getRoomHistory(roomKickHistory, appId, roomId).push(record);
    emitRoomHistory(appId, roomId, "room:kick:history", roomKickHistory);

    if (target) {
      io.to(target.socketId).emit("room:kicked", serializeRoomHistoryRecord(record));
      const targetSocket = io.sockets.sockets.get(target.socketId);
      if (targetSocket) {
        leaveCurrentRoom(targetSocket, "kicked", true);
      }
    }

    return { kick: serializeRoomHistoryRecord(record) };
  });
}

function updateRoomHistoryRecord(
  socket: Socket,
  payload: Record<string, unknown>,
  store: Map<string, RoomHistoryRecord[]>,
  eventName: string,
) {
  withJoinedParticipant(socket, "room:error", ({ appId, roomId, room, participant }) => {
    if (!canManageRoom(participant, room)) {
      return { error: "Only room admins can edit history" };
    }

    const id = readString(payload.id ?? payload.historyId ?? payload.history_id);
    const record = getRoomHistory(store, appId, roomId).find((item) => item.id === id);

    if (!record) {
      return { error: "History record was not found" };
    }

    record.reason = readString(payload.reason) || record.reason;
    record.active = readBoolean(payload.active, record.active);
    record.metadata = readRecord(payload.metadata) ?? record.metadata;
    record.updatedAt = new Date().toISOString();

    emitRoomHistory(appId, roomId, eventName, store);
    return { history: serializeRoomHistoryRecord(record) };
  });
}

function cleanRoomComments(socket: Socket, payload: Record<string, unknown>) {
  withJoinedParticipant(socket, "room:error", ({ appId, roomId, room, participant }) => {
    if (!canManageRoom(participant, room)) {
      return { error: "Only room admins can clean comments" };
    }

    const targetUserId = readString(payload.targetUserId ?? payload.target_user_id);
    const cleanedIds: string[] = [];

    getRoomMessages(appId, roomId).forEach((message) => {
      const senderUserId = message.senderExternalUserId ?? message.senderUserId;
      if (message.kind === "comment" && (!targetUserId || senderUserId === targetUserId)) {
        message.status = "deleted";
        message.updatedAt = new Date().toISOString();
        cleanedIds.push(message.id);
      }
    });

    const event = {
      cleanedIds,
      cleaned_ids: cleanedIds,
      targetUserId,
      target_user_id: targetUserId,
      updatedBy: participant.externalUserId ?? participant.userId,
      updated_at: new Date().toISOString(),
    };
    io.to(roomChannel(appId, roomId)).emit("comment:cleaned", event);
    return event;
  });
}

function muteParticipantMic(socket: Socket, payload: Record<string, unknown>) {
  withJoinedParticipant(socket, "room:error", ({ appId, roomId, room, participants, participant }) => {
    const target = findParticipant(participants, payload);

    if (!target) {
      return { error: "Target participant was not found" };
    }

    const targetUserId = target.externalUserId ?? target.userId;
    const actorUserId = participant.externalUserId ?? participant.userId;
    const canMute = target.socketId === participant.socketId || actorUserId === targetUserId || canManageRoom(participant, room);

    if (!canMute) {
      return { error: "Only user, admin, or owner can change this mic state" };
    }

    const enabled = readBoolean(payload.enabled ?? payload.micEnabled ?? payload.mic_enabled, false);
    target.micEnabled = enabled;
    target.lastSeenAt = new Date().toISOString();

    io.to(target.socketId).emit("participant:mic:muted", {
      participant: serializeParticipant(target),
      micEnabled: enabled,
      mic_enabled: enabled,
      updatedBy: actorUserId,
      updated_by: actorUserId,
    });
    io.to(roomChannel(appId, roomId)).emit("participant:updated", serializeParticipant(target));
    io.to(roomChannel(appId, roomId)).emit("room:state", getRoomState(appId, roomId));
    return { participant: serializeParticipant(target) };
  });
}

function setChatBan(socket: Socket, payload: Record<string, unknown>) {
  withJoinedParticipant(socket, "chat:error", ({ appId, roomId, room, participant }) => {
    if (!canManageRoom(participant, room)) {
      return { error: "Only room admins can update chat bans" };
    }

    const targetUserId = readString(payload.targetUserId ?? payload.target_user_id);
    if (!targetUserId) {
      return { error: "targetUserId is required" };
    }

    const enabled = readBoolean(payload.enabled, true);
    const existing = findActiveRoomHistoryRecord(roomChatBanHistory, appId, roomId, targetUserId);

    if (!enabled && existing) {
      existing.active = false;
      existing.updatedAt = new Date().toISOString();
      emitRoomHistory(appId, roomId, "chat:ban:history", roomChatBanHistory);
      io.to(roomChannel(appId, roomId)).emit("chat:ban", serializeRoomHistoryRecord(existing));
      return { ban: serializeRoomHistoryRecord(existing) };
    }

    if (!enabled) {
      return { ban: null };
    }

    const durationSeconds = readNonNegativeNumber(payload.durationSeconds ?? payload.duration_seconds, 0);
    const permanent = readBoolean(payload.permanent, durationSeconds <= 0);
    const now = new Date().toISOString();
    const ban: RoomHistoryRecord = {
      id: randomUUID(),
      appId,
      roomId,
      targetUserId,
      actorUserId: participant.externalUserId ?? participant.userId,
      reason: readString(payload.reason) || "Chat banned",
      permanent,
      expiresAt: permanent ? undefined : new Date(Date.now() + durationSeconds * 1000).toISOString(),
      active: true,
      metadata: readRecord(payload.metadata) ?? {},
      createdAt: now,
      updatedAt: now,
    };

    getRoomHistory(roomChatBanHistory, appId, roomId).push(ban);
    emitRoomHistory(appId, roomId, "chat:ban:history", roomChatBanHistory);
    io.to(roomChannel(appId, roomId)).emit("chat:ban", serializeRoomHistoryRecord(ban));
    return { ban: serializeRoomHistoryRecord(ban) };
  });
}

function likeRoom(socket: Socket) {
  withJoinedParticipant(socket, "room:error", ({ appId, roomId, room, participant }) => {
    const userId = participant.externalUserId ?? participant.userId;
    const likes = getRoomLikeUsers(appId, roomId);

    likes.add(userId);
    const updated = ensureRoom(appId, roomId, { likeCount: likes.size });
    io.to(roomChannel(appId, roomId)).emit("room:like", {
      room: serializeRoom(updated),
      likeCount: updated.likeCount,
      like_count: updated.likeCount,
    });
    return { room: serializeRoom(updated) };
  });
}

function shareRoom(socket: Socket, payload: Record<string, unknown>) {
  withJoinedParticipant(socket, "room:error", ({ appId, roomId, room, participant }) => {
    const updated = ensureRoom(appId, roomId, { shareCount: room.shareCount + 1 });
    const event = {
      room: serializeRoom(updated),
      shareCount: updated.shareCount,
      share_count: updated.shareCount,
      sharedBy: participant.externalUserId ?? participant.userId,
      shared_by: participant.externalUserId ?? participant.userId,
      target: readString(payload.target),
    };
    io.to(roomChannel(appId, roomId)).emit("room:share", event);
    return event;
  });
}

function setUserBlock(socket: Socket, payload: Record<string, unknown>, active: boolean) {
  const appId = readString(socket.data.appId) || DEFAULT_CLIENT_APP_ID;
  const blockerUserId = getSocketUserKey(socket);
  const blockedUserId = readString(payload.blockedUserId ?? payload.blocked_user_id ?? payload.targetUserId ?? payload.target_user_id);

  if (!blockedUserId) {
    socket.emit("user:block:error", { error: "blockedUserId is required" });
    return;
  }

  const history = getUserBlockHistory(appId, blockerUserId);
  const existing = history.find((item) => item.blockedUserId === blockedUserId && item.active);
  const now = new Date().toISOString();
  const record = existing ?? {
    id: randomUUID(),
    appId,
    blockerUserId,
    blockedUserId,
    reason: readString(payload.reason),
    active,
    metadata: readRecord(payload.metadata) ?? {},
    createdAt: now,
    updatedAt: now,
  };

  record.active = active;
  record.reason = readString(payload.reason) || record.reason;
  record.metadata = readRecord(payload.metadata) ?? record.metadata;
  record.updatedAt = now;

  if (!existing) {
    history.push(record);
  }

  socket.emit("user:block:updated", serializeUserBlockRecord(record));
}

function readSecuritySeverity(value: unknown): SecurityIncident["severity"] | null {
  const severity = readString(value).toLowerCase();

  if (severity === "low" || severity === "medium" || severity === "high") {
    return severity;
  }

  return null;
}

function getYoutubeRoomState(appId: string, roomId: string) {
  const state = youtubeRoomStates.get(scopedKey(appId, roomId));
  return state ? serializeYoutubeRoomState(state) : null;
}

function getLivePkState(appId: string, roomId: string) {
  const state = livePkStates.get(scopedKey(appId, roomId));
  return state ? serializeLivePkState(state) : null;
}

function serializeLivePkState(state: LivePkState) {
  return {
    appId: state.appId,
    app_id: state.appId,
    roomId: state.roomId,
    room_id: Number.isFinite(Number(state.roomId)) ? Number(state.roomId) : state.roomId,
    status: state.status,
    hostUserId: state.hostUserId,
    host_user_id: state.hostUserId,
    opponentUserId: state.opponentUserId,
    opponent_user_id: state.opponentUserId,
    hostScore: state.hostScore,
    host_score: state.hostScore,
    opponentScore: state.opponentScore,
    opponent_score: state.opponentScore,
    startedAt: state.startedAt,
    started_at: state.startedAt,
    endedAt: state.endedAt,
    ended_at: state.endedAt,
    updatedAt: state.updatedAt,
    updated_at: state.updatedAt,
    metadata: state.metadata,
  };
}

function canControlLive(participant: ParticipantState) {
  return participant.permissions.includes("live_control")
    || participant.permissions.includes("moderate")
    || participant.role === "owner"
    || participant.role === "admin";
}

function readLivePkStatus(value: unknown): LivePkState["status"] | null {
  const status = readString(value).toLowerCase();

  if (status === "idle" || status === "matching" || status === "active" || status === "ended") {
    return status;
  }

  return null;
}

function readVideoEffectState(value: unknown, fallback: VideoEffectState = createDefaultVideoEffectState()) {
  const record = readRecord(value) ?? {};

  return {
    filter: readString(record.filter) || fallback.filter,
    aiFilter: readString(record.aiFilter) || readString(record.ai_filter) || fallback.aiFilter,
    sticker: readString(record.sticker) || fallback.sticker,
    faceDetectEnabled: readBoolean(
      record.faceDetectEnabled ?? record.face_detect_enabled,
      fallback.faceDetectEnabled,
    ),
    beautyEnabled: readBoolean(record.beautyEnabled ?? record.beauty_enabled, fallback.beautyEnabled),
    beautyLevel: readEffectLevel(record.beautyLevel ?? record.beauty_level, fallback.beautyLevel),
    smoothingLevel: readEffectLevel(record.smoothingLevel ?? record.smoothing_level, fallback.smoothingLevel),
    whiteningLevel: readEffectLevel(record.whiteningLevel ?? record.whitening_level, fallback.whiteningLevel),
    eyeLevel: readEffectLevel(record.eyeLevel ?? record.eye_level, fallback.eyeLevel),
    faceSlimLevel: readEffectLevel(record.faceSlimLevel ?? record.face_slim_level, fallback.faceSlimLevel),
    makeup: readRecord(record.makeup) ?? fallback.makeup,
    updatedAt: new Date().toISOString(),
  };
}

function createDefaultVideoEffectState(): VideoEffectState {
  return {
    filter: "none",
    aiFilter: "none",
    sticker: "",
    faceDetectEnabled: false,
    beautyEnabled: false,
    beautyLevel: 0,
    smoothingLevel: 0,
    whiteningLevel: 0,
    eyeLevel: 0,
    faceSlimLevel: 0,
    makeup: {},
  };
}

function readEffectLevel(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : Number(readString(value));

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, numberValue));
}

function serializeYoutubeRoomState(state: YoutubeRoomState) {
  return {
    appId: state.appId,
    app_id: state.appId,
    roomId: state.roomId,
    room_id: Number.isFinite(Number(state.roomId)) ? Number(state.roomId) : state.roomId,
    videoId: state.videoId,
    video_id: state.videoId,
    videoUrl: state.videoUrl,
    video_url: state.videoUrl,
    title: state.title,
    playbackState: state.playbackState,
    playback_state: state.playbackState,
    positionSeconds: state.positionSeconds,
    position_seconds: state.positionSeconds,
    updatedAt: state.updatedAt,
    updated_at: state.updatedAt,
    updatedBy: state.updatedBy,
    updated_by: state.updatedBy,
  };
}

function canControlYoutube(participant: ParticipantState) {
  return participant.permissions.includes("youtube_control")
    || participant.permissions.includes("moderate")
    || participant.role === "owner"
    || participant.role === "admin"
    || participant.role === "publisher";
}

function parseYoutubeVideoId(value: string) {
  const input = readString(value);

  if (!input) {
    return "";
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
    return input;
  }

  try {
    const url = new URL(input);
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();

    if (hostname === "youtu.be") {
      return parseYoutubePathId(url.pathname);
    }

    if (hostname === "youtube.com" || hostname.endsWith(".youtube.com")) {
      const queryVideoId = url.searchParams.get("v");

      if (queryVideoId && /^[a-zA-Z0-9_-]{11}$/.test(queryVideoId)) {
        return queryVideoId;
      }

      const pathParts = url.pathname.split("/").filter(Boolean);
      const markerIndex = pathParts.findIndex((part) => ["embed", "shorts", "live"].includes(part));

      if (markerIndex >= 0 && pathParts[markerIndex + 1]) {
        return parseYoutubePathId(pathParts[markerIndex + 1]);
      }
    }
  } catch (_error) {
    return "";
  }

  return "";
}

function parseYoutubePathId(pathOrId: string) {
  const candidate = readString(pathOrId).split(/[/?#]/)[0] ?? "";
  return /^[a-zA-Z0-9_-]{11}$/.test(candidate) ? candidate : "";
}

function readYoutubePlaybackState(value: unknown): YoutubeRoomState["playbackState"] | null {
  const state = readString(value).toLowerCase();

  if (state === "ready" || state === "playing" || state === "paused" || state === "stopped") {
    return state;
  }

  return null;
}

function getRoomMessages(appId: string, roomId: string) {
  const key = scopedKey(appId, roomId);

  if (!roomMessages.has(key)) {
    roomMessages.set(key, []);
  }

  return roomMessages.get(key)!;
}

function getRoomGifts(appId: string, roomId: string) {
  const key = scopedKey(appId, roomId);

  if (!roomGifts.has(key)) {
    roomGifts.set(key, []);
  }

  return roomGifts.get(key)!;
}

function getRoomHistory(store: Map<string, RoomHistoryRecord[]>, appId: string, roomId: string) {
  const key = scopedKey(appId, roomId);

  if (!store.has(key)) {
    store.set(key, []);
  }

  return store.get(key)!;
}

function getRoomLikeUsers(appId: string, roomId: string) {
  const key = scopedKey(appId, roomId);

  if (!roomLikeUsers.has(key)) {
    roomLikeUsers.set(key, new Set());
  }

  return roomLikeUsers.get(key)!;
}

function getUserBlockHistory(appId: string, blockerUserId: string) {
  const key = scopedKey(appId, blockerUserId);

  if (!userBlockHistory.has(key)) {
    userBlockHistory.set(key, []);
  }

  return userBlockHistory.get(key)!;
}

function findActiveRoomHistoryRecord(
  store: Map<string, RoomHistoryRecord[]>,
  appId: string,
  roomId: string,
  targetUserId: string,
) {
  if (!targetUserId) {
    return null;
  }

  const now = Date.now();
  const record = getRoomHistory(store, appId, roomId).find((item) => {
    if (!item.active || item.targetUserId !== targetUserId) {
      return false;
    }

    if (item.expiresAt && Date.parse(item.expiresAt) <= now) {
      item.active = false;
      item.updatedAt = new Date().toISOString();
      return false;
    }

    return true;
  });

  return record ?? null;
}

function serializeChatMessage(message: ChatMessageRecord) {
  return {
    id: message.id,
    appId: message.appId,
    app_id: message.appId,
    roomId: message.roomId,
    room_id: Number.isFinite(Number(message.roomId)) ? Number(message.roomId) : message.roomId,
    senderSocketId: message.senderSocketId,
    sender_socket_id: message.senderSocketId,
    senderUserId: message.senderUserId,
    sender_user_id: message.senderUserId,
    senderExternalUserId: message.senderExternalUserId,
    sender_external_user_id: message.senderExternalUserId,
    kind: message.kind,
    type: message.kind,
    text: message.text,
    message: message.text,
    mediaUrl: message.mediaUrl,
    media_url: message.mediaUrl,
    mimeType: message.mimeType,
    mime_type: message.mimeType,
    durationSeconds: message.durationSeconds,
    duration_seconds: message.durationSeconds,
    replyToMessageId: message.replyToMessageId,
    reply_to_message_id: message.replyToMessageId,
    status: message.status,
    deletedForUserIds: message.deletedForUserIds,
    deleted_for_user_ids: message.deletedForUserIds,
    security: message.security,
    metadata: message.metadata,
    createdAt: message.createdAt,
    created_at: message.createdAt,
    updatedAt: message.updatedAt,
    updated_at: message.updatedAt,
  };
}

function serializeGift(gift: GiftRecord) {
  return {
    id: gift.id,
    appId: gift.appId,
    app_id: gift.appId,
    roomId: gift.roomId,
    room_id: Number.isFinite(Number(gift.roomId)) ? Number(gift.roomId) : gift.roomId,
    senderSocketId: gift.senderSocketId,
    sender_socket_id: gift.senderSocketId,
    senderUserId: gift.senderUserId,
    sender_user_id: gift.senderUserId,
    senderExternalUserId: gift.senderExternalUserId,
    sender_external_user_id: gift.senderExternalUserId,
    giftId: gift.giftId,
    gift_id: gift.giftId,
    name: gift.name,
    assetUrl: gift.assetUrl,
    asset_url: gift.assetUrl,
    assetType: gift.assetType,
    asset_type: gift.assetType,
    quantity: gift.quantity,
    receiverUserId: gift.receiverUserId,
    receiver_user_id: gift.receiverUserId,
    metadata: gift.metadata,
    createdAt: gift.createdAt,
    created_at: gift.createdAt,
  };
}

function serializeRoomHistoryRecord(record: RoomHistoryRecord) {
  return {
    id: record.id,
    appId: record.appId,
    app_id: record.appId,
    roomId: record.roomId,
    room_id: Number.isFinite(Number(record.roomId)) ? Number(record.roomId) : record.roomId,
    targetUserId: record.targetUserId,
    target_user_id: record.targetUserId,
    targetSocketId: record.targetSocketId,
    target_socket_id: record.targetSocketId,
    actorUserId: record.actorUserId,
    actor_user_id: record.actorUserId,
    reason: record.reason,
    permanent: record.permanent,
    expiresAt: record.expiresAt,
    expires_at: record.expiresAt,
    active: record.active,
    metadata: record.metadata,
    createdAt: record.createdAt,
    created_at: record.createdAt,
    updatedAt: record.updatedAt,
    updated_at: record.updatedAt,
  };
}

function serializeUserBlockRecord(record: UserBlockRecord) {
  return {
    id: record.id,
    appId: record.appId,
    app_id: record.appId,
    blockerUserId: record.blockerUserId,
    blocker_user_id: record.blockerUserId,
    blockedUserId: record.blockedUserId,
    blocked_user_id: record.blockedUserId,
    reason: record.reason,
    active: record.active,
    metadata: record.metadata,
    createdAt: record.createdAt,
    created_at: record.createdAt,
    updatedAt: record.updatedAt,
    updated_at: record.updatedAt,
  };
}

function emitRoomUpdated(appId: string, roomId: string, room: RoomRecord, eventName: string) {
  io.to(roomChannel(appId, roomId)).emit(eventName, serializeRoom(room));
  io.to(roomChannel(appId, roomId)).emit("room:updated", serializeRoom(room));
  io.to(roomChannel(appId, roomId)).emit("room:state", getRoomState(appId, roomId));
}

function emitRoomHistory(
  appId: string,
  roomId: string,
  eventName: string,
  store: Map<string, RoomHistoryRecord[]>,
) {
  io.to(roomChannel(appId, roomId)).emit(eventName, {
    history: getRoomHistory(store, appId, roomId).map(serializeRoomHistoryRecord),
  });
}

function canManageRoom(participant: ParticipantState, room: RoomRecord) {
  const userId = participant.externalUserId ?? participant.userId;

  return participant.permissions.includes("moderate")
    || participant.role === "owner"
    || participant.role === "super_admin"
    || participant.role === "admin"
    || room.createdBy === userId
    || room.superAdmins.includes(userId)
    || room.admins.includes(userId);
}

function canManageRoomByIdentity(room: RoomRecord, userId: string, role: string | undefined) {
  return role === "owner"
    || role === "super_admin"
    || role === "admin"
    || room.createdBy === userId
    || room.superAdmins.includes(userId)
    || room.admins.includes(userId);
}

function findParticipant(participants: Map<string, ParticipantState>, payload: Record<string, unknown>) {
  const targetSocketId = readString(payload.targetSocketId ?? payload.target_socket_id ?? payload.socketId ?? payload.socket_id);
  const targetUserId = readString(payload.targetUserId ?? payload.target_user_id ?? payload.userId ?? payload.user_id);

  if (targetSocketId && participants.has(targetSocketId)) {
    return participants.get(targetSocketId);
  }

  if (!targetUserId) {
    return null;
  }

  return Array.from(participants.values()).find(
    (participant) => participant.userId === targetUserId || participant.externalUserId === targetUserId,
  ) ?? null;
}

function getSocketUserKey(socket: Socket) {
  return readString(socket.data.externalUserId) || readString(socket.data.userId) || socket.id;
}

function readMessageKind(value: unknown): ChatMessageKind {
  const kind = readString(value).toLowerCase();

  if (kind === "comment" || kind === "voice" || kind === "image") {
    return kind;
  }

  return "message";
}

function normalizeGiftAssetType(value: unknown) {
  const raw = readString(value).toLowerCase();
  const extension = raw.includes(".")
    ? raw.split(/[?#]/)[0].split(".").pop() ?? ""
    : raw;
  const normalized = extension === "jpeg" ? "jpg" : extension;
  const allowed = new Set(["svga", "svg", "png", "jpg", "webp", "gif", "json", "lottie"]);
  return allowed.has(normalized) ? normalized : "";
}

function isAllowedImageMedia(mediaUrl: string, mimeType: string) {
  if (mimeType.startsWith("image/")) {
    return true;
  }

  return Boolean(normalizeGiftAssetType(mediaUrl));
}

function isAllowedVoiceMedia(mediaUrl: string, mimeType: string) {
  if (mimeType.startsWith("audio/")) {
    return true;
  }

  const extension = mediaUrl.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
  return ["aac", "m4a", "mp3", "ogg", "opus", "wav", "webm"].includes(extension);
}

function readBoundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = typeof value === "number" ? value : Number(readString(value));

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numberValue)));
}

function readAnnouncement(value: unknown, createdBy: string): RoomAnnouncement | undefined {
  const record = readRecord(value);
  const text = record ? readString(record.text ?? record.message ?? record.announcement) : readString(value);

  if (!text) {
    return undefined;
  }

  return {
    id: record ? readString(record.id) || randomUUID() : randomUUID(),
    text,
    pinned: record ? readBoolean(record.pinned, true) : true,
    createdBy,
    updatedAt: new Date().toISOString(),
  };
}

function trimRecords<T>(records: T[], max: number) {
  if (records.length > max) {
    records.splice(0, records.length - max);
  }
}

function readNonNegativeNumber(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : Number(readString(value));
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : fallback;
}

function getRoomState(appId: string, roomId: string) {
  const room = ensureRoom(appId, roomId);
  const participants = Array.from(getParticipants(appId, roomId).values()).map(serializeParticipant);

  return {
    room: serializeRoom(room),
    participants,
    participantCount: participants.length,
    participant_count: participants.length,
    recentMessages: getRoomMessages(appId, roomId).slice(-50).map(serializeChatMessage),
    recent_messages: getRoomMessages(appId, roomId).slice(-50).map(serializeChatMessage),
    recentGifts: getRoomGifts(appId, roomId).slice(-50).map(serializeGift),
    recent_gifts: getRoomGifts(appId, roomId).slice(-50).map(serializeGift),
  };
}

function serializeRoom(room: RoomRecord) {
  return {
    appId: room.appId,
    app_id: room.appId,
    id: room.id,
    room_id: Number.isFinite(Number(room.id)) ? Number(room.id) : room.id,
    name: room.name,
    profilePictureUrl: room.profilePictureUrl,
    profile_picture_url: room.profilePictureUrl,
    roomType: room.roomType,
    room_type: room.roomType,
    privacyType: room.privacyType,
    privacy_type: room.privacyType,
    maxParticipants: room.maxParticipants,
    max_participants: room.maxParticipants,
    maxMicCount: room.maxMicCount,
    max_mic_count: room.maxMicCount,
    chatEnabled: room.chatEnabled,
    chat_enabled: room.chatEnabled,
    joinEnabled: room.joinEnabled,
    join_enabled: room.joinEnabled,
    entryNotificationsEnabled: room.entryNotificationsEnabled,
    entry_notifications_enabled: room.entryNotificationsEnabled,
    passwordProtected: Boolean(room.password),
    password_protected: Boolean(room.password),
    theme: room.theme,
    announcement: room.announcement,
    superAdmins: room.superAdmins,
    super_admins: room.superAdmins,
    admins: room.admins,
    likeCount: room.likeCount,
    like_count: room.likeCount,
    shareCount: room.shareCount,
    share_count: room.shareCount,
    metadata: room.metadata,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}

function serializeParticipant(participant: ParticipantState) {
  return {
    socketId: participant.socketId,
    socket_id: participant.socketId,
    appId: participant.appId,
    app_id: participant.appId,
    roomId: participant.roomId,
    room_id: Number.isFinite(Number(participant.roomId)) ? Number(participant.roomId) : participant.roomId,
    userId: participant.userId,
    user_id: participant.userId,
    externalUserId: participant.externalUserId,
    external_user_id: participant.externalUserId,
    role: participant.role,
    rtcMode: participant.rtcMode,
    rtc_mode: participant.rtcMode,
    micEnabled: participant.micEnabled,
    mic_enabled: participant.micEnabled,
    cameraEnabled: participant.cameraEnabled,
    camera_enabled: participant.cameraEnabled,
    speakerEnabled: participant.speakerEnabled,
    speaker_enabled: participant.speakerEnabled,
    noiseCancellationEnabled: participant.noiseCancellationEnabled,
    noise_cancellation_enabled: participant.noiseCancellationEnabled,
    screenShareEnabled: participant.screenShareEnabled,
    screen_share_enabled: participant.screenShareEnabled,
    videoEffects: participant.videoEffects,
    video_effects: participant.videoEffects,
    permissions: participant.permissions,
    joinedAt: participant.joinedAt,
    joined_at: participant.joinedAt,
    lastSeenAt: participant.lastSeenAt,
    last_seen_at: participant.lastSeenAt,
  };
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readPositiveNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(readString(value));
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function readBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value.toLowerCase() === "true") {
      return true;
    }

    if (value.toLowerCase() === "false") {
      return false;
    }
  }

  return fallback;
}

function readPermissions(value: unknown, fallback: RtcPermission[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const permissions = value
    .map((permission) => readString(permission))
    .filter(Boolean);

  return permissions.length > 0 ? permissions : fallback;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => readString(item)).filter(Boolean);
}

function readRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}
