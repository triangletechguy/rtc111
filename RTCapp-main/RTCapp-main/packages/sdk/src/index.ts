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
export { RtcClient, createDefaultVideoEffects,
         createNaturalBeautyEffects,
         createGlamBeautyEffects }                    from './rtc/RtcClient';
export { useRtcClient }                               from './rtc/useRtcClient';
export type { Channel, Participant, Session, ApiKey,
              ChannelType, ChannelStatus,
              ParticipantRole, ConnectionState,
              MediaType }                             from './types';
export type { RtcClientConfig, RtcSessionInfo,
              RtcRoomMode, RtcVideoEffects,
              RtcJoinOptions, RtcEventMap }            from './rtc/RtcClient';
export type { UseRtcClientResult }                     from './rtc/useRtcClient';
