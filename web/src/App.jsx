import { useEffect, useRef, useState } from "react";
import {
  RTC_DEFAULT_SIGNALING_URL,
  RtcServiceClient,
  createRtcToken,
} from "./sdk/rtcServiceSdk";
import "./App.css";

const DEFAULT_ROOM_ID = "room1";

export default function App() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const rtcClientRef = useRef(null);
  const unbindClientEventsRef = useRef(() => {});

  const [roomId, setRoomId] = useState(DEFAULT_ROOM_ID);
  const [clientId, setClientId] = useState("web-client");
  const [accessToken, setAccessToken] = useState("");
  const [tokenRoomId, setTokenRoomId] = useState("");
  const [status, setStatus] = useState("Create token");
  const [error, setError] = useState("");
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCreatingToken, setIsCreatingToken] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    return () => {
      unbindClientEventsRef.current();
      rtcClientRef.current?.destroy();
    };
  }, []);

  async function handleCreateToken(event) {
    event.preventDefault();
    await createTokenForRoom();
  }

  async function createTokenForRoom() {
    const trimmedRoomId = roomId.trim();

    if (!trimmedRoomId) {
      setError("Room id is required");
      return null;
    }

    setError("");
    setIsCreatingToken(true);
    setStatus("Creating token");

    try {
      unbindClientEventsRef.current();
      rtcClientRef.current?.destroy();
      setIsSocketConnected(false);
      setIsCameraReady(false);

      const tokenResponse = await createRtcToken({
        apiUrl: RTC_DEFAULT_SIGNALING_URL,
        roomId: trimmedRoomId,
        userId: clientId.trim() || undefined,
      });

      const rtcClient = new RtcServiceClient({
        signalingUrl: RTC_DEFAULT_SIGNALING_URL,
        token: tokenResponse.token,
      });

      bindRtcClient(rtcClient);
      rtcClient.setVideoElements({
        localVideo: localVideoRef.current,
        remoteVideo: remoteVideoRef.current,
      });

      rtcClientRef.current = rtcClient;

      setAccessToken(tokenResponse.token);
      setTokenRoomId(tokenResponse.roomId ?? trimmedRoomId);
      setClientId(tokenResponse.userId);

      await rtcClient.connect();
      setStatus("Token ready");

      return rtcClient;
    } catch (event) {
      const message = getErrorMessage(event);
      setError(message);
      setStatus("Token failed");
      return null;
    } finally {
      setIsCreatingToken(false);
    }
  }

  function bindRtcClient(rtcClient) {
    const unbindHandlers = [
      rtcClient.on("connected", () => {
        setIsSocketConnected(true);
        setStatus("Signaling online");
      }),
      rtcClient.on("disconnected", () => {
        setIsSocketConnected(false);
        setStatus("Signaling offline");
      }),
      rtcClient.on("error", ({ message }) => {
        setError(message);
        setStatus("RTC error");
      }),
      rtcClient.on("room-error", ({ message }) => {
        setError(message);
      }),
      rtcClient.on("room-full", ({ message }) => {
        setError(message);
        setStatus("Room full");
      }),
      rtcClient.on("media-ready", () => {
        setIsCameraReady(true);
        setStatus("Camera ready");
      }),
      rtcClient.on("room-joined", ({ roomId: joinedRoomId }) => {
        setStatus(`Joined ${joinedRoomId}`);
      }),
      rtcClient.on("waiting-for-peer", () => {
        setStatus("Waiting for peer");
      }),
      rtcClient.on("peer-joined", () => {
        setStatus("Peer joined");
      }),
      rtcClient.on("peer-left", () => {
        setStatus("Peer left");
      }),
      rtcClient.on("calling", () => {
        setStatus("Calling peer");
      }),
      rtcClient.on("answer-sent", () => {
        setStatus("Answer sent");
      }),
      rtcClient.on("answer-received", () => {
        setStatus("Answer received");
      }),
      rtcClient.on("connection-state", ({ state }) => {
        if (state === "connected") {
          setStatus("Peer connected");
        }

        if (["failed", "closed", "disconnected"].includes(state)) {
          setStatus(`Peer ${state}`);
        }
      }),
    ];

    unbindClientEventsRef.current = () => {
      unbindHandlers.forEach((unbind) => unbind());
      unbindClientEventsRef.current = () => {};
    };
  }

  async function joinRoom(event) {
    event.preventDefault();

    const trimmedRoomId = roomId.trim();

    if (!trimmedRoomId) {
      setError("Room id is required");
      return;
    }

    setError("");
    setIsJoining(true);

    try {
      let rtcClient = rtcClientRef.current;

      if (!rtcClient || tokenRoomId !== trimmedRoomId || !accessToken) {
        rtcClient = await createTokenForRoom();
      }

      if (!rtcClient) {
        return;
      }

      rtcClient.setVideoElements({
        localVideo: localVideoRef.current,
        remoteVideo: remoteVideoRef.current,
      });

      await rtcClient.joinRoom(trimmedRoomId);
    } catch (event) {
      setError(getErrorMessage(event));
    } finally {
      setIsJoining(false);
    }
  }

  function handleRoomChange(event) {
    const nextRoomId = event.target.value;

    setRoomId(nextRoomId);

    if (accessToken && nextRoomId.trim() !== tokenRoomId) {
      setStatus("Create token");
      setError("Create a new token for this room before joining");
    }
  }

  async function copyToken() {
    if (!accessToken) {
      return;
    }

    await navigator.clipboard?.writeText(accessToken);
    setStatus("Token copied");
  }

  function getErrorMessage(event) {
    return event instanceof Error ? event.message : "Something went wrong";
  }

  const canJoin = !isJoining && !isCreatingToken;
  const tokenPreview = accessToken
    ? `${accessToken.slice(0, 24)}...${accessToken.slice(-12)}`
    : "No token";

  return (
    <main className="app-shell">
      <section className="call-surface" aria-label="RTC video room">
        <header className="topbar">
          <div>
            <p className="eyebrow">RTC Platform</p>
            <h1>Video Room</h1>
          </div>
          <div className={isSocketConnected ? "status online" : "status"}>
            <span aria-hidden="true" />
            {status}
          </div>
        </header>

        <form className="access-bar" onSubmit={handleCreateToken}>
          <div className="field-group">
            <label htmlFor="client-id">Client ID</label>
            <input
              id="client-id"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              autoComplete="off"
            />
          </div>

          <button type="submit" disabled={isCreatingToken}>
            {isCreatingToken ? "Creating" : "Create token"}
          </button>

          <div className={accessToken ? "token-chip ready" : "token-chip"}>
            {accessToken ? "Token ready" : "Token required"}
          </div>
        </form>

        <div className="token-preview" aria-label="RTC token preview">
          <code>{tokenPreview}</code>
          <button type="button" onClick={copyToken} disabled={!accessToken}>
            Copy
          </button>
        </div>

        <form className="room-bar" onSubmit={joinRoom}>
          <label htmlFor="room-id">Room</label>
          <input
            id="room-id"
            value={roomId}
            onChange={handleRoomChange}
            autoComplete="off"
          />
          <button type="submit" disabled={!canJoin}>
            {isJoining ? "Joining" : "Join"}
          </button>
        </form>

        {error ? (
          <p className="notice" role="alert">
            {error}
          </p>
        ) : null}

        <div className="video-grid">
          <article className="video-tile">
            <video ref={localVideoRef} autoPlay muted playsInline />
            <div className="video-label">
              <span>Local</span>
              <small>{isCameraReady ? "Ready" : "Pending"}</small>
            </div>
          </article>

          <article className="video-tile remote">
            <video ref={remoteVideoRef} autoPlay playsInline />
            <div className="video-label">
              <span>Remote</span>
              <small>{isSocketConnected ? "Waiting" : "Offline"}</small>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
