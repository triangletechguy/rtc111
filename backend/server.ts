import express from "express";
import http from "http";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { randomUUID } from "crypto";
import { Server } from "socket.io";

const app = express();
app.use(express.json());

const RTC_TOKEN_ISSUER = "rtc-platform";
const RTC_TOKEN_SECRET = process.env.RTC_TOKEN_SECRET ?? "rtc-dev-secret-change-me";
const RTC_TOKEN_EXPIRES_IN: SignOptions["expiresIn"] = "1h";

type RtcAccessToken = JwtPayload & {
  scope: "rtc";
  userId: string;
  roomId?: string;
};

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

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
            width: min(560px, calc(100% - 32px));
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
          <p>The Socket.IO signaling server is listening on <code>localhost:4000</code>.</p>
          <p>Health check: <code>/health</code></p>
          <p>Token endpoint: <code>POST /rtc-token</code></p>
        </main>
      </body>
    </html>
  `);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/rtc-token", (req, res) => {
  const requestedUserId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
  const requestedRoomId = typeof req.body?.roomId === "string" ? req.body.roomId.trim() : "";
  const userId = requestedUserId || `web-${randomUUID()}`;

  const payload: RtcAccessToken = {
    scope: "rtc",
    userId,
    ...(requestedRoomId ? { roomId: requestedRoomId } : {}),
  };

  const token = jwt.sign(payload, RTC_TOKEN_SECRET, {
    expiresIn: RTC_TOKEN_EXPIRES_IN,
    issuer: RTC_TOKEN_ISSUER,
    subject: userId,
  });

  res.json({
    token,
    tokenType: "Bearer",
    expiresIn: RTC_TOKEN_EXPIRES_IN,
    userId,
    ...(requestedRoomId ? { roomId: requestedRoomId } : {}),
  });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

/**
 * ROOM STORAGE (IN MEMORY)
 */
const rooms = new Map<string, Set<string>>();

function getTokenFromHandshake(socketAuth: unknown, authorizationHeader: string | string[] | undefined) {
  if (
    socketAuth &&
    typeof socketAuth === "object" &&
    "token" in socketAuth &&
    typeof socketAuth.token === "string"
  ) {
    return socketAuth.token;
  }

  const authorization = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]
    : authorizationHeader;

  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }

  return "";
}

function verifyRtcToken(token: string) {
  const decoded = jwt.verify(token, RTC_TOKEN_SECRET, {
    issuer: RTC_TOKEN_ISSUER,
  }) as RtcAccessToken;

  if (decoded.scope !== "rtc" || typeof decoded.userId !== "string") {
    throw new Error("Invalid RTC token payload");
  }

  return decoded;
}

function leaveRoom(roomId: string, socketId: string) {
  const room = rooms.get(roomId);

  if (!room) {
    return;
  }

  room.delete(socketId);

  if (room.size === 0) {
    rooms.delete(roomId);
    return;
  }

  io.to(roomId).emit("user-left", socketId);
}

io.use((socket, next) => {
  const token = getTokenFromHandshake(socket.handshake.auth, socket.handshake.headers.authorization);

  if (!token) {
    next(new Error("RTC token is required"));
    return;
  }

  try {
    const decoded = verifyRtcToken(token);

    socket.data.userId = decoded.userId;
    socket.data.tokenRoomId = decoded.roomId;
    next();
  } catch {
    next(new Error("Invalid or expired RTC token"));
  }
});

io.on("connection", (socket) => {

  console.log("User connected:", socket.id, socket.data.userId);

  /**
   * JOIN ROOM
   */
  socket.on("room:join", (payload: { roomId?: string } = {}) => {
    const roomId = typeof payload.roomId === "string" ? payload.roomId.trim() : "";

    if (!roomId) {
      socket.emit("room:error", { message: "Room id is required" });
      return;
    }

    const tokenRoomId = socket.data.tokenRoomId as string | undefined;

    if (tokenRoomId && tokenRoomId !== roomId) {
      socket.emit("room:error", { message: "Token is not valid for this room" });
      return;
    }

    const previousRoomId = socket.data.roomId as string | undefined;

    if (previousRoomId && previousRoomId !== roomId) {
      socket.leave(previousRoomId);
      leaveRoom(previousRoomId, socket.id);
    }

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }

    const room = rooms.get(roomId)!;

    // 1:1 limit
    if (!room.has(socket.id) && room.size >= 2) {
      socket.emit("room:full");
      return;
    }

    room.add(socket.id);
    socket.join(roomId);
    socket.data.roomId = roomId;

    // send existing users
    socket.emit("existing-users", Array.from(room).filter(id => id !== socket.id));

    // notify others
    socket.to(roomId).emit("user-joined", socket.id);
  });

  /**
   * SIGNALING (IMPORTANT)
   */
  socket.on("signal", ({ to, data }: { to?: string; data?: unknown } = {}) => {
    if (typeof to !== "string" || !data) {
      return;
    }

    io.to(to).emit("signal", {
      from: socket.id,
      data
    });
  });

  /**
   * DISCONNECT
   */
  socket.on("disconnect", () => {
    const roomId = socket.data.roomId as string | undefined;

    if (roomId) {
      leaveRoom(roomId, socket.id);
      return;
    }

    rooms.forEach((_room, id) => leaveRoom(id, socket.id));
  });

});

server.listen(4000, () => {
  console.log("RTC Server running on http://localhost:4000");
});
