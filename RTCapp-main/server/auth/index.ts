// packages/sdk/src/index.ts
// Public SDK surface — LiveKit-backed RTC

export { getDatabase }          from './db/database';
export { migrations }           from '../../migrations';
export type { RtcClientConfig, RtcSessionInfo, RtcEventMap } from './rtc/RtcClient';
export { RtcClient }            from './rtc/RtcClient';
export { useRtcClient }         from './rtc/useRtcClient';
export { requestAudioPermissions, checkAudioPermissions } from './rtc/permissions';
export { ChannelRepository, SessionRepository, ApiKeyRepository, ParticipantRepository } from './db/repositories';
export type { Channel, Session, ApiKey, Participant } from './types';
