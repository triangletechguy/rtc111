// ─────────────────────────────────────────────────────────────
//  Core SDK Types  —  Week 1–2: Schema Definition
// ─────────────────────────────────────────────────────────────

export type ChannelType   = 'voice' | 'video';
export type ChannelStatus = 'active' | 'ended';
export type ParticipantRole        = 'publisher' | 'subscriber' | 'both';
export type ConnectionState        = 'connected' | 'disconnected' | 'reconnecting';
export type MediaType              = 'voice' | 'video';

// ── Channel ──────────────────────────────────────────────────
export interface Channel {
  id:         number;           // local auto-increment PK
  channelId:  string;           // server UUID
  projectId:  string;
  name:       string;
  type:       ChannelType;
  status:     ChannelStatus;
  createdAt:  number;           // unix ms
  endedAt:    number | null;
  metadata:   string | null;    // raw JSON blob
}

// ── Participant ───────────────────────────────────────────────
export interface Participant {
  id:              number;
  channelId:       string;
  userId:          string;
  displayName:     string | null;
  role:            ParticipantRole;
  isAudioMuted:    boolean;
  isVideoMuted:    boolean;
  connectionState: ConnectionState;
  joinedAt:        number;
  leftAt:          number | null;
}

// ── Session (CDR) ─────────────────────────────────────────────
export interface Session {
  id:              number;
  sessionId:       string;      // client UUID
  channelId:       string;
  userId:          string;
  projectId:       string;
  mediaType:       MediaType;
  startedAt:       number;
  endedAt:         number | null;
  durationSeconds: number | null;
  bytesSent:       number;
  bytesReceived:   number;
  region:          string;
  synced:          boolean;     // flushed to server?
  createdAt:       number;
}

// ── ApiKey (local credential store) ──────────────────────────
export interface ApiKey {
  id:              number;
  projectId:       string;
  apiKeyEncrypted: string;      // encrypted via SecureStore
  jwtToken:        string | null;
  jwtExpiresAt:    number | null;
  refreshToken:    string | null;
  createdAt:       number;
  lastUsedAt:      number | null;
}
