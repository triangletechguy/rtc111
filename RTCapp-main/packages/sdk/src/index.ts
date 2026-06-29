// ─────────────────────────────────────────────────────────────
//  SDK Public API  —  Week 1–2 exports
// ─────────────────────────────────────────────────────────────

export { getDatabase }                                from './db/database';
export { schema, DB_SCHEMA_VERSION }                  from './db/schema';
export { migrations }                                 from '../migrations';
export { ChannelRepository, ParticipantRepository,
         SessionRepository, ApiKeyRepository }        from './db/repositories';
export { ChannelModel, ParticipantModel,
         SessionModel, ApiKeyModel }                  from './models';
export type { Channel, Participant, Session, ApiKey,
              ChannelType, ChannelStatus,
              ParticipantRole, ConnectionState,
              MediaType }                             from './types';
