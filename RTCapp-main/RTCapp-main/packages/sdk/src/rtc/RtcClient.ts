import {
  Room,
  RoomEvent,
  RemoteParticipant,
  LocalParticipant,
  ConnectionState,
  RoomOptions,
  VideoPresets,
  Participant,
} from 'livekit-client';

import { Platform } from 'react-native';
import { ChannelRepository, SessionRepository } from '../db/repositories';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RtcClientConfig {
  /** Your auth server base URL e.g. http://10.0.2.2:3001 */
  authServerUrl: string;
  /** app_id from your platform API key */
  appId: string;
  /** SDK JWT — get this from TokenManager first */
  sdkToken: string;
  /** audio | video | video_call | group_video | solo_live | live_pk — defaults to audio */
  mode?: RtcRoomMode;
}

export interface RtcSessionInfo {
  channelId: string;
  uid:       string;
  startedAt: number;
  mode:      RtcRoomMode;
}

export type RtcRoomMode =
  | 'audio'
  | 'voice'
  | 'voice_call'
  | 'group_voice'
  | 'video'
  | 'video_call'
  | 'group_video'
  | 'solo_live'
  | 'live_pk';

export interface RtcVideoEffects {
  filter?: string;
  aiFilter?: string;
  sticker?: string;
  faceDetectEnabled?: boolean;
  beautyEnabled?: boolean;
  beautyLevel?: number;
  smoothingLevel?: number;
  whiteningLevel?: number;
  eyeLevel?: number;
  faceSlimLevel?: number;
  makeup?: Record<string, unknown>;
}

export interface RtcJoinOptions {
  mode?: RtcRoomMode;
  videoEffects?: RtcVideoEffects;
}

export type RtcEventMap = {
  join:                   (session: RtcSessionInfo) => void;
  leave:                  (channelId: string) => void;
  remoteUserJoined:       (uid: string) => void;
  remoteUserLeft:         (uid: string) => void;
  activeSpeakersChanged:  (uids: string[]) => void;
  connectionStateChanged: (state: string) => void;
  screenShareChanged:     (enabled: boolean) => void;
  videoEffectsChanged:    (uid: string, effects: RtcVideoEffects) => void;
  error:                  (err: Error) => void;
};

// ── RtcClient ─────────────────────────────────────────────────────────────────

export class RtcClient {
  private room:       Room;
  private config:     RtcClientConfig;
  private session:    RtcSessionInfo | null = null;
  private listeners:  Map<string, Set<Function>> = new Map();
  private mode:       RtcRoomMode;
  private videoEffects: RtcVideoEffects = createDefaultVideoEffects();

  private channelRepo: ChannelRepository;
  private sessionRepo: SessionRepository;

  private constructor(config: RtcClientConfig) {
    this.config = config;
    this.mode = config.mode ?? 'audio';

    this.channelRepo = new ChannelRepository();
    this.sessionRepo = new SessionRepository();

    const options: RoomOptions = {
      adaptiveStream:   true,
      dynacast:         true,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
    };

    if (isVideoMode(this.mode)) {
      options.videoCaptureDefaults = { resolution: VideoPresets.h720.resolution };
    }

    this.room = new Room(options);
    this._bindRoomEvents();
  }

  // ── Factory ────────────────────────────────────────────────────────────────

  static create(config: RtcClientConfig): RtcClient {
    if (Platform.OS !== 'android') {
      throw new Error('RtcClient is only supported on Android');
    }
    return new RtcClient(config);
  }

  // ── Join ───────────────────────────────────────────────────────────────────

  async join(channelId: string, identity?: string, options: RtcJoinOptions = {}): Promise<RtcSessionInfo> {
    const mode = options.mode ?? this.mode;
    this.mode = mode;

    if (options.videoEffects) {
      this.videoEffects = normalizeVideoEffects({
        ...this.videoEffects,
        ...options.videoEffects,
      });
    }

    // 1. Get a LiveKit token from your auth server
    const uid = identity ?? `user_${Date.now()}`;
    const { token, url } = await this._fetchLiveKitToken(channelId, uid, mode);

    // 2. Connect to LiveKit cloud
    await this.room.connect(url, token);

    // 3. Publish audio (always)
    await this.room.localParticipant.setMicrophoneEnabled(true);

    // 4. Publish video if in video mode
    if (isVideoMode(mode)) {
      await this.room.localParticipant.setCameraEnabled(true);
    }

    await this._syncRtcMetadata().catch((err) => this._emit('error', err));

    // 5. Persist to WatermelonDB
    const channel = await this.channelRepo.findOrCreate(channelId);
    const startedAt = new Date();

    await this.sessionRepo.create({
      channelId: channel.id,
      uid,
      startedAt,
      status:   'active',
      apiKeyId: this.config.appId,
    });

    this.session = { channelId, uid, startedAt: startedAt.getTime(), mode };
    this._emit('join', this.session);
    return this.session;
  }

  async joinVideoCall(
    channelId: string,
    identity?: string,
    videoEffects: RtcVideoEffects = createNaturalBeautyEffects(),
  ): Promise<RtcSessionInfo> {
    return this.join(channelId, identity, { mode: 'video_call', videoEffects });
  }

  async joinOneToOneVideoCall(
    channelId: string,
    identity?: string,
    videoEffects: RtcVideoEffects = createNaturalBeautyEffects(),
  ): Promise<RtcSessionInfo> {
    return this.joinVideoCall(channelId, identity, videoEffects);
  }

  async joinGroupVideoRoom(
    channelId: string,
    identity?: string,
    videoEffects?: RtcVideoEffects,
  ): Promise<RtcSessionInfo> {
    return this.join(channelId, identity, { mode: 'group_video', videoEffects });
  }

  async joinSoloVideoLive(
    channelId: string,
    identity?: string,
    videoEffects: RtcVideoEffects = createNaturalBeautyEffects(),
  ): Promise<RtcSessionInfo> {
    return this.join(channelId, identity, { mode: 'solo_live', videoEffects });
  }

  async joinLivePkRoom(
    channelId: string,
    identity?: string,
    videoEffects: RtcVideoEffects = createNaturalBeautyEffects(),
  ): Promise<RtcSessionInfo> {
    return this.join(channelId, identity, { mode: 'live_pk', videoEffects });
  }

  // ── Leave ──────────────────────────────────────────────────────────────────

  async leave(): Promise<void> {
    if (!this.session) return;

    await this.room.disconnect();

    // Mark session ended in WatermelonDB
    const sessions = await this.sessionRepo.allForChannel(this.session.channelId);
    const active   = sessions.find(s => s.uid === this.session!.uid && !s.endedAt);
    if (active) {
      await this.sessionRepo.update(active.id, {
        status:  'ended',
        endedAt: new Date(),
      });
    }

    const channelId = this.session.channelId;
    this.session    = null;
    this._emit('leave', channelId);
  }

  // ── Destroy ────────────────────────────────────────────────────────────────

  async destroy(): Promise<void> {
    await this.leave();
    this.listeners.clear();
  }

  // ── Audio controls ─────────────────────────────────────────────────────────

  async setAudioMuted(muted: boolean): Promise<void> {
    await this.room.localParticipant.setMicrophoneEnabled(!muted);
  }

  async toggleAudioMute(): Promise<boolean> {
    const mic = this.room.localParticipant.isMicrophoneEnabled;
    await this.room.localParticipant.setMicrophoneEnabled(!mic);
    return !mic; // returns new muted state (true = now muted)
  }

  get isMuted(): boolean {
    return !this.room.localParticipant.isMicrophoneEnabled;
  }

  // ── Video controls ─────────────────────────────────────────────────────────

  async setCameraEnabled(enabled: boolean): Promise<void> {
    await this.room.localParticipant.setCameraEnabled(enabled);
  }

  async toggleCamera(): Promise<boolean> {
    const cam = this.room.localParticipant.isCameraEnabled;
    await this.room.localParticipant.setCameraEnabled(!cam);
    return !cam;
  }

  get isCameraEnabled(): boolean {
    return this.room.localParticipant.isCameraEnabled;
  }

  // ── Screen share ──────────────────────────────────────────────────────────

  async startScreenShare(
    options?: Parameters<LocalParticipant['setScreenShareEnabled']>[1],
  ): Promise<void> {
    await this.setScreenShareEnabled(true, options);
  }

  async stopScreenShare(): Promise<void> {
    await this.setScreenShareEnabled(false);
  }

  async setScreenShareEnabled(
    enabled: boolean,
    options?: Parameters<LocalParticipant['setScreenShareEnabled']>[1],
  ): Promise<void> {
    await this.room.localParticipant.setScreenShareEnabled(enabled, options);
    this._emit('screenShareChanged', enabled);
  }

  get isScreenSharing(): boolean {
    return this.room.localParticipant.isScreenShareEnabled;
  }

  // ── Video effects state ───────────────────────────────────────────────────

  async setVideoEffects(effects: RtcVideoEffects): Promise<RtcVideoEffects> {
    this.videoEffects = normalizeVideoEffects({
      ...this.videoEffects,
      ...effects,
    });

    if (this.isConnected) {
      await this._syncRtcMetadata();
    }

    const uid = this.room.localParticipant.identity;
    this._emit('videoEffectsChanged', uid, this.videoEffects);
    return this.videoEffects;
  }

  async setVideoFilter(filter: string): Promise<RtcVideoEffects> {
    return this.setVideoEffects({ filter: filter || 'none' });
  }

  async setAiFilter(aiFilter: string): Promise<RtcVideoEffects> {
    return this.setVideoEffects({ aiFilter: aiFilter || 'none' });
  }

  async setSticker(sticker: string): Promise<RtcVideoEffects> {
    return this.setVideoEffects({ sticker });
  }

  async setFaceDetectEnabled(enabled: boolean): Promise<RtcVideoEffects> {
    return this.setVideoEffects({ faceDetectEnabled: enabled });
  }

  async setBeautyLevels(effects: RtcVideoEffects = createNaturalBeautyEffects()): Promise<RtcVideoEffects> {
    return this.setVideoEffects({
      beautyEnabled: true,
      faceDetectEnabled: true,
      ...effects,
    });
  }

  async setBeautyMakeup(makeup: Record<string, unknown>): Promise<RtcVideoEffects> {
    return this.setVideoEffects({
      beautyEnabled: true,
      faceDetectEnabled: true,
      makeup,
    });
  }

  async clearVideoEffects(): Promise<RtcVideoEffects> {
    this.videoEffects = createDefaultVideoEffects();

    if (this.isConnected) {
      await this._syncRtcMetadata();
    }

    this._emit('videoEffectsChanged', this.room.localParticipant.identity, this.videoEffects);
    return this.videoEffects;
  }

  get currentVideoEffects(): RtcVideoEffects {
    return { ...this.videoEffects, makeup: { ...(this.videoEffects.makeup ?? {}) } };
  }

  // ── Participants ───────────────────────────────────────────────────────────

  get remoteParticipants(): RemoteParticipant[] {
    return Array.from(this.room.remoteParticipants.values());
  }

  get remoteUids(): string[] {
    return this.remoteParticipants.map(p => p.identity);
  }

  get localParticipant(): LocalParticipant {
    return this.room.localParticipant;
  }

  // Expose the raw Room for video rendering (VideoView needs it)
  get rawRoom(): Room {
    return this.room;
  }

  get currentSession(): RtcSessionInfo | null {
    return this.session;
  }

  get isConnected(): boolean {
    return this.room.state === ConnectionState.Connected;
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  on<K extends keyof RtcEventMap>(event: K, listener: RtcEventMap[K]): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }

  off<K extends keyof RtcEventMap>(event: K, listener: RtcEventMap[K]): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  private _emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach(fn => fn(...args));
  }

  // ── Internal: bind LiveKit room events ────────────────────────────────────

  private _bindRoomEvents() {
    this.room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
      this._emit('remoteUserJoined', p.identity);
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
      this._emit('remoteUserLeft', p.identity);
    });

    this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      this._emit('activeSpeakersChanged', speakers.map(s => s.identity));
    });

    this.room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      this._emit('connectionStateChanged', state);
    });

    this.room.on(RoomEvent.ParticipantMetadataChanged, (_prevMetadata: string | undefined, participant: Participant) => {
      const effects = readVideoEffectsFromParticipant(participant);

      if (effects) {
        this._emit('videoEffectsChanged', participant.identity, effects);
      }
    });

    this.room.on(RoomEvent.Disconnected, () => {
      if (this.session) {
        this._emit('leave', this.session.channelId);
        this.session = null;
      }
    });
  }

  // ── Internal: fetch LiveKit token from auth server ────────────────────────

  private async _fetchLiveKitToken(
    room: string,
    identity: string,
    mode: RtcRoomMode,
  ): Promise<{ token: string; url: string }> {
    const res = await fetch(`${this.config.authServerUrl}/sdk/livekit-token`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.config.sdkToken}`,
      },
      body: JSON.stringify({ room, identity, rtc_mode: mode }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `LiveKit token fetch failed: ${res.status}`);
    }

    return res.json();
  }

  private async _syncRtcMetadata(): Promise<void> {
    const current = parseMetadataObject(this.room.localParticipant.metadata);
    const rtc = isPlainObject(current.rtc) ? current.rtc : {};
    const next = {
      ...current,
      rtc: {
        ...rtc,
        mode: this.mode,
        videoEffects: this.videoEffects,
      },
    };

    await this.room.localParticipant.setMetadata(JSON.stringify(next));
  }
}

export function createDefaultVideoEffects(): RtcVideoEffects {
  return {
    filter: 'none',
    aiFilter: 'none',
    sticker: '',
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

export function createNaturalBeautyEffects(): RtcVideoEffects {
  return {
    filter: 'soft',
    aiFilter: 'portrait',
    sticker: '',
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

export function createGlamBeautyEffects(): RtcVideoEffects {
  return {
    filter: 'glow',
    aiFilter: 'portrait',
    sticker: '',
    faceDetectEnabled: true,
    beautyEnabled: true,
    beautyLevel: 75,
    smoothingLevel: 65,
    whiteningLevel: 45,
    eyeLevel: 35,
    faceSlimLevel: 30,
    makeup: {
      lipstick: 'rose',
      blush: 'peach',
      contour: 'soft',
    },
  };
}

function isVideoMode(mode: RtcRoomMode): boolean {
  return mode === 'video'
    || mode === 'video_call'
    || mode === 'group_video'
    || mode === 'solo_live'
    || mode === 'live_pk';
}

function normalizeVideoEffects(effects: RtcVideoEffects): RtcVideoEffects {
  return {
    filter: effects.filter || 'none',
    aiFilter: effects.aiFilter || 'none',
    sticker: effects.sticker ?? '',
    faceDetectEnabled: Boolean(effects.faceDetectEnabled),
    beautyEnabled: Boolean(effects.beautyEnabled),
    beautyLevel: clampEffectLevel(effects.beautyLevel),
    smoothingLevel: clampEffectLevel(effects.smoothingLevel),
    whiteningLevel: clampEffectLevel(effects.whiteningLevel),
    eyeLevel: clampEffectLevel(effects.eyeLevel),
    faceSlimLevel: clampEffectLevel(effects.faceSlimLevel),
    makeup: isPlainObject(effects.makeup) ? effects.makeup : {},
  };
}

function clampEffectLevel(value: unknown): number {
  const numberValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(100, Math.round(numberValue)));
}

function readVideoEffectsFromParticipant(participant: Participant): RtcVideoEffects | null {
  const metadata = parseMetadataObject(participant.metadata);
  const rtc = isPlainObject(metadata.rtc) ? metadata.rtc : {};
  const effects = isPlainObject(rtc.videoEffects)
    ? rtc.videoEffects
    : isPlainObject(metadata.videoEffects)
      ? metadata.videoEffects
      : null;

  return effects ? normalizeVideoEffects(effects as RtcVideoEffects) : null;
}

function parseMetadataObject(metadata?: string): Record<string, unknown> {
  if (!metadata) {
    return {};
  }

  try {
    const parsed = JSON.parse(metadata);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
