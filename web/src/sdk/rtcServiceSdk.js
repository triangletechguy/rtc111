import { io } from "socket.io-client";

export const RTC_DEFAULT_SIGNALING_URL =
  import.meta.env.VITE_SIGNALING_URL ?? "http://localhost:4000";

export const RTC_DEFAULT_API_KEY =
  import.meta.env.VITE_RTC_API_KEY ?? "rtc-dev-api-key";

const DEFAULT_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export async function createRtcToken({
  apiUrl = RTC_DEFAULT_SIGNALING_URL,
  roomId,
  userId,
  role = "publisher",
  rtcMode = "video",
  permissions = ["join", "publish_audio", "publish_video", "chat", "signal"],
} = {}) {
  return requestJson(`${apiUrl}/rtc-token`, {
    method: "POST",
    body: {
      ...(roomId ? { roomId } : {}),
      ...(userId ? { userId } : {}),
      role,
      rtcMode,
      permissions,
    },
  });
}

export async function verifyClient({
  apiUrl = RTC_DEFAULT_SIGNALING_URL,
  apiKey = RTC_DEFAULT_API_KEY,
} = {}) {
  return requestJson(`${apiUrl}/client/me`, {
    headers: getClientHeaders(apiKey),
  });
}

export async function syncExternalUser({
  apiUrl = RTC_DEFAULT_SIGNALING_URL,
  apiKey = RTC_DEFAULT_API_KEY,
  externalUserId,
  name,
  email = "",
  avatarUrl,
  status = "active",
  metadata = {},
} = {}) {
  return requestJson(`${apiUrl}/client/users/sync`, {
    method: "POST",
    headers: getClientHeaders(apiKey),
    body: {
      external_user_id: externalUserId,
      name,
      email,
      avatar_url: avatarUrl,
      status,
      metadata,
    },
  });
}

export async function createRoom({
  apiUrl = RTC_DEFAULT_SIGNALING_URL,
  apiKey = RTC_DEFAULT_API_KEY,
  externalUserId,
  name,
  roomType = "video",
  privacyType = "public",
  maxParticipants = 8,
  maxMicCount = 8,
  chatEnabled = true,
  metadata = {},
} = {}) {
  return requestJson(`${apiUrl}/client/rooms`, {
    method: "POST",
    headers: getClientHeaders(apiKey),
    body: {
      external_user_id: externalUserId,
      name,
      room_type: roomType,
      privacy_type: privacyType,
      max_participants: maxParticipants,
      max_mic_count: maxMicCount,
      chat_enabled: chatEnabled,
      metadata,
    },
  });
}

export async function issueRtcToken({
  apiUrl = RTC_DEFAULT_SIGNALING_URL,
  apiKey = RTC_DEFAULT_API_KEY,
  appName,
  externalUserId,
  roomId,
  role = "publisher",
  rtcMode = "video",
  permissions = ["join", "publish_audio", "publish_video", "chat", "signal"],
} = {}) {
  return requestJson(`${apiUrl}/client/rtc/token`, {
    method: "POST",
    headers: getClientHeaders(apiKey),
    body: {
      ...(appName ? { app_name: appName } : {}),
      external_user_id: externalUserId,
      ...(roomId ? { room_id: roomId } : {}),
      role,
      rtc_mode: rtcMode,
      permissions,
    },
  });
}

export async function startRtcSession({
  apiUrl = RTC_DEFAULT_SIGNALING_URL,
  apiKey = RTC_DEFAULT_API_KEY,
  externalUserId,
  roomId,
  role = "publisher",
  rtcMode = "video",
  micEnabled = true,
  cameraEnabled = true,
  permissions,
} = {}) {
  return requestJson(`${apiUrl}/client/rtc/session/start`, {
    method: "POST",
    headers: getClientHeaders(apiKey),
    body: {
      external_user_id: externalUserId,
      room_id: roomId,
      role,
      rtc_mode: rtcMode,
      mic_enabled: micEnabled,
      camera_enabled: cameraEnabled,
      ...(permissions ? { permissions } : {}),
    },
  });
}

export async function endRtcSession({
  apiUrl = RTC_DEFAULT_SIGNALING_URL,
  apiKey = RTC_DEFAULT_API_KEY,
  externalUserId,
  roomId,
} = {}) {
  return requestJson(`${apiUrl}/client/rtc/session/end`, {
    method: "POST",
    headers: getClientHeaders(apiKey),
    body: {
      external_user_id: externalUserId,
      room_id: roomId,
    },
  });
}

export class RtcServiceClient extends EventTarget {
  constructor({
    signalingUrl = RTC_DEFAULT_SIGNALING_URL,
    token,
    iceServers = DEFAULT_ICE_SERVERS,
    mediaConstraints = { video: true, audio: true },
  } = {}) {
    super();

    if (!token) {
      throw new Error("RTC token is required");
    }

    this.signalingUrl = signalingUrl;
    this.token = token;
    this.iceServers = iceServers;
    this.mediaConstraints = mediaConstraints;

    this.socket = null;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.remotePeerId = null;
    this.currentRoomId = null;
    this.pendingCandidates = [];
    this.localVideo = null;
    this.remoteVideo = null;
    this.isMicEnabled = true;
    this.isCameraEnabled = true;
    this.isSpeakerEnabled = true;
  }

  on(eventName, handler) {
    const listener = (event) => handler(event.detail);

    this.addEventListener(eventName, listener);

    return () => this.removeEventListener(eventName, listener);
  }

  setVideoElements({ localVideo, remoteVideo } = {}) {
    this.localVideo = localVideo ?? this.localVideo;
    this.remoteVideo = remoteVideo ?? this.remoteVideo;

    if (this.localVideo && this.localStream) {
      this.localVideo.srcObject = this.localStream;
    }

    if (this.remoteVideo && this.remoteStream) {
      this.remoteVideo.srcObject = this.remoteStream;
      this.remoteVideo.muted = !this.isSpeakerEnabled;
    }
  }

  async connect() {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(this.signalingUrl, {
      auth: { token: this.token },
      transports: ["websocket", "polling"],
    });

    this.bindSocketEvents();

    return new Promise((resolve, reject) => {
      const handleConnect = () => {
        cleanup();
        resolve(this.socket);
      };

      const handleConnectError = (error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        this.socket.off("connect", handleConnect);
        this.socket.off("connect_error", handleConnectError);
      };

      this.socket.once("connect", handleConnect);
      this.socket.once("connect_error", handleConnectError);
    });
  }

  async joinRoom(roomId, mediaState = {}) {
    const trimmedRoomId = roomId?.trim();

    if (!trimmedRoomId) {
      throw new Error("Room id is required");
    }

    await this.connect();
    await this.ensureLocalStream();

    this.currentRoomId = trimmedRoomId;
    this.socket.emit("room:join", {
      roomId: trimmedRoomId,
      micEnabled: mediaState.micEnabled ?? this.isMicEnabled,
      cameraEnabled: mediaState.cameraEnabled ?? this.isCameraEnabled,
      speakerEnabled: mediaState.speakerEnabled ?? this.isSpeakerEnabled,
    });
    this.emitSdkEvent("joining-room", { roomId: trimmedRoomId });
  }

  leaveRoom({ stopMedia = false } = {}) {
    this.socket?.emit("room:leave");
    this.currentRoomId = null;
    this.closePeerConnection();

    if (stopMedia) {
      this.stopLocalStream();
    }

    this.emitSdkEvent("room-left", {});
  }

  async ensureLocalStream() {
    if (this.localStream) {
      return this.localStream;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera and microphone are not available in this browser");
    }

    const stream = await navigator.mediaDevices.getUserMedia(this.mediaConstraints);

    this.localStream = stream;
    this.applyLocalTrackState();

    if (this.localVideo) {
      this.localVideo.srcObject = stream;
    }

    this.emitSdkEvent("media-ready", { stream });

    return stream;
  }

  muteLocalAudio(muted) {
    this.isMicEnabled = !muted;
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = this.isMicEnabled;
    });
    this.emitMediaState();
  }

  setMicrophoneEnabled(enabled) {
    this.muteLocalAudio(!enabled);
  }

  setCameraEnabled(enabled) {
    this.isCameraEnabled = enabled;
    this.localStream?.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
    });
    this.emitMediaState();
  }

  muteLocalVideo(muted) {
    this.setCameraEnabled(!muted);
  }

  async setSpeakerphoneOn(enabled, deviceId) {
    this.isSpeakerEnabled = enabled;

    if (this.remoteVideo) {
      this.remoteVideo.muted = !enabled;

      if (enabled && deviceId && typeof this.remoteVideo.setSinkId === "function") {
        await this.remoteVideo.setSinkId(deviceId);
      }
    }

    this.emitMediaState();
  }

  async switchCamera({ facingMode = "user" } = {}) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera is not available in this browser");
    }

    const nextStream = await navigator.mediaDevices.getUserMedia({
      ...this.mediaConstraints,
      video: { facingMode },
    });
    const [nextVideoTrack] = nextStream.getVideoTracks();

    if (!nextVideoTrack) {
      nextStream.getTracks().forEach((track) => track.stop());
      throw new Error("No video track is available");
    }

    const [oldVideoTrack] = this.localStream?.getVideoTracks() ?? [];
    const sender = this.peerConnection
      ?.getSenders()
      .find((item) => item.track?.kind === "video");

    if (sender) {
      await sender.replaceTrack(nextVideoTrack);
    }

    oldVideoTrack?.stop();
    this.replaceTrackInLocalStream(oldVideoTrack, nextVideoTrack);
    nextStream.getAudioTracks().forEach((track) => track.stop());
    this.setCameraEnabled(this.isCameraEnabled);

    if (this.localVideo) {
      this.localVideo.srcObject = this.localStream;
    }

    this.emitSdkEvent("camera-switched", { facingMode });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.currentRoomId = null;
    this.closePeerConnection();
  }

  destroy() {
    this.disconnect();
    this.stopLocalStream();
  }

  bindSocketEvents() {
    this.socket.on("connect", () => {
      this.emitSdkEvent("connected", { socketId: this.socket.id });
    });

    this.socket.on("disconnect", (reason) => {
      this.emitSdkEvent("disconnected", { reason });
    });

    this.socket.on("connect_error", (error) => {
      this.emitSdkEvent("error", { message: error.message });
    });

    this.socket.on("room:joined", (event) => {
      this.currentRoomId = event?.room?.id ?? this.currentRoomId;
      this.emitSdkEvent("room-joined", event);
    });

    this.socket.on("room:left", (event) => {
      this.currentRoomId = null;
      this.closePeerConnection();
      this.emitSdkEvent("room-left", event);
    });

    this.socket.on("room:state", (event) => {
      this.emitSdkEvent("room-state", event);
    });

    this.socket.on("participant:joined", (event) => {
      this.emitSdkEvent("participant-joined", event);
    });

    this.socket.on("participant:updated", (event) => {
      this.emitSdkEvent("participant-updated", event);
    });

    this.socket.on("participant:left", (event) => {
      this.emitSdkEvent("participant-left", event);
    });

    this.socket.on("room:error", (event) => {
      this.emitSdkEvent("room-error", {
        message: event?.message ?? "Unable to join room",
      });
    });

    this.socket.on("room:full", (event) => {
      this.emitSdkEvent("room-full", {
        message: event?.message ?? "Room is full",
        ...event,
      });
    });

    this.socket.on("signal:error", (event) => {
      this.emitSdkEvent("error", {
        message: event?.message ?? "Unable to send signal",
      });
    });

    this.socket.on("existing-users", async (users) => {
      const [peerId] = Array.isArray(users) ? users : [];

      if (!peerId) {
        this.emitSdkEvent("waiting-for-peer");
        return;
      }

      await this.createOffer(peerId);
    });

    this.socket.on("user-joined", (peerId) => {
      this.remotePeerId = peerId;
      this.emitSdkEvent("peer-joined", { peerId });
    });

    this.socket.on("user-left", (peerId) => {
      if (peerId === this.remotePeerId) {
        this.closePeerConnection();
        this.emitSdkEvent("peer-left", { peerId });
      }
    });

    this.socket.on("signal", async ({ from, data } = {}) => {
      if (!from || !data) {
        return;
      }

      try {
        await this.handleSignal(from, data);
      } catch (error) {
        this.emitSdkEvent("error", { message: getErrorMessage(error) });
      }
    });
  }

  async createPeerConnection(peerId) {
    const localStream = await this.ensureLocalStream();

    if (this.peerConnection && this.remotePeerId === peerId) {
      return this.peerConnection;
    }

    this.closePeerConnection();
    this.remotePeerId = peerId;

    const peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers,
    });

    this.peerConnection = peerConnection;

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.onicecandidate = ({ candidate }) => {
      if (!candidate) {
        return;
      }

      this.sendSignal(peerId, {
        type: "ice",
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
      });
    };

    peerConnection.ontrack = ({ streams }) => {
      const [remoteStream] = streams;

      this.remoteStream = remoteStream ?? null;

      if (this.remoteVideo && remoteStream) {
        this.remoteVideo.srcObject = remoteStream;
        this.remoteVideo.muted = !this.isSpeakerEnabled;
      }

      this.emitSdkEvent("remote-stream", { stream: remoteStream });
    };

    peerConnection.onconnectionstatechange = () => {
      this.emitSdkEvent("connection-state", {
        state: peerConnection.connectionState,
      });
    };

    return peerConnection;
  }

  async createOffer(peerId) {
    const peerConnection = await this.createPeerConnection(peerId);
    const offer = await peerConnection.createOffer();

    await peerConnection.setLocalDescription(offer);

    this.sendSignal(peerId, {
      type: "offer",
      sdp: offer.sdp,
    });

    this.emitSdkEvent("calling", { peerId });
  }

  async handleSignal(peerId, rawSignal) {
    const signal = normalizeSignal(rawSignal);

    if (!signal) {
      return;
    }

    const peerConnection = await this.createPeerConnection(peerId);

    if (signal.type === "offer") {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription({ type: "offer", sdp: signal.sdp }),
      );
      await this.flushPendingCandidates(peerConnection);

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      this.sendSignal(peerId, {
        type: "answer",
        sdp: answer.sdp,
      });

      this.emitSdkEvent("answer-sent", { peerId });
      return;
    }

    if (signal.type === "answer") {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription({ type: "answer", sdp: signal.sdp }),
      );
      await this.flushPendingCandidates(peerConnection);
      this.emitSdkEvent("answer-received", { peerId });
      return;
    }

    if (signal.type === "ice") {
      const candidate = new RTCIceCandidate({
        candidate: signal.candidate,
        sdpMid: signal.sdpMid,
        sdpMLineIndex: signal.sdpMLineIndex,
      });

      if (peerConnection.remoteDescription) {
        await peerConnection.addIceCandidate(candidate);
        return;
      }

      this.pendingCandidates.push(candidate);
    }
  }

  async flushPendingCandidates(peerConnection) {
    const candidates = this.pendingCandidates.splice(0);

    for (const candidate of candidates) {
      await peerConnection.addIceCandidate(candidate);
    }
  }

  sendSignal(peerId, data) {
    this.socket?.emit("signal", {
      to: peerId,
      data,
    });
  }

  closePeerConnection() {
    if (this.remoteVideo) {
      this.remoteVideo.srcObject = null;
    }

    this.peerConnection?.close();
    this.peerConnection = null;
    this.remoteStream = null;
    this.remotePeerId = null;
    this.pendingCandidates = [];
  }

  stopLocalStream() {
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;

    if (this.localVideo) {
      this.localVideo.srcObject = null;
    }
  }

  applyLocalTrackState() {
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = this.isMicEnabled;
    });
    this.localStream?.getVideoTracks().forEach((track) => {
      track.enabled = this.isCameraEnabled;
    });
  }

  emitMediaState() {
    const state = {
      micEnabled: this.isMicEnabled,
      cameraEnabled: this.isCameraEnabled,
      speakerEnabled: this.isSpeakerEnabled,
    };

    this.socket?.emit("media:state", state);
    this.emitSdkEvent("local-media-state", state);
  }

  replaceTrackInLocalStream(oldTrack, nextTrack) {
    if (!this.localStream) {
      this.localStream = new MediaStream([nextTrack]);
      return;
    }

    if (oldTrack) {
      this.localStream.removeTrack(oldTrack);
    }

    this.localStream.addTrack(nextTrack);
  }

  emitSdkEvent(eventName, detail = {}) {
    this.dispatchEvent(new CustomEvent(eventName, { detail }));
  }
}

function getClientHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
  };
}

async function requestJson(url, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json();
}

function normalizeSignal(signal) {
  if (signal?.type) {
    return signal;
  }

  if (signal?.offer) {
    return { type: "offer", sdp: signal.offer.sdp };
  }

  if (signal?.answer) {
    return { type: "answer", sdp: signal.answer.sdp };
  }

  if (signal?.candidate) {
    return {
      type: "ice",
      candidate: signal.candidate.candidate,
      sdpMid: signal.candidate.sdpMid,
      sdpMLineIndex: signal.candidate.sdpMLineIndex,
    };
  }

  return null;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "Something went wrong";
}
