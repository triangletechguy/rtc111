import { io } from "socket.io-client";

export const RTC_DEFAULT_SIGNALING_URL =
  import.meta.env.VITE_SIGNALING_URL ?? "http://localhost:4000";

const DEFAULT_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export async function createRtcToken({
  apiUrl = RTC_DEFAULT_SIGNALING_URL,
  roomId,
  userId,
} = {}) {
  const response = await fetch(`${apiUrl}/rtc-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...(roomId ? { roomId } : {}),
      ...(userId ? { userId } : {}),
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Unable to create RTC token");
  }

  return response.json();
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
    this.remotePeerId = null;
    this.pendingCandidates = [];
    this.localVideo = null;
    this.remoteVideo = null;
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

  async joinRoom(roomId) {
    const trimmedRoomId = roomId?.trim();

    if (!trimmedRoomId) {
      throw new Error("Room id is required");
    }

    await this.connect();
    await this.ensureLocalStream();

    this.socket.emit("room:join", { roomId: trimmedRoomId });
    this.emitSdkEvent("room-joined", { roomId: trimmedRoomId });
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

    if (this.localVideo) {
      this.localVideo.srcObject = stream;
    }

    this.emitSdkEvent("media-ready", { stream });

    return stream;
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
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

    this.socket.on("room:error", (event) => {
      this.emitSdkEvent("room-error", {
        message: event?.message ?? "Unable to join room",
      });
    });

    this.socket.on("room:full", () => {
      this.emitSdkEvent("room-full", { message: "Room is full" });
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

      if (this.remoteVideo && remoteStream) {
        this.remoteVideo.srcObject = remoteStream;
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
    this.remotePeerId = null;
    this.pendingCandidates = [];
  }

  stopLocalStream() {
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
  }

  emitSdkEvent(eventName, detail = {}) {
    this.dispatchEvent(new CustomEvent(eventName, { detail }));
  }
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
