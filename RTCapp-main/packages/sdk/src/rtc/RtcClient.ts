// packages/sdk/src/rtc/RtcClient.ts
// LiveKit-based RTC client.
// Wraps @livekit/react-native with the same public API as the previous RTC client
// so nothing in the UI needs to change.

import {
  Room,
  RoomEvent,
  Track,
  TrackPublication,
  RemoteParticipant,
  LocalParticipant,
  ConnectionState,
  RoomOptions,
  VideoPresets,
  Participant,
} from '@livekit/react-native';

import { Platform } from 'react-native';
import { getDatabase } from '../db/database';
import { ChannelRepository, SessionRepository } from '../db/repositories';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RtcClientConfig {
  /** Your auth server base URL e.g. http://10.0.2.2:3001 */
  authServerUrl: string;
  /** app_id from your platform API key */
  appId: string;
  /** SDK JWT — get this from TokenManager first */
  sdkToken: string;
  /** audio | video — defaults to audio */
  mode?: 'audio' | 'video';
}

export interface RtcSessionInfo {
  channelId: string;
  uid:       string;
  startedAt: number;
}

export type RtcEventMap = {
  join:                   (session: RtcSessionInfo) => void;
  leave:                  (channelId: string) => void;
  remoteUserJoined:       (uid: string) => void;
  remoteUserLeft:         (uid: string) => void;
  activeSpeakersChanged:  (uids: string[]) => void;
  connectionStateChanged: (state: string) => void;
  error:                  (err: Error) => void;
};

// ── RtcClient ─────────────────────────────────────────────────────────────────

export class RtcClient {
  private room:       Room;
  private config:     RtcClientConfig;
  private session:    RtcSessionInfo | null = null;
  private listeners:  Map<string, Set<Function>> = new Map();

  private channelRepo: ChannelRepository;
  private sessionRepo: SessionRepository;

  private constructor(config: RtcClientConfig) {
    this.config = config;

    const db = getDatabase();
    this.channelRepo = new ChannelRepository(db);
    this.sessionRepo = new SessionRepository(db);

    const options: RoomOptions = {
      adaptiveStream:   true,
      dynacast:         true,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
    };

    if (config.mode === 'video') {
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

  async join(channelId: string, identity?: string): Promise<RtcSessionInfo> {
    // 1. Get a LiveKit token from your auth server
    const uid = identity ?? `user_${Date.now()}`;
    const { token, url } = await this._fetchLiveKitToken(channelId, uid);

    // 2. Connect to LiveKit cloud
    await this.room.connect(url, token);

    // 3. Publish audio (always)
    await this.room.localParticipant.setMicrophoneEnabled(true);

    // 4. Publish video if in video mode
    if (this.config.mode === 'video') {
      await this.room.localParticipant.setCameraEnabled(true);
    }

    // 5. Persist to WatermelonDB
    const channel = await this.channelRepo.findOrCreate(channelId);
    const startedAt = Date.now();

    await this.sessionRepo.create({
      channelId: channel.id,
      uid,
      startedAt,
      endedAt:  null,
      synced:   false,
    });

    this.session = { channelId, uid, startedAt };
    this._emit('join', this.session);
    return this.session;
  }

  // ── Leave ──────────────────────────────────────────────────────────────────

  async leave(): Promise<void> {
    if (!this.session) return;

    await this.room.disconnect();

    // Mark session ended in WatermelonDB
    const sessions = await this.sessionRepo.allForChannel(this.session.channelId);
    const active   = sessions.find(s => s.uid === this.session!.uid && !s.endedAt);
    if (active) {
      await this.sessionRepo.markEnded(active.id, Date.now());
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

    this.room.on(RoomEvent.Disconnected, () => {
      if (this.session) {
        this._emit('leave', this.session.channelId);
        this.session = null;
      }
    });
  }

  // ── Internal: fetch LiveKit token from auth server ────────────────────────

  private async _fetchLiveKitToken(room: string, identity: string): Promise<{ token: string; url: string }> {
    const res = await fetch(`${this.config.authServerUrl}/sdk/livekit-token`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.config.sdkToken}`,
      },
      body: JSON.stringify({ room, identity }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `LiveKit token fetch failed: ${res.status}`);
    }

    return res.json();
  }
}
