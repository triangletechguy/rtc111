/**
 * models/index.ts
 * FIX: WatermelonDB v0.27 does NOT export `text` from decorators.
 * Use `field` for all string columns. `@text` → `@field`.
 * `nochange` is also not in v0.27 decorators — replaced with `readonly`
 * for key_hash and channel_id where we want immutability enforced at model level.
 */

import { Model } from '@nozbe/watermelondb';
import {
  field,
  date,
  readonly,
} from '@nozbe/watermelondb/decorators';

export class ChannelModel extends Model {
  static table = 'channels';

  // FIX: @text → @field (text not exported in WatermelonDB v0.27)
  @readonly @field('channel_id') channelId!: string;
  @readonly @date('created_at') createdAt!: Date;
}

export class ParticipantModel extends Model {
  static table = 'participants';

  @field('channel_id') channelId!: string;
  @field('uid') uid!: string;
  @date('joined_at') joinedAt!: Date;
  @date('left_at') leftAt!: Date | null;
  @field('duration_seconds') durationSeconds!: number | null;
}

export class SessionModel extends Model {
  static table = 'sessions';

  @field('channel_id') channelId!: string;
  @field('uid') uid!: string;
  @date('started_at') startedAt!: Date;
  @date('ended_at') endedAt!: Date | null;
  @field('status') status!: string;          // joining | active | ended | error
  @field('api_key_id') apiKeyId!: string;
}

export class ApiKeyModel extends Model {
  static table = 'api_keys';

  @readonly @field('key_hash') keyHash!: string;
  @field('name') name!: string;
  @readonly @date('created_at') createdAt!: Date;
  @date('expires_at') expiresAt!: Date | null;
  @field('is_active') isActive!: boolean;
  @field('jwt') jwt!: string | null;
  @field('refresh_token') refreshToken!: string | null;
}
