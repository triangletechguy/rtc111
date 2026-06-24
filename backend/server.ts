import express, { type NextFunction, type Request, type Response } from "express";
import http from "http";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { randomUUID } from "crypto";
import { Server, type Socket } from "socket.io";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 4000);
const RTC_TOKEN_ISSUER = "rtc-platform";
const RTC_TOKEN_SECRET = process.env.RTC_TOKEN_SECRET ?? "rtc-dev-secret-change-me";
const RTC_TOKEN_EXPIRES_IN: SignOptions["expiresIn"] = "1h";
const RTC_API_KEY = process.env.RTC_API_KEY ?? "rtc-dev-api-key";
const DEFAULT_ROOM_CAPACITY = Number(process.env.RTC_DEFAULT_ROOM_CAPACITY ?? 8);

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
  userId: string;
  externalUserId?: string;
  roomId?: string;
  role: string;
  rtcMode: string;
  permissions: RtcPermission[];
};

type ExternalUser = {
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

  ensureRoom(roomId, {
    name: `Room ${roomId}`,
    roomType: rtcMode,
    maxParticipants: DEFAULT_ROOM_CAPACITY,
    maxMicCount: DEFAULT_ROOM_CAPACITY,
  });

  res.json(issueToken({ roomId, userId, role, rtcMode, permissions }));
});

app.get("/client/me", requireClientAuth, (_req, res) => {
  res.json({
    id: "local-rtc-client",
    name: "RTC Platform Client",
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
  const externalUserId = readString(req.body?.external_user_id) || readString(req.body?.externalUserId);

  if (!externalUserId) {
    res.status(400).json({ error: "external_user_id is required" });
    return;
  }

  const now = new Date().toISOString();
  const existing = users.get(externalUserId);
  const user: ExternalUser = {
    externalUserId,
    name: readString(req.body?.name) || existing?.name || externalUserId,
    email: readString(req.body?.email) || existing?.email || "",
    avatarUrl: readString(req.body?.avatar_url) || readString(req.body?.avatarUrl) || existing?.avatarUrl,
    status: readString(req.body?.status) || existing?.status || "active",
    metadata: readRecord(req.body?.metadata) ?? existing?.metadata ?? {},
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  users.set(externalUserId, user);
  res.status(existing ? 200 : 201).json({ user });
});

app.get("/client/rooms", requireClientAuth, (_req, res) => {
  res.json({
    rooms: Array.from(rooms.values()).map(serializeRoom),
  });
});

app.post("/client/rooms", requireClientAuth, (req, res) => {
  const externalUserId = readString(req.body?.external_user_id) || readString(req.body?.externalUserId);
  const roomId = readString(req.body?.room_id) || readString(req.body?.roomId) || String(nextRoomId++);
  const room = ensureRoom(roomId, {
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
  const roomId = readString(req.params.roomId);
  const room = rooms.get(roomId);

  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  res.json({
    room: serializeRoom(room),
    state: getRoomState(room.id),
  });
});

app.post("/client/rtc/token", requireClientAuth, (req, res) => {
  const appName = readString(req.body?.app_name) || readString(req.body?.appName);
  const externalUserId = readString(req.body?.external_user_id) || readString(req.body?.externalUserId) || appName;
  const roomId = readString(req.body?.room_id) || readString(req.body?.roomId);

  if (!externalUserId) {
    res.status(400).json({ error: "app_name or external_user_id is required" });
    return;
  }

  ensureExternalUser(externalUserId);

  if (roomId) {
    ensureRoom(roomId);
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
    ...(roomId ? { roomId } : {}),
    userId: externalUserId,
    externalUserId,
    role,
    rtcMode,
    permissions,
  }));
});

app.post("/client/rtc/session/start", requireClientAuth, (req, res) => {
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

  ensureExternalUser(externalUserId);
  ensureRoom(roomId);

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
  const externalUserId = readString(req.body?.external_user_id) || readString(req.body?.externalUserId);
  const roomId = readString(req.body?.room_id) || readString(req.body?.roomId);

  if (!externalUserId || !roomId) {
    res.status(400).json({ error: "external_user_id and room_id are required" });
    return;
  }

  const session = endSession(roomId, externalUserId);
  res.json({ ended: Boolean(session), session });
});

/**
 * Admin/dashboard helper:
 * List generated tokens that backend currently saved.
 */
app.get("/client/rtc/tokens", requireClientAuth, (_req, res) => {
  cleanupExpiredTokens();

  res.json({
    tokens: Array.from(issuedRtcTokens.values()).map(serializeStoredToken),
  });
});

/**
 * Admin/dashboard/helper:
 * Verify whether a client token is the exact saved backend token.
 */
app.post("/client/rtc/token/verify", requireClientAuth, (req, res) => {
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
    res.json({
      valid: true,
      token: serializeStoredToken(issuedRtcTokens.get(token)!),
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
  const token = readString(req.body?.token);

  if (!token) {
    res.status(400).json({ revoked: false, error: "token is required" });
    return;
  }

  const storedToken = issuedRtcTokens.get(token);

  if (!storedToken) {
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
  console.log("User connected:", socket.id, socket.data.userId);

  socket.on("room:join", (payload: Record<string, unknown> = {}) => {
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

    const room = ensureRoom(roomId);
    const previousRoomId = socket.data.roomId as string | undefined;

    if (previousRoomId && previousRoomId !== roomId) {
      leaveCurrentRoom(socket, "joined-another-room");
    }

    const participants = getParticipants(roomId);

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
    socket.join(roomId);
    socket.data.roomId = roomId;

    startSession({
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
      state: getRoomState(roomId),
    });

    socket.emit(
      "existing-users",
      Array.from(participants.keys()).filter((socketId) => socketId !== socket.id),
    );

    socket.to(roomId).emit("user-joined", socket.id);
    socket.to(roomId).emit("participant:joined", serializeParticipant(participant));
    io.to(roomId).emit("room:state", getRoomState(roomId));
  });

  socket.on("room:leave", () => {
    leaveCurrentRoom(socket, "left", true);
  });

  socket.on("media:state", (payload: Record<string, unknown> = {}) => {
    const roomId = socket.data.roomId as string | undefined;

    if (!roomId) {
      socket.emit("room:error", { message: "Join a room before updating media state" });
      return;
    }

    const participants = getParticipants(roomId);
    const participant = participants.get(socket.id);

    if (!participant) {
      return;
    }

    participant.micEnabled = readBoolean(payload.micEnabled, participant.micEnabled);
    participant.cameraEnabled = readBoolean(payload.cameraEnabled, participant.cameraEnabled);
    participant.speakerEnabled = readBoolean(payload.speakerEnabled, participant.speakerEnabled);
    participant.lastSeenAt = new Date().toISOString();

    const sessionId = activeSessionByUserRoom.get(sessionKey(roomId, participant.externalUserId ?? participant.userId));
    const session = sessionId ? sessions.get(sessionId) : undefined;

    if (session && !session.endedAt) {
      session.micEnabled = participant.micEnabled;
      session.cameraEnabled = participant.cameraEnabled;
      session.speakerEnabled = participant.speakerEnabled;
    }

    io.to(roomId).emit("participant:updated", serializeParticipant(participant));
    io.to(roomId).emit("room:state", getRoomState(roomId));
  });

  socket.on("signal", ({ to, data }: { to?: string; data?: unknown } = {}) => {
    if (typeof to !== "string" || !data || !hasPermission(socket, "signal")) {
      return;
    }

    const fromRoomId = socket.data.roomId as string | undefined;
    const targetRoomId = findParticipantRoom(to);

    if (!fromRoomId || targetRoomId !== fromRoomId) {
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

server.listen(PORT, () => {
  console.log(`RTC Server running on http://localhost:${PORT}`);
});

function requireClientAuth(req: Request, res: Response, next: NextFunction) {
  const authorization = req.header("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";

  if (!token || token !== RTC_API_KEY) {
    res.status(401).json({
      error: "Valid client API key is required",
      hint: "Set Authorization: Bearer <RTC_API_KEY>. The local dev default is rtc-dev-api-key.",
    });
    return;
  }

  next();
}

function issueToken({
  roomId,
  userId,
  externalUserId,
  role,
  rtcMode,
  permissions,
}: {
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

  if (decoded.scope !== "rtc" || typeof decoded.userId !== "string") {
    throw new Error("Invalid RTC token payload");
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

function ensureExternalUser(externalUserId: string) {
  if (users.has(externalUserId)) {
    return users.get(externalUserId)!;
  }

  const now = new Date().toISOString();
  const user: ExternalUser = {
    externalUserId,
    name: externalUserId,
    email: "",
    status: "active",
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };

  users.set(externalUserId, user);
  return user;
}

function ensureRoom(roomId: string, overrides: Partial<RoomRecord> = {}) {
  const existing = rooms.get(roomId);
  const now = new Date().toISOString();

  if (existing) {
    const updated: RoomRecord = {
      ...existing,
      ...overrides,
      id: roomId,
      metadata: overrides.metadata ?? existing.metadata,
      updatedAt: now,
    };
    rooms.set(roomId, updated);
    return updated;
  }

  const room: RoomRecord = {
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

  rooms.set(roomId, room);
  return room;
}

function startSession(input: Omit<SessionRecord, "id" | "startedAt">) {
  const key = sessionKey(input.roomId, input.externalUserId ?? input.userId);
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

function endSession(roomId: string, userId: string) {
  const key = sessionKey(roomId, userId);
  const sessionId = activeSessionByUserRoom.get(key);
  const session = sessionId ? sessions.get(sessionId) : undefined;

  if (!session || session.endedAt) {
    return null;
  }

  session.endedAt = new Date().toISOString();
  activeSessionByUserRoom.delete(key);
  return session;
}

function sessionKey(roomId: string, userId: string) {
  return `${roomId}:${userId}`;
}

function getParticipants(roomId: string) {
  if (!roomParticipants.has(roomId)) {
    roomParticipants.set(roomId, new Map());
  }

  return roomParticipants.get(roomId)!;
}

function leaveCurrentRoom(socket: Socket, reason: string, notifySelf = false) {
  const roomId = socket.data.roomId as string | undefined;

  if (!roomId) {
    return;
  }

  const participants = getParticipants(roomId);
  const participant = participants.get(socket.id);

  participants.delete(socket.id);
  socket.leave(roomId);
  socket.data.roomId = undefined;

  if (participant) {
    endSession(roomId, participant.externalUserId ?? participant.userId);
    socket.to(roomId).emit("user-left", socket.id);
    socket.to(roomId).emit("participant:left", {
      participant: serializeParticipant(participant),
      reason,
    });
  }

  if (notifySelf) {
    socket.emit("room:left", { roomId, reason });
  }

  if (participants.size === 0) {
    roomParticipants.delete(roomId);
    return;
  }

  io.to(roomId).emit("room:state", getRoomState(roomId));
}

function findParticipantRoom(socketId: string) {
  for (const [roomId, participants] of roomParticipants.entries()) {
    if (participants.has(socketId)) {
      return roomId;
    }
  }

  return null;
}

function hasPermission(socket: Socket, permission: RtcPermission) {
  const permissions = readPermissions(socket.data.permissions, []);
  return permissions.includes(permission) || permissions.includes("moderate");
}

function getRoomState(roomId: string) {
  const room = ensureRoom(roomId);
  const participants = Array.from(getParticipants(roomId).values()).map(serializeParticipant);

  return {
    room: serializeRoom(room),
    participants,
    participantCount: participants.length,
  };
}

function serializeRoom(room: RoomRecord) {
  return {
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

function readRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}
