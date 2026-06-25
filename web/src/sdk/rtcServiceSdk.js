import { io } from "socket.io-client";

export const RTC_DEFAULT_SIGNALING_URL =
  import.meta.env.VITE_SIGNALING_URL ?? "http://localhost:4000";

export const RTC_DEFAULT_API_KEY =
  import.meta.env.VITE_RTC_API_KEY ?? "rtc-dev-api-key";

export const RTC_DEFAULT_ADMIN_KEY =
  import.meta.env.VITE_RTC_ADMIN_KEY ?? "rtc-admin-dev-key";

const DEFAULT_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
export const RTC_CONNECTION_INDICATORS = Object.freeze({
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  JOINING_ROOM: "joining_room",
  IN_ROOM: "in_room",
  WAITING_FOR_PEER: "waiting_for_peer",
  PEER_CONNECTING: "peer_connecting",
  PEER_CONNECTED: "peer_connected",
  RECONNECTING: "reconnecting",
  FAILED: "failed",
});
export const RTC_AUDIO_ROOM_PERMISSIONS = ["join", "publish_audio", "chat", "signal"];
export const RTC_ONE_TO_ONE_VOICE_PERMISSIONS = ["join", "publish_audio", "chat", "signal"];
export const RTC_GROUP_VOICE_PERMISSIONS = ["join", "publish_audio", "chat", "signal"];
export const RTC_SCREEN_SHARE_PERMISSIONS = ["join", "publish_audio", "publish_video", "screen_share", "chat", "signal"];
export const RTC_VIDEO_ROOM_PERMISSIONS = [
  "join",
  "publish_audio",
  "publish_video",
  "screen_share",
  "chat",
  "signal",
];
export const RTC_LIVE_VIDEO_PERMISSIONS = [
  "join",
  "publish_audio",
  "publish_video",
  "screen_share",
  "chat",
  "signal",
  "live_control",
];
export const RTC_YOUTUBE_ROOM_PERMISSIONS = [
  "join",
  "publish_audio",
  "chat",
  "signal",
  "youtube_control",
];

export async function createRtcToken({
  apiUrl = RTC_DEFAULT_SIGNALING_URL,
  roomId,
  userId,
  role = "publisher",
  rtcMode = "video",
  permissions = getDefaultPermissionsForMode(rtcMode),
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

export async function getAdminBilling({
  apiUrl = RTC_DEFAULT_SIGNALING_URL,
  adminKey = RTC_DEFAULT_ADMIN_KEY,
} = {}) {
  return requestJson(`${apiUrl}/admin/billing/companies`, {
    headers: getAdminHeaders(adminKey),
  });
}

export async function getAdminAppBilling({
  apiUrl = RTC_DEFAULT_SIGNALING_URL,
  adminKey = RTC_DEFAULT_ADMIN_KEY,
  appId,
} = {}) {
  if (!appId) {
    throw new Error("appId is required");
  }

  return requestJson(`${apiUrl}/admin/apps/${encodeURIComponent(appId)}/billing`, {
    headers: getAdminHeaders(adminKey),
  });
}

export async function getClientBillingUsage({
  apiUrl = RTC_DEFAULT_SIGNALING_URL,
  apiKey = RTC_DEFAULT_API_KEY,
} = {}) {
  return requestJson(`${apiUrl}/client/billing/usage`, {
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

export async function createAudioRoom(options = {}) {
  return createRoom({
    roomType: "voice",
    maxParticipants: 8,
    maxMicCount: 8,
    ...options,
  });
}

export async function createOneToOneVoiceRoom(options = {}) {
  return createRoom({
    roomType: "voice_call",
    maxParticipants: 2,
    maxMicCount: 2,
    ...options,
  });
}

export async function createGroupVoiceRoom(options = {}) {
  return createRoom({
    roomType: "group_voice",
    maxParticipants: 8,
    maxMicCount: 8,
    ...options,
  });
}

export async function createYoutubeRoom(options = {}) {
  const { metadata = {}, ...roomOptions } = options;

  return createRoom({
    roomType: "youtube",
    maxParticipants: 8,
    maxMicCount: 8,
    ...roomOptions,
    metadata: {
      provider: "youtube",
      ...metadata,
    },
  });
}

export async function createVideoCallRoom(options = {}) {
  return createRoom({
    roomType: "video_call",
    maxParticipants: 2,
    maxMicCount: 2,
    ...options,
  });
}

export async function createOneToOneVideoCallRoom(options = {}) {
  return createVideoCallRoom(options);
}

export async function createGroupVideoRoom(options = {}) {
  return createRoom({
    roomType: "group_video",
    maxParticipants: 8,
    maxMicCount: 8,
    ...options,
  });
}

export async function createSoloVideoLiveRoom(options = {}) {
  return createRoom({
    roomType: "solo_live",
    maxParticipants: 100,
    maxMicCount: 1,
    ...options,
  });
}

export async function createLivePkRoom(options = {}) {
  return createRoom({
    roomType: "live_pk",
    maxParticipants: 100,
    maxMicCount: 2,
    ...options,
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
  permissions = getDefaultPermissionsForMode(rtcMode),
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

export async function issueAudioRoomToken(options = {}) {
  return issueRtcToken({
    rtcMode: "voice",
    permissions: RTC_AUDIO_ROOM_PERMISSIONS,
    ...options,
  });
}

export async function issueOneToOneVoiceToken(options = {}) {
  return issueRtcToken({
    rtcMode: "voice_call",
    permissions: RTC_ONE_TO_ONE_VOICE_PERMISSIONS,
    ...options,
  });
}

export async function issueGroupVoiceToken(options = {}) {
  return issueRtcToken({
    rtcMode: "group_voice",
    permissions: RTC_GROUP_VOICE_PERMISSIONS,
    ...options,
  });
}

export async function issueYoutubeRoomToken(options = {}) {
  return issueRtcToken({
    rtcMode: "youtube",
    permissions: RTC_YOUTUBE_ROOM_PERMISSIONS,
    ...options,
  });
}

export async function issueVideoCallToken(options = {}) {
  return issueRtcToken({
    rtcMode: "video_call",
    permissions: RTC_VIDEO_ROOM_PERMISSIONS,
    ...options,
  });
}

export async function issueOneToOneVideoCallToken(options = {}) {
  return issueVideoCallToken(options);
}

export async function issueGroupVideoToken(options = {}) {
  return issueRtcToken({
    rtcMode: "group_video",
    permissions: RTC_VIDEO_ROOM_PERMISSIONS,
    ...options,
  });
}

export async function issueSoloVideoLiveToken(options = {}) {
  return issueRtcToken({
    rtcMode: "solo_live",
    permissions: RTC_LIVE_VIDEO_PERMISSIONS,
    ...options,
  });
}

export async function issueLivePkToken(options = {}) {
  return issueRtcToken({
    rtcMode: "live_pk",
    permissions: RTC_LIVE_VIDEO_PERMISSIONS,
    ...options,
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
  cameraEnabled = !isAudioOnlyMode(rtcMode),
  noiseCancellationEnabled = true,
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
      noise_cancellation_enabled: noiseCancellationEnabled,
      ...(permissions ? { permissions } : {}),
    },
  });
}

export async function startAudioRoomSession(options = {}) {
  return startRtcSession({
    rtcMode: "voice",
    micEnabled: true,
    cameraEnabled: false,
    permissions: RTC_AUDIO_ROOM_PERMISSIONS,
    ...options,
  });
}

export async function startOneToOneVoiceSession(options = {}) {
  return startRtcSession({
    rtcMode: "voice_call",
    micEnabled: true,
    cameraEnabled: false,
    permissions: RTC_ONE_TO_ONE_VOICE_PERMISSIONS,
    ...options,
  });
}

export async function startGroupVoiceSession(options = {}) {
  return startRtcSession({
    rtcMode: "group_voice",
    micEnabled: true,
    cameraEnabled: false,
    permissions: RTC_GROUP_VOICE_PERMISSIONS,
    ...options,
  });
}

export async function startVideoCallSession(options = {}) {
  return startRtcSession({
    rtcMode: "video_call",
    micEnabled: true,
    cameraEnabled: true,
    permissions: RTC_VIDEO_ROOM_PERMISSIONS,
    ...options,
  });
}

export async function startOneToOneVideoCallSession(options = {}) {
  return startVideoCallSession(options);
}

export async function startGroupVideoSession(options = {}) {
  return startRtcSession({
    rtcMode: "group_video",
    micEnabled: true,
    cameraEnabled: true,
    permissions: RTC_VIDEO_ROOM_PERMISSIONS,
    ...options,
  });
}

export async function startSoloVideoLiveSession(options = {}) {
  return startRtcSession({
    rtcMode: "solo_live",
    micEnabled: true,
    cameraEnabled: true,
    permissions: RTC_LIVE_VIDEO_PERMISSIONS,
    ...options,
  });
}

export async function startLivePkSession(options = {}) {
  return startRtcSession({
    rtcMode: "live_pk",
    micEnabled: true,
    cameraEnabled: true,
    permissions: RTC_LIVE_VIDEO_PERMISSIONS,
    ...options,
  });
}

export async function startYoutubeRoomSession(options = {}) {
  return startRtcSession({
    rtcMode: "youtube",
    micEnabled: true,
    cameraEnabled: false,
    permissions: RTC_YOUTUBE_ROOM_PERMISSIONS,
    ...options,
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
    this.isNoiseCancellationEnabled = getAudioProcessingEnabled(mediaConstraints);
    this.mediaConstraints = withNoiseCancellation(mediaConstraints, this.isNoiseCancellationEnabled);

    this.socket = null;
    this.peerConnections = new Map();
    this.remoteStreams = new Map();
    this.pendingCandidatesByPeer = new Map();
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.remotePeerId = null;
    this.currentRoomId = null;
    this.pendingCandidates = [];
    this.localVideo = null;
    this.remoteVideo = null;
    this.isMicEnabled = mediaConstraints.audio !== false;
    this.isCameraEnabled = mediaConstraints.video !== false;
    this.isSpeakerEnabled = true;
    this.isScreenSharing = false;
    this.videoEffects = createDefaultVideoEffects();
    this.youtubeState = null;
    this.livePkState = null;
    this.connectionIndicator = RTC_CONNECTION_INDICATORS.DISCONNECTED;
    this.connectionIndicatorDetail = {
      indicator: RTC_CONNECTION_INDICATORS.DISCONNECTED,
      state: RTC_CONNECTION_INDICATORS.DISCONNECTED,
      updatedAt: new Date().toISOString(),
    };
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
      this.updateConnectionIndicator(RTC_CONNECTION_INDICATORS.CONNECTED);
      return this.socket;
    }

    this.updateConnectionIndicator(RTC_CONNECTION_INDICATORS.CONNECTING);

    this.socket = io(this.signalingUrl, {
      auth: { token: this.token },
      transports: ["websocket", "polling"],
    });

    this.bindSocketEvents();

    return new Promise((resolve, reject) => {
      const handleConnect = () => {
        cleanup();
        this.updateConnectionIndicator(RTC_CONNECTION_INDICATORS.CONNECTED);
        resolve(this.socket);
      };

      const handleConnectError = (error) => {
        cleanup();
        this.updateConnectionIndicator(RTC_CONNECTION_INDICATORS.FAILED, {
          message: error.message,
        });
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

    this.isMicEnabled = mediaState.micEnabled ?? this.isMicEnabled;
    this.isCameraEnabled = mediaState.cameraEnabled ?? this.isCameraEnabled;
    this.isSpeakerEnabled = mediaState.speakerEnabled ?? this.isSpeakerEnabled;
    this.isNoiseCancellationEnabled =
      mediaState.noiseCancellationEnabled ?? this.isNoiseCancellationEnabled;
    this.isScreenSharing = mediaState.screenShareEnabled ?? this.isScreenSharing;
    this.videoEffects = {
      ...this.videoEffects,
      ...normalizeVideoEffects(mediaState.videoEffects ?? {}),
    };
    this.mediaConstraints = withNoiseCancellation(
      this.mediaConstraints,
      this.isNoiseCancellationEnabled,
    );

    await this.ensureLocalStream();
    this.applyLocalTrackState();

    const joinAck = new Promise((resolve, reject) => {
      const handleJoined = (event) => {
        cleanup();
        resolve(event);
      };

      const handleRoomError = (event) => {
        cleanup();
        reject(new Error(event?.message ?? "Unable to join room"));
      };

      const handleRoomFull = (event) => {
        cleanup();
        reject(new Error(event?.message ?? "Room is full"));
      };

      const cleanup = () => {
        this.socket.off("room:joined", handleJoined);
        this.socket.off("room:error", handleRoomError);
        this.socket.off("room:full", handleRoomFull);
      };

      this.socket.once("room:joined", handleJoined);
      this.socket.once("room:error", handleRoomError);
      this.socket.once("room:full", handleRoomFull);
    });

    this.updateConnectionIndicator(RTC_CONNECTION_INDICATORS.JOINING_ROOM, {
      roomId: trimmedRoomId,
    });

    this.socket.emit("room:join", {
      roomId: trimmedRoomId,
      micEnabled: this.isMicEnabled,
      cameraEnabled: this.isCameraEnabled,
      noiseCancellationEnabled: this.isNoiseCancellationEnabled,
      screenShareEnabled: this.isScreenSharing,
      videoEffects: this.videoEffects,
      speakerEnabled: this.isSpeakerEnabled,
    });
    this.emitSdkEvent("joining-room", { roomId: trimmedRoomId });

    return joinAck;
  }

  async joinAudioRoom(roomId, mediaState = {}) {
    this.mediaConstraints = {
      ...this.mediaConstraints,
      audio: this.mediaConstraints.audio ?? true,
      video: false,
    };
    this.mediaConstraints = withNoiseCancellation(
      this.mediaConstraints,
      this.isNoiseCancellationEnabled,
    );
    this.isCameraEnabled = false;

    return this.joinRoom(roomId, {
      ...mediaState,
      cameraEnabled: false,
    });
  }

  async joinVoiceCall(roomId, mediaState = {}) {
    return this.joinAudioRoom(roomId, mediaState);
  }

  async joinGroupVoiceRoom(roomId, mediaState = {}) {
    return this.joinAudioRoom(roomId, mediaState);
  }

  async joinYoutubeRoom(roomId, mediaState = {}) {
    this.mediaConstraints = {
      ...this.mediaConstraints,
      audio: this.mediaConstraints.audio ?? true,
      video: false,
    };
    this.mediaConstraints = withNoiseCancellation(
      this.mediaConstraints,
      this.isNoiseCancellationEnabled,
    );
    this.isCameraEnabled = false;

    return this.joinRoom(roomId, {
      ...mediaState,
      cameraEnabled: false,
    });
  }

  async joinVideoRoom(roomId, mediaState = {}) {
    this.mediaConstraints = {
      ...this.mediaConstraints,
      video: mediaState.cameraEnabled === false ? false : true,
    };
    this.isCameraEnabled = mediaState.cameraEnabled ?? true;

    return this.joinRoom(roomId, {
      ...mediaState,
      cameraEnabled: this.isCameraEnabled,
    });
  }

  async joinVideoCall(roomId, mediaState = {}) {
    return this.joinVideoRoom(roomId, mediaState);
  }

  async joinOneToOneVideoCall(roomId, mediaState = {}) {
    return this.joinVideoCall(roomId, mediaState);
  }

  async joinGroupVideoRoom(roomId, mediaState = {}) {
    return this.joinVideoRoom(roomId, mediaState);
  }

  async joinSoloVideoLive(roomId, mediaState = {}) {
    return this.joinVideoRoom(roomId, mediaState);
  }

  async joinLivePkRoom(roomId, mediaState = {}) {
    return this.joinVideoRoom(roomId, mediaState);
  }

  leaveRoom({ stopMedia = false } = {}) {
    this.socket?.emit("room:leave");
    this.currentRoomId = null;
    this.closePeerConnection();
    this.updateConnectionIndicator(
      this.socket?.connected
        ? RTC_CONNECTION_INDICATORS.CONNECTED
        : RTC_CONNECTION_INDICATORS.DISCONNECTED,
    );

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

  async setNoiseCancellationEnabled(enabled) {
    this.isNoiseCancellationEnabled = enabled;
    this.mediaConstraints = withNoiseCancellation(this.mediaConstraints, enabled);

    const audioTracks = this.localStream?.getAudioTracks() ?? [];

    await Promise.all(
      audioTracks.map(async (track) => {
        if (typeof track.applyConstraints !== "function") {
          return;
        }

        await track.applyConstraints({
          noiseSuppression: enabled,
          echoCancellation: true,
          autoGainControl: true,
        });
      }),
    );

    this.emitMediaState();
    this.emitSdkEvent("noise-cancellation-changed", { enabled });
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

    await this.replaceOutgoingVideoTrack(nextVideoTrack);
    nextStream.getAudioTracks().forEach((track) => track.stop());
    this.setCameraEnabled(this.isCameraEnabled);

    this.emitSdkEvent("camera-switched", { facingMode });
  }

  async startScreenShare({ audio = false } = {}) {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("Screen sharing is not available in this browser");
    }

    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio,
    });
    const [screenTrack] = displayStream.getVideoTracks();

    if (!screenTrack) {
      displayStream.getTracks().forEach((track) => track.stop());
      throw new Error("No screen video track is available");
    }

    await this.replaceOutgoingVideoTrack(screenTrack);
    this.isScreenSharing = true;
    screenTrack.onended = () => {
      this.stopScreenShare().catch((error) => {
        this.emitSdkEvent("error", { message: getErrorMessage(error) });
      });
    };
    this.emitScreenShareState(true);
    this.emitSdkEvent("screen-share-started", { stream: displayStream });
    return displayStream;
  }

  async stopScreenShare({ facingMode = "user" } = {}) {
    if (!this.isScreenSharing) {
      return;
    }

    const nextStream = await navigator.mediaDevices.getUserMedia({
      ...this.mediaConstraints,
      video: { facingMode },
      audio: false,
    });
    const [cameraTrack] = nextStream.getVideoTracks();

    if (!cameraTrack) {
      nextStream.getTracks().forEach((track) => track.stop());
      throw new Error("No camera video track is available");
    }

    await this.replaceOutgoingVideoTrack(cameraTrack);
    nextStream.getAudioTracks().forEach((track) => track.stop());
    this.isScreenSharing = false;
    this.emitScreenShareState(false);
    this.emitSdkEvent("screen-share-stopped", {});
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.currentRoomId = null;
    this.closePeerConnections();
    this.updateConnectionIndicator(RTC_CONNECTION_INDICATORS.DISCONNECTED);
  }

  destroy() {
    this.disconnect();
    this.stopLocalStream();
  }

  bindSocketEvents() {
    this.socket.on("connect", () => {
      this.updateConnectionIndicator(RTC_CONNECTION_INDICATORS.CONNECTED);
      this.emitSdkEvent("connected", { socketId: this.socket.id });
    });

    this.socket.on("disconnect", (reason) => {
      this.updateConnectionIndicator(
        reason === "transport close"
          ? RTC_CONNECTION_INDICATORS.RECONNECTING
          : RTC_CONNECTION_INDICATORS.DISCONNECTED,
        { reason },
      );
      this.emitSdkEvent("disconnected", { reason });
    });

    this.socket.on("connect_error", (error) => {
      this.updateConnectionIndicator(RTC_CONNECTION_INDICATORS.FAILED, {
        message: error.message,
      });
      this.emitSdkEvent("error", { message: error.message });
    });

    this.socket.on("room:joined", (event) => {
      this.currentRoomId = event?.room?.id ?? this.currentRoomId;
      this.updateConnectionIndicator(RTC_CONNECTION_INDICATORS.IN_ROOM, {
        roomId: this.currentRoomId,
      });
      this.emitSdkEvent("room-joined", event);
    });

    this.socket.on("room:left", (event) => {
      this.currentRoomId = null;
      this.closePeerConnections();
      this.updateConnectionIndicator(
        this.socket?.connected
          ? RTC_CONNECTION_INDICATORS.CONNECTED
          : RTC_CONNECTION_INDICATORS.DISCONNECTED,
      );
      this.emitSdkEvent("room-left", event);
    });

    this.socket.on("room:state", (event) => {
      this.emitSdkEvent("room-state", event);
    });

    this.socket.on("room:updated", (event) => {
      this.emitSdkEvent("room-updated", event);
    });

    this.socket.on("room:profile", (event) => {
      this.emitSdkEvent("room-profile", event);
    });

    this.socket.on("room:settings", (event) => {
      this.emitSdkEvent("room-settings", event);
    });

    this.socket.on("room:theme", (event) => {
      this.emitSdkEvent("room-theme", event);
    });

    this.socket.on("room:announcement", (event) => {
      this.emitSdkEvent("room-announcement", event);
    });

    this.socket.on("room:admins", (event) => {
      this.emitSdkEvent("room-admins", event);
    });

    this.socket.on("room:entry", (event) => {
      this.emitSdkEvent("room-entry", event);
    });

    this.socket.on("room:kicked", (event) => {
      this.emitSdkEvent("room-kicked", event);
    });

    this.socket.on("room:kick:history", (event) => {
      this.emitSdkEvent("room-kick-history", event);
    });

    this.socket.on("room:like", (event) => {
      this.emitSdkEvent("room-like", event);
    });

    this.socket.on("room:share", (event) => {
      this.emitSdkEvent("room-share", event);
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

    this.socket.on("participant:mic:muted", (event) => {
      this.emitSdkEvent("participant-mic-muted", event);
    });

    this.socket.on("message:history", (event) => {
      this.emitSdkEvent("message-history", event);
    });

    this.socket.on("message:received", (event) => {
      this.emitSdkEvent("message-received", event);
    });

    this.socket.on("message:blocked", (event) => {
      this.emitSdkEvent("message-blocked", event);
    });

    this.socket.on("message:error", (event) => {
      this.emitSdkEvent("message-error", event);
    });

    this.socket.on("message:updated", (event) => {
      this.emitSdkEvent("message-updated", event);
    });

    this.socket.on("message:unsent", (event) => {
      this.emitSdkEvent("message-unsent", event);
    });

    this.socket.on("message:deleted", (event) => {
      this.emitSdkEvent("message-deleted", event);
    });

    this.socket.on("comment:received", (event) => {
      this.emitSdkEvent("comment-received", event);
    });

    this.socket.on("comment:cleaned", (event) => {
      this.emitSdkEvent("comment-cleaned", event);
    });

    this.socket.on("gift:history", (event) => {
      this.emitSdkEvent("gift-history", event);
    });

    this.socket.on("gift:received", (event) => {
      this.emitSdkEvent("gift-received", event);
    });

    this.socket.on("chat:ban", (event) => {
      this.emitSdkEvent("chat-ban", event);
    });

    this.socket.on("chat:ban:history", (event) => {
      this.emitSdkEvent("chat-ban-history", event);
    });

    this.socket.on("user:block:updated", (event) => {
      this.emitSdkEvent("user-block-updated", event);
    });

    this.socket.on("youtube:state", (event) => {
      this.youtubeState = event ?? null;
      this.emitSdkEvent("youtube-state", event);
    });

    this.socket.on("youtube:error", (event) => {
      this.emitSdkEvent("youtube-error", {
        message: event?.message ?? "Unable to update YouTube room",
      });
    });

    this.socket.on("screen:state", (event) => {
      this.emitSdkEvent("screen-state", event);
    });

    this.socket.on("video:effects", (event) => {
      if (event?.participant?.socketId === this.socket.id || event?.participant?.socket_id === this.socket.id) {
        this.videoEffects = event.effects ?? this.videoEffects;
      }

      this.emitSdkEvent("video-effects", event);
    });

    this.socket.on("live:pk:state", (event) => {
      this.livePkState = event ?? null;
      this.emitSdkEvent("live-pk-state", event);
    });

    this.socket.on("security:checked", (event) => {
      this.emitSdkEvent("security-checked", event);
    });

    this.socket.on("security:incident", (event) => {
      this.emitSdkEvent("security-incident", event);
    });

    this.socket.on("room:error", (event) => {
      this.updateConnectionIndicator(RTC_CONNECTION_INDICATORS.FAILED, {
        message: event?.message ?? "Unable to join room",
      });
      this.emitSdkEvent("room-error", {
        message: event?.message ?? "Unable to join room",
      });
    });

    this.socket.on("room:full", (event) => {
      this.updateConnectionIndicator(RTC_CONNECTION_INDICATORS.FAILED, {
        message: event?.message ?? "Room is full",
      });
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
      const peerIds = Array.isArray(users) ? users : [];

      if (peerIds.length === 0) {
        this.updateConnectionIndicator(RTC_CONNECTION_INDICATORS.WAITING_FOR_PEER, {
          roomId: this.currentRoomId,
        });
        this.emitSdkEvent("waiting-for-peer");
        return;
      }

      this.updateConnectionIndicator(RTC_CONNECTION_INDICATORS.PEER_CONNECTING, {
        roomId: this.currentRoomId,
        peerCount: peerIds.length,
      });
      await Promise.all(peerIds.map((peerId) => this.createOffer(peerId)));
    });

    this.socket.on("user-joined", (peerId) => {
      this.remotePeerId = peerId;
      this.updateConnectionIndicator(RTC_CONNECTION_INDICATORS.PEER_CONNECTING, {
        roomId: this.currentRoomId,
        peerId,
      });
      this.emitSdkEvent("peer-joined", { peerId });
    });

    this.socket.on("user-left", (peerId) => {
      this.closePeerConnection(peerId);
      this.updateConnectionIndicator(
        this.peerConnections.size > 0
          ? RTC_CONNECTION_INDICATORS.PEER_CONNECTED
          : RTC_CONNECTION_INDICATORS.WAITING_FOR_PEER,
        { roomId: this.currentRoomId, peerId },
      );
      this.emitSdkEvent("peer-left", { peerId });
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

    if (this.peerConnections.has(peerId)) {
      return this.peerConnections.get(peerId);
    }

    this.remotePeerId = peerId;

    const peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers,
    });

    this.peerConnections.set(peerId, peerConnection);
    this.peerConnection = this.peerConnection ?? peerConnection;

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
      this.remoteStreams.set(peerId, remoteStream ?? null);

      if (this.remoteVideo && remoteStream) {
        this.remoteVideo.srcObject = remoteStream;
        this.remoteVideo.muted = !this.isSpeakerEnabled;
      }

      this.emitSdkEvent("remote-stream", { peerId, stream: remoteStream });
    };

    peerConnection.onconnectionstatechange = () => {
      this.updateConnectionIndicator(getIndicatorForPeerState(peerConnection.connectionState), {
        peerId,
        peerState: peerConnection.connectionState,
      });
      this.emitSdkEvent("connection-state", {
        peerId,
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
      await this.flushPendingCandidates(peerId, peerConnection);

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
      await this.flushPendingCandidates(peerId, peerConnection);
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

      this.getPendingCandidates(peerId).push(candidate);
    }
  }

  async flushPendingCandidates(peerId, peerConnection) {
    const candidates = this.getPendingCandidates(peerId).splice(0);

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

  setYoutubeVideo({ videoId, videoUrl, title, positionSeconds = 0, playbackState = "ready" } = {}) {
    this.updateYoutubeState({
      videoId,
      videoUrl,
      title,
      positionSeconds,
      playbackState,
    });
  }

  playYoutube(positionSeconds = this.youtubeState?.positionSeconds ?? 0) {
    this.updateYoutubeState({
      playbackState: "playing",
      positionSeconds,
    });
  }

  pauseYoutube(positionSeconds = this.youtubeState?.positionSeconds ?? 0) {
    this.updateYoutubeState({
      playbackState: "paused",
      positionSeconds,
    });
  }

  stopYoutube(positionSeconds = this.youtubeState?.positionSeconds ?? 0) {
    this.updateYoutubeState({
      playbackState: "stopped",
      positionSeconds,
    });
  }

  seekYoutube(positionSeconds) {
    this.updateYoutubeState({
      playbackState: this.youtubeState?.playbackState ?? "ready",
      positionSeconds,
    });
  }

  updateYoutubeState(payload = {}) {
    this.socket?.emit("youtube:update", payload);
  }

  updateLivePkState(payload = {}) {
    this.socket?.emit("live:pk:update", payload);
  }

  startLivePk({ opponentUserId, metadata = {} } = {}) {
    this.updateLivePkState({
      status: opponentUserId ? "active" : "matching",
      opponentUserId,
      metadata,
    });
  }

  updateLivePkScore({ hostScore = 0, opponentScore = 0, metadata = {} } = {}) {
    this.updateLivePkState({
      status: this.livePkState?.status ?? "active",
      hostScore,
      opponentScore,
      metadata,
    });
  }

  endLivePk(metadata = {}) {
    this.updateLivePkState({
      status: "ended",
      metadata,
    });
  }

  setVideoEffects(effects = {}) {
    this.videoEffects = {
      ...this.videoEffects,
      ...normalizeVideoEffects(effects),
    };
    this.socket?.emit("video:effects", this.videoEffects);
    this.emitMediaState();
    this.emitSdkEvent("local-video-effects", this.videoEffects);
  }

  setVideoFilter(filter = "none") {
    this.setVideoEffects({ filter });
  }

  setAiFilter(aiFilter = "none") {
    this.setVideoEffects({ aiFilter });
  }

  setSticker(sticker = "") {
    this.setVideoEffects({ sticker });
  }

  setFaceDetectEnabled(enabled) {
    this.setVideoEffects({ faceDetectEnabled: Boolean(enabled) });
  }

  setBeautyEnabled(enabled, beautyLevel = enabled ? 65 : 0) {
    this.setVideoEffects({
      beautyEnabled: Boolean(enabled),
      beautyLevel,
    });
  }

  setBeautyLevels({
    beautyLevel = 65,
    smoothingLevel = 55,
    whiteningLevel = 35,
    eyeLevel = 20,
    faceSlimLevel = 20,
  } = {}) {
    this.setVideoEffects({
      beautyEnabled: true,
      faceDetectEnabled: true,
      beautyLevel,
      smoothingLevel,
      whiteningLevel,
      eyeLevel,
      faceSlimLevel,
    });
  }

  setBeautyMakeup(makeup = {}) {
    this.setVideoEffects({
      beautyEnabled: true,
      faceDetectEnabled: true,
      makeup,
    });
  }

  applyLiveBeautyPreset(preset = "natural") {
    const normalized = String(preset).trim().toLowerCase();

    if (normalized === "off" || normalized === "none" || normalized === "clear") {
      this.clearVideoEffects();
      return;
    }

    if (normalized === "glam" || normalized === "makeup") {
      this.setVideoEffects(createGlamBeautyEffects());
      return;
    }

    if (normalized === "sticker" || normalized === "cute") {
      this.setVideoEffects({
        ...createNaturalBeautyEffects(),
        sticker: "crown",
      });
      return;
    }

    this.setVideoEffects(createNaturalBeautyEffects());
  }

  clearVideoEffects() {
    this.videoEffects = createDefaultVideoEffects();
    this.socket?.emit("video:effects", this.videoEffects);
    this.emitMediaState();
    this.emitSdkEvent("local-video-effects", this.videoEffects);
  }

  sendMessage({ text, message, content, replyToMessageId, metadata = {} } = {}) {
    return this.emitWithAck("message:send", {
      kind: "message",
      text: text ?? message ?? content ?? "",
      replyToMessageId,
      metadata,
    });
  }

  replyToMessage(messageId, { text, message, content, metadata = {} } = {}) {
    return this.sendMessage({
      text: text ?? message ?? content ?? "",
      replyToMessageId: messageId,
      metadata,
    });
  }

  sendComment({ text, comment, replyToMessageId, metadata = {} } = {}) {
    return this.emitWithAck("comment:send", {
      text: text ?? comment ?? "",
      replyToMessageId,
      metadata,
    });
  }

  replyToComment(messageId, { text, comment, metadata = {} } = {}) {
    return this.sendComment({
      text: text ?? comment ?? "",
      replyToMessageId: messageId,
      metadata,
    });
  }

  sendVoiceMessage({
    mediaUrl,
    url,
    durationSeconds = 0,
    mimeType = "audio/webm",
    replyToMessageId,
    metadata = {},
  } = {}) {
    return this.emitWithAck("message:send", {
      kind: "voice",
      mediaUrl: mediaUrl ?? url,
      durationSeconds,
      mimeType,
      replyToMessageId,
      metadata,
    });
  }

  sendImageMessage({
    mediaUrl,
    url,
    caption = "",
    mimeType,
    replyToMessageId,
    metadata = {},
  } = {}) {
    return this.emitWithAck("message:send", {
      kind: "image",
      text: caption,
      mediaUrl: mediaUrl ?? url,
      mimeType,
      replyToMessageId,
      metadata,
    });
  }

  listMessages({ limit = 50 } = {}) {
    return this.emitWithAck("message:list", { limit });
  }

  unsendMessage(messageId) {
    this.socket?.emit("message:unsend", { messageId });
  }

  deleteMessage(messageId, { forMe = false } = {}) {
    this.socket?.emit("message:delete", { messageId, forMe });
  }

  sendGift({
    giftId,
    name,
    assetUrl,
    assetType,
    quantity = 1,
    receiverUserId,
    metadata = {},
  } = {}) {
    return this.emitWithAck("gift:send", {
      giftId,
      name,
      assetUrl,
      assetType,
      quantity,
      receiverUserId,
      metadata,
    });
  }

  updateRoomProfile({ name, profilePictureUrl } = {}) {
    this.socket?.emit("room:profile:update", { name, profilePictureUrl });
  }

  updateRoomSettings(settings = {}) {
    this.socket?.emit("room:settings:update", settings);
  }

  updateRoomMicAmount(maxMicCount) {
    this.updateRoomSettings({ maxMicCount });
  }

  setPrivateRoomPassword(password) {
    this.updateRoomSettings({ privacyType: "private", password });
  }

  clearPrivateRoomPassword() {
    this.updateRoomSettings({ privacyType: "public", clearPassword: true });
  }

  setRoomTheme(theme = {}) {
    this.socket?.emit("room:theme:update", { theme });
  }

  setRoomAnnouncement(text, { pinned = true } = {}) {
    this.socket?.emit("room:announcement:update", { text, pinned });
  }

  updateRoomAdmins({ admins = [], superAdmins = [] } = {}) {
    this.socket?.emit("room:admins:update", { admins, superAdmins });
  }

  kickUserFromRoom({
    targetUserId,
    targetSocketId,
    reason,
    permanent = false,
    durationSeconds = 0,
    metadata = {},
  } = {}) {
    this.socket?.emit("room:kick", {
      targetUserId,
      targetSocketId,
      reason,
      permanent,
      durationSeconds,
      metadata,
    });
  }

  listKickHistory() {
    return this.emitWithAck("room:kick:history:list", {});
  }

  editKickHistory(id, updates = {}) {
    this.socket?.emit("room:kick:history:update", { id, ...updates });
  }

  cleanComments({ targetUserId } = {}) {
    this.socket?.emit("room:comments:clean", { targetUserId });
  }

  muteUserMic({ targetUserId, targetSocketId, enabled = false } = {}) {
    this.socket?.emit("participant:mic:mute", { targetUserId, targetSocketId, enabled });
  }

  setChatBan({
    targetUserId,
    enabled = true,
    reason,
    permanent = false,
    durationSeconds = 0,
    metadata = {},
  } = {}) {
    this.socket?.emit("chat:ban", {
      targetUserId,
      enabled,
      reason,
      permanent,
      durationSeconds,
      metadata,
    });
  }

  listChatBanHistory() {
    return this.emitWithAck("chat:ban:history:list", {});
  }

  editChatBanHistory(id, updates = {}) {
    this.socket?.emit("chat:ban:history:update", { id, ...updates });
  }

  setRoomEntryNotificationEnabled(enabled) {
    this.updateRoomSettings({ entryNotificationsEnabled: enabled });
  }

  likeRoom() {
    this.socket?.emit("room:like", {});
  }

  shareRoom({ target } = {}) {
    this.socket?.emit("room:share", { target });
  }

  blockUser({ blockedUserId, targetUserId, reason, metadata = {} } = {}) {
    this.socket?.emit("user:block", {
      blockedUserId: blockedUserId ?? targetUserId,
      reason,
      metadata,
    });
  }

  unblockUser({ blockedUserId, targetUserId, reason, metadata = {} } = {}) {
    this.socket?.emit("user:unblock", {
      blockedUserId: blockedUserId ?? targetUserId,
      reason,
      metadata,
    });
  }

  listBlockedUsers() {
    return this.emitWithAck("user:block:list", {});
  }

  checkSecurity({ text, message, content, category = "text" } = {}) {
    return new Promise((resolve) => {
      this.socket?.emit(
        "security:check",
        {
          text: text ?? message ?? content ?? "",
          category,
        },
        resolve,
      );
    });
  }

  reportSecurityIncident({
    category = "manual_report",
    message = "Security report",
    targetUserId,
    severity,
    blocked,
    metadata,
  } = {}) {
    this.socket?.emit("security:report", {
      category,
      message,
      targetUserId,
      severity,
      blocked,
      metadata,
    });
  }

  closePeerConnection(peerId) {
    if (!peerId) {
      this.closePeerConnections();
      return;
    }

    const peerConnection = this.peerConnections.get(peerId);

    peerConnection?.close();
    this.peerConnections.delete(peerId);
    this.remoteStreams.delete(peerId);
    this.pendingCandidatesByPeer.delete(peerId);

    if (this.remoteVideo && this.remotePeerId === peerId) {
      this.remoteVideo.srcObject = null;
    }

    if (this.remotePeerId === peerId) {
      const nextPeerId = this.peerConnections.keys().next().value;
      this.remotePeerId = nextPeerId ?? null;
      this.peerConnection = nextPeerId ? this.peerConnections.get(nextPeerId) : null;
      this.remoteStream = nextPeerId ? this.remoteStreams.get(nextPeerId) : null;
    }
  }

  closePeerConnections() {
    if (this.remoteVideo) {
      this.remoteVideo.srcObject = null;
    }

    this.peerConnections.forEach((peerConnection) => peerConnection.close());
    this.peerConnections.clear();
    this.remoteStreams.clear();
    this.pendingCandidatesByPeer.clear();
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

  getConnectionIndicator() {
    return this.connectionIndicatorDetail;
  }

  updateConnectionIndicator(indicator, detail = {}) {
    if (!indicator) {
      return;
    }

    const payload = {
      ...detail,
      indicator,
      state: indicator,
      status: indicator,
      roomId: detail.roomId ?? this.currentRoomId,
      socketId: this.socket?.id ?? null,
      updatedAt: new Date().toISOString(),
    };

    this.connectionIndicator = indicator;
    this.connectionIndicatorDetail = payload;
    this.emitSdkEvent("rtc-connection-indicator", payload);
    this.emitSdkEvent("connection-indicator", payload);
  }

  emitMediaState() {
    const state = {
      micEnabled: this.isMicEnabled,
      cameraEnabled: this.isCameraEnabled,
      noiseCancellationEnabled: this.isNoiseCancellationEnabled,
      screenShareEnabled: this.isScreenSharing,
      videoEffects: this.videoEffects,
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

  async replaceOutgoingVideoTrack(nextVideoTrack) {
    const [oldVideoTrack] = this.localStream?.getVideoTracks() ?? [];
    const senders = Array.from(this.peerConnections.values())
      .map((peerConnection) => peerConnection.getSenders().find((item) => item.track?.kind === "video"))
      .filter(Boolean);

    await Promise.all(senders.map((sender) => sender.replaceTrack(nextVideoTrack)));

    oldVideoTrack?.stop();
    this.replaceTrackInLocalStream(oldVideoTrack, nextVideoTrack);

    if (this.localVideo) {
      this.localVideo.srcObject = this.localStream;
    }
  }

  emitScreenShareState(enabled) {
    this.socket?.emit("screen:state", {
      enabled,
      screenShareEnabled: enabled,
    });
    this.emitMediaState();
  }

  getPendingCandidates(peerId) {
    if (!this.pendingCandidatesByPeer.has(peerId)) {
      this.pendingCandidatesByPeer.set(peerId, []);
    }

    return this.pendingCandidatesByPeer.get(peerId);
  }

  emitSdkEvent(eventName, detail = {}) {
    this.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  emitWithAck(eventName, payload = {}, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("RTC socket is not connected"));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error(`${eventName} timed out`));
      }, timeoutMs);

      this.socket.emit(eventName, payload, (result) => {
        clearTimeout(timeout);
        resolve(result);
      });
    });
  }
}

function getClientHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
  };
}

function getAdminHeaders(adminKey) {
  return {
    Authorization: `Bearer ${adminKey}`,
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

function getIndicatorForPeerState(peerState) {
  if (peerState === "connected") {
    return RTC_CONNECTION_INDICATORS.PEER_CONNECTED;
  }

  if (peerState === "connecting" || peerState === "new") {
    return RTC_CONNECTION_INDICATORS.PEER_CONNECTING;
  }

  if (peerState === "failed") {
    return RTC_CONNECTION_INDICATORS.FAILED;
  }

  if (peerState === "disconnected") {
    return RTC_CONNECTION_INDICATORS.RECONNECTING;
  }

  return RTC_CONNECTION_INDICATORS.IN_ROOM;
}

function getDefaultPermissionsForMode(rtcMode, cameraEnabled = !isAudioOnlyMode(rtcMode)) {
  if (isYoutubeMode(rtcMode)) {
    return RTC_YOUTUBE_ROOM_PERMISSIONS;
  }

  if (isLiveMode(rtcMode)) {
    return RTC_LIVE_VIDEO_PERMISSIONS;
  }

  if (isScreenShareMode(rtcMode)) {
    return RTC_SCREEN_SHARE_PERMISSIONS;
  }

  if (cameraEnabled && !isAudioOnlyMode(rtcMode)) {
    return RTC_VIDEO_ROOM_PERMISSIONS;
  }

  return RTC_AUDIO_ROOM_PERMISSIONS;
}

function isAudioOnlyMode(rtcMode) {
  const normalized = String(rtcMode ?? "").trim().toLowerCase();
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

function isYoutubeMode(rtcMode) {
  const normalized = String(rtcMode ?? "").trim().toLowerCase();
  return normalized === "youtube" || normalized === "youtube_room";
}

function isLiveMode(rtcMode) {
  const normalized = String(rtcMode ?? "").trim().toLowerCase();
  return normalized === "solo_live"
    || normalized === "solo_video_live"
    || normalized === "live_pk"
    || normalized === "live_video_pk";
}

function isScreenShareMode(rtcMode) {
  const normalized = String(rtcMode ?? "").trim().toLowerCase();
  return normalized === "screen_share" || normalized === "screen";
}

export function createDefaultVideoEffects() {
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

export function createNaturalBeautyEffects() {
  return {
    filter: "soft",
    aiFilter: "portrait",
    sticker: "",
    faceDetectEnabled: true,
    beautyEnabled: true,
    beautyLevel: 65,
    smoothingLevel: 55,
    whiteningLevel: 35,
    eyeLevel: 20,
    faceSlimLevel: 20,
    makeup: {},
  };
}

export function createGlamBeautyEffects() {
  return {
    filter: "glow",
    aiFilter: "portrait",
    sticker: "",
    faceDetectEnabled: true,
    beautyEnabled: true,
    beautyLevel: 75,
    smoothingLevel: 65,
    whiteningLevel: 45,
    eyeLevel: 35,
    faceSlimLevel: 30,
    makeup: {
      lipstick: "rose",
      blush: "peach",
      contour: "soft",
    },
  };
}

function normalizeVideoEffects(effects = {}) {
  const normalized = {};

  if ("filter" in effects) {
    normalized.filter = effects.filter || "none";
  }

  if ("aiFilter" in effects || "ai_filter" in effects) {
    normalized.aiFilter = effects.aiFilter || effects.ai_filter || "none";
  }

  if ("sticker" in effects) {
    normalized.sticker = effects.sticker ?? "";
  }

  if ("faceDetectEnabled" in effects || "face_detect_enabled" in effects) {
    normalized.faceDetectEnabled = Boolean(
      effects.faceDetectEnabled ?? effects.face_detect_enabled,
    );
  }

  if ("beautyEnabled" in effects || "beauty_enabled" in effects) {
    normalized.beautyEnabled = Boolean(effects.beautyEnabled ?? effects.beauty_enabled);
  }

  [
    "beautyLevel",
    "smoothingLevel",
    "whiteningLevel",
    "eyeLevel",
    "faceSlimLevel",
  ].forEach((key) => {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    const value = effects[key] ?? effects[snakeKey];

    if (value !== undefined) {
      normalized[key] = clampEffectLevel(value);
    }
  });

  if ("makeup" in effects) {
    normalized.makeup = isPlainObject(effects.makeup) ? { ...effects.makeup } : {};
  }

  return normalized;
}

function clampEffectLevel(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getAudioProcessingEnabled(mediaConstraints) {
  if (mediaConstraints?.audio && typeof mediaConstraints.audio === "object") {
    return mediaConstraints.audio.noiseSuppression !== false;
  }

  return mediaConstraints?.audio !== false;
}

function withNoiseCancellation(mediaConstraints, enabled) {
  const nextConstraints = {
    ...mediaConstraints,
  };

  if (nextConstraints.audio !== false) {
    const audioConstraints =
      nextConstraints.audio && typeof nextConstraints.audio === "object"
        ? nextConstraints.audio
        : {};

    nextConstraints.audio = {
      ...audioConstraints,
      noiseSuppression: enabled,
      echoCancellation: true,
      autoGainControl: true,
    };
  }

  return nextConstraints;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "Something went wrong";
}
