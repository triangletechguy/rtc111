import { useEffect, useRef, useState } from "react";
import {
  RTC_DEFAULT_SIGNALING_URL,
  RtcServiceClient,
  endRtcSession,
  startRtcSession,
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
  const [sessionId, setSessionId] = useState("");
  const [participants, setParticipants] = useState([]);
  const [status, setStatus] = useState("Start session");
  const [error, setError] = useState("");
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isInRoom, setIsInRoom] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);

  useEffect(() => {
    return () => {
      unbindClientEventsRef.current();
      rtcClientRef.current?.destroy();
    };
  }, []);

  async function handleStartSession(event) {
    event.preventDefault();
    await startSessionForRoom();
  }

  async function startSessionForRoom() {
    const trimmedRoomId = roomId.trim();
    const trimmedClientId = clientId.trim() || "web-client";

    if (!trimmedRoomId) {
      setError("Room id is required");
      return null;
    }

    setError("");
    setIsStartingSession(true);
    setStatus("Starting session");

    try {
      unbindClientEventsRef.current();
      rtcClientRef.current?.destroy();
      setIsSocketConnected(false);
      setIsCameraReady(false);
      setIsInRoom(false);
      setParticipants([]);

      const sessionResponse = await startRtcSession({
        apiUrl: RTC_DEFAULT_SIGNALING_URL,
        externalUserId: trimmedClientId,
        roomId: trimmedRoomId,
        role: "publisher",
        rtcMode: "video",
        micEnabled: !isMicMuted,
        cameraEnabled: isCameraOn,
        permissions: ["join", "publish_audio", "publish_video", "chat", "signal"],
      });

      const rtcClient = new RtcServiceClient({
        signalingUrl: RTC_DEFAULT_SIGNALING_URL,
        token: sessionResponse.token,
      });

      bindRtcClient(rtcClient);
      rtcClient.setVideoElements({
        localVideo: localVideoRef.current,
        remoteVideo: remoteVideoRef.current,
      });
      rtcClient.muteLocalAudio(isMicMuted);
      rtcClient.setCameraEnabled(isCameraOn);

      rtcClientRef.current = rtcClient;

      setAccessToken(sessionResponse.token);
      setTokenRoomId(String(sessionResponse.roomId ?? trimmedRoomId));
      setClientId(sessionResponse.externalUserId ?? sessionResponse.userId ?? trimmedClientId);
      setSessionId(sessionResponse.session?.id ?? "");

      await rtcClient.connect();
      setStatus("Session ready");

      return rtcClient;
    } catch (event) {
      const message = getErrorMessage(event);
      setError(message);
      setStatus("Session failed");
      return null;
    } finally {
      setIsStartingSession(false);
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
      rtcClient.on("room-joined", ({ room, state }) => {
        setIsInRoom(true);
        setStatus(`Joined ${room?.id ?? roomId}`);
        setParticipants(state?.participants ?? []);
      }),
      rtcClient.on("room-left", () => {
        setIsInRoom(false);
        setParticipants([]);
        setStatus("Left room");
      }),
      rtcClient.on("room-state", ({ participants: nextParticipants = [] }) => {
        setParticipants(nextParticipants);
      }),
      rtcClient.on("local-media-state", ({ micEnabled, cameraEnabled, speakerEnabled }) => {
        setIsMicMuted(!micEnabled);
        setIsCameraOn(cameraEnabled);
        setIsSpeakerOn(speakerEnabled);
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
        rtcClient = await startSessionForRoom();
      }

      if (!rtcClient) {
        return;
      }

      rtcClient.setVideoElements({
        localVideo: localVideoRef.current,
        remoteVideo: remoteVideoRef.current,
      });

      await rtcClient.joinRoom(trimmedRoomId, {
        micEnabled: !isMicMuted,
        cameraEnabled: isCameraOn,
        speakerEnabled: isSpeakerOn,
      });
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
      setStatus("Start session");
      setError("Start a new session for this room before joining");
    }
  }

  async function leaveRoom() {
    const trimmedRoomId = roomId.trim();
    const trimmedClientId = clientId.trim();

    rtcClientRef.current?.leaveRoom({ stopMedia: true });
    setIsCameraReady(false);
    setIsInRoom(false);
    setParticipants([]);

    if (sessionId && trimmedRoomId && trimmedClientId) {
      try {
        await endRtcSession({
          apiUrl: RTC_DEFAULT_SIGNALING_URL,
          externalUserId: trimmedClientId,
          roomId: trimmedRoomId,
        });
      } catch (event) {
        setError(getErrorMessage(event));
      }
    }
  }

  function toggleMic() {
    const nextMuted = !isMicMuted;

    rtcClientRef.current?.muteLocalAudio(nextMuted);
    setIsMicMuted(nextMuted);
  }

  function toggleCamera() {
    const nextEnabled = !isCameraOn;

    rtcClientRef.current?.setCameraEnabled(nextEnabled);
    setIsCameraOn(nextEnabled);
  }

  async function toggleSpeaker() {
    const nextEnabled = !isSpeakerOn;

    try {
      await rtcClientRef.current?.setSpeakerphoneOn(nextEnabled);
      setIsSpeakerOn(nextEnabled);
    } catch (event) {
      setError(getErrorMessage(event));
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

  const canJoin = !isJoining && !isStartingSession;
  const canControlMedia = Boolean(rtcClientRef.current);
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

        <form className="access-bar" onSubmit={handleStartSession}>
          <div className="field-group">
            <label htmlFor="client-id">Client ID</label>
            <input
              id="client-id"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              autoComplete="off"
            />
          </div>

          <button type="submit" disabled={isStartingSession}>
            {isStartingSession ? "Starting" : "Start session"}
          </button>

          <div className={accessToken ? "token-chip ready" : "token-chip"}>
            {accessToken ? "Session ready" : "Session required"}
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
          <button type="button" className="secondary" onClick={leaveRoom} disabled={!isInRoom}>
            Leave
          </button>
        </form>

        <div className="control-bar" aria-label="Call controls">
          <button type="button" onClick={toggleMic} disabled={!canControlMedia}>
            {isMicMuted ? "Unmute" : "Mute"}
          </button>
          <button type="button" onClick={toggleCamera} disabled={!canControlMedia}>
            {isCameraOn ? "Camera off" : "Camera on"}
          </button>
          <button type="button" onClick={toggleSpeaker} disabled={!canControlMedia}>
            {isSpeakerOn ? "Speaker off" : "Speaker on"}
          </button>
          <div className="participant-count">{participants.length} online</div>
        </div>

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
              <small>{isCameraReady ? (isCameraOn ? "Ready" : "Camera off") : "Pending"}</small>
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

        <section className="room-state" aria-label="Room participants">
          <h2>Participants</h2>
          <div className="participant-list">
            {participants.length > 0 ? (
              participants.map((participant) => (
                <div className="participant-row" key={participant.socketId}>
                  <span>{participant.userId}</span>
                  <small>
                    {participant.micEnabled ? "mic on" : "muted"} /{" "}
                    {participant.cameraEnabled ? "camera on" : "camera off"}
                  </small>
                </div>
              ))
            ) : (
              <p>No one has joined this room yet.</p>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
