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
const RTC_ADMIN_KEY = process.env.RTC_ADMIN_KEY ?? "rtc-admin-dev-key";
const DEFAULT_ROOM_CAPACITY = Number(process.env.RTC_DEFAULT_ROOM_CAPACITY ?? 8);
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
  userId: string;
  externalUserId?: string;
  roomId?: string;
  role: string;
  rtcMode: string;
  permissions: RtcPermission[];
};

type ClientApp = {
  id: string;
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
  roomType: string;
  privacyType: string;
  maxParticipants: number;
  maxMicCount: number;
  chatEnabled: boolean;
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
  permissions: RtcPermission[];
  joinedAt: string;
  lastSeenAt: string;
};

type StoredRtcToken = {
  token: string;
  tokenId: string;
  appId: string;
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
          <p>Admin API: <code>/admin/apps</code></p>
          <p>Compatibility token endpoint: <code>POST /rtc-token</code></p>
          <p>Client API: <code>/client/me</code>, <code>/client/users/sync</code>, <code>/client/rooms</code>, <code>/client/rtc/token</code>, <code>/client/rtc/session/start</code>, <code>/client/rtc/session/end</code></p>
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

  res.status(201).json({
    app: serializeClientApp(clientApp),
    apiKey: serializeApiKey(apiKey, true),
    api_key: apiKey.secret,
    integration: {
      apiBaseUrl: `http://localhost:${PORT}`,
      api_base_url: `http://localhost:${PORT}`,
      authorizationHeader: `Bearer ${apiKey.secret}`,
      authorization_header: `Bearer ${apiKey.secret}`,
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
  const permissions = readPermissions(req.body?.permissions, [
    "join",
    "publish_audio",
    "publish_video",
    "chat",
    "signal",
  ]);

  ensureRoom(DEFAULT_CLIENT_APP_ID, roomId, {
    name: `Room ${roomId}`,
    roomType: rtcMode,
    maxParticipants: DEFAULT_ROOM_CAPACITY,
    maxMicCount: DEFAULT_ROOM_CAPACITY,
  });

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
      "rtc.token",
      "rtc.session.start",
      "rtc.session.end",
      "rtc.signaling",
      "rtc.media_state",
      "rtc.token.saved_validation",
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
  const room = ensureRoom(clientApp.id, roomId, {
    name: readString(req.body?.name) || `Room ${roomId}`,
    roomType: readString(req.body?.room_type) || readString(req.body?.roomType) || "voice",
    privacyType: readString(req.body?.privacy_type) || readString(req.body?.privacyType) || "public",
    maxParticipants: readPositiveNumber(req.body?.max_participants)
      ?? readPositiveNumber(req.body?.maxParticipants)
      ?? readPositiveNumber(req.body?.max_mic_count)
      ?? readPositiveNumber(req.body?.maxMicCount)
      ?? DEFAULT_ROOM_CAPACITY,
    maxMicCount: readPositiveNumber(req.body?.max_mic_count)
      ?? readPositiveNumber(req.body?.maxMicCount)
      ?? DEFAULT_ROOM_CAPACITY,
    chatEnabled: readBoolean(req.body?.chat_enabled, readBoolean(req.body?.chatEnabled, true)),
    createdBy: externalUserId,
    metadata: readRecord(req.body?.metadata) ?? {},
  });

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
  const appName = readString(req.body?.app_name) || readString(req.body?.appName);
  const externalUserId = readString(req.body?.external_user_id) || readString(req.body?.externalUserId) || appName;
  const roomId = readString(req.body?.room_id) || readString(req.body?.roomId);

  if (!externalUserId) {
    res.status(400).json({ error: "app_name or external_user_id is required" });
    return;
  }

  ensureExternalUser(clientApp.id, externalUserId);

  if (roomId) {
    ensureRoom(clientApp.id, roomId);
  }

  const role = readString(req.body?.role) || "publisher";
  const rtcMode = readString(req.body?.rtc_mode) || readString(req.body?.rtcMode) || "video";
  const permissions = readPermissions(req.body?.permissions, [
    "join",
    "publish_audio",
    "publish_video",
    "chat",
    "signal",
  ]);

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

  ensureExternalUser(clientApp.id, externalUserId);
  ensureRoom(clientApp.id, roomId);

  const role = readString(req.body?.role) || "publisher";
  const rtcMode = readString(req.body?.rtc_mode) || readString(req.body?.rtcMode) || "voice";
  const micEnabled = readBoolean(req.body?.mic_enabled, readBoolean(req.body?.micEnabled, true));
  const cameraEnabled = readBoolean(req.body?.camera_enabled, readBoolean(req.body?.cameraEnabled, true));
  const permissions = readPermissions(req.body?.permissions, [
    "join",
    "publish_audio",
    ...(cameraEnabled ? ["publish_video"] : []),
    "chat",
    "signal",
  ]);

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

    const participant: ParticipantState = {
      socketId: socket.id,
      appId,
      roomId,
      userId: socket.data.userId as string,
      externalUserId: socket.data.externalUserId as string | undefined,
      role: (socket.data.role as string | undefined) ?? "publisher",
      rtcMode: (socket.data.rtcMode as string | undefined) ?? room.roomType,
      micEnabled: readBoolean(payload.micEnabled, true),
      cameraEnabled: readBoolean(payload.cameraEnabled, room.roomType !== "voice"),
      speakerEnabled: readBoolean(payload.speakerEnabled, true),
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
      permissions: participant.permissions,
    });

    socket.emit("room:joined", {
      room: serializeRoom(room),
      participant: serializeParticipant(participant),
      state: getRoomState(appId, roomId),
    });

    socket.emit(
      "existing-users",
      Array.from(participants.keys()).filter((socketId) => socketId !== socket.id),
    );

    socket.to(roomChannel(appId, roomId)).emit("user-joined", socket.id);
    socket.to(roomChannel(appId, roomId)).emit("participant:joined", serializeParticipant(participant));
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

    participant.micEnabled = readBoolean(payload.micEnabled, participant.micEnabled);
    participant.cameraEnabled = readBoolean(payload.cameraEnabled, participant.cameraEnabled);
    participant.speakerEnabled = readBoolean(payload.speakerEnabled, participant.speakerEnabled);
    participant.lastSeenAt = new Date().toISOString();

    const sessionId = activeSessionByUserRoom.get(
      sessionKey(appId, roomId, participant.externalUserId ?? participant.userId),
    );
    const session = sessionId ? sessions.get(sessionId) : undefined;

    if (session && !session.endedAt) {
      session.micEnabled = participant.micEnabled;
      session.cameraEnabled = participant.cameraEnabled;
      session.speakerEnabled = participant.speakerEnabled;
    }

    io.to(roomChannel(appId, roomId)).emit("participant:updated", serializeParticipant(participant));
    io.to(roomChannel(appId, roomId)).emit("room:state", getRoomState(appId, roomId));
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
}) {
  const now = new Date().toISOString();
  const appRecord: ClientApp = {
    id,
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

function createClientApiKeySecret() {
  return `rtc_${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`;
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

  const payload: RtcAccessToken = {
    scope: "rtc",
    appId,
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
    ...(includeSecret ? { secret: apiKey.secret, apiKey: apiKey.secret, api_key: apiKey.secret } : {}),
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
    createdBy: overrides.createdBy,
    metadata: overrides.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };

  rooms.set(key, room);
  return room;
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

function getRoomState(appId: string, roomId: string) {
  const room = ensureRoom(appId, roomId);
  const participants = Array.from(getParticipants(appId, roomId).values()).map(serializeParticipant);

  return {
    room: serializeRoom(room),
    participants,
    participantCount: participants.length,
  };
}

function serializeRoom(room: RoomRecord) {
  return {
    appId: room.appId,
    app_id: room.appId,
    id: room.id,
    room_id: Number.isFinite(Number(room.id)) ? Number(room.id) : room.id,
    name: room.name,
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
