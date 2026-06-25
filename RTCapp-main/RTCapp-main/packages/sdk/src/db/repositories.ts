/**
 * db/repositories.ts
 * FIX #6, #7: .query() returns QueryObservable, NOT a Promise.
 *   Must call .query().fetch() to get Promise<Model[]>.
 *   .query().then() hangs silently — changed to .fetch().then() or await .fetch().
 * FIX #8: import models as values (not `type`) so generics work at runtime.
 */

import { getDatabase } from './database';
import type { Database } from '@nozbe/watermelondb';
import {
  ChannelModel,
  ParticipantModel,
  SessionModel,
  ApiKeyModel,
} from '../models';

// ─── ChannelRepository ───────────────────────────────────────────────────────

export class ChannelRepository {
  private db: Database;

  constructor() {
    this.db = getDatabase();
  }

  async findOrCreate(channelId: string): Promise<ChannelModel> {
    const collection = this.db.collections.get<ChannelModel>('channels');

    // FIX #6: was .query().then(...) — must be .query().fetch() to get a Promise
    const rows = await collection.query().fetch();
    const existing = rows.find((r) => r.channelId === channelId);
    if (existing) return existing;

    return this.db.write(async () =>
      collection.create((record) => {
        record.channelId = channelId;
      })
    );
  }

  async findById(id: string): Promise<ChannelModel | null> {
    try {
      return await this.db.collections.get<ChannelModel>('channels').find(id);
    } catch {
      return null;
    }
  }

  async all(): Promise<ChannelModel[]> {
    return this.db.collections.get<ChannelModel>('channels').query().fetch();
  }
}

// ─── SessionRepository ───────────────────────────────────────────────────────

type CreateSessionParams = {
  channelId: string;
  uid: string;
  startedAt: Date;
  status: string;
  apiKeyId: string;
};

type UpdateSessionParams = Partial<{
  status: string;
  endedAt: Date;
}>;

export class SessionRepository {
  private db: Database;

  constructor() {
    this.db = getDatabase();
  }

  async create(params: CreateSessionParams): Promise<SessionModel> {
    const collection = this.db.collections.get<SessionModel>('sessions');
    return this.db.write(async () =>
      collection.create((record) => {
        record.channelId = params.channelId;
        record.uid = params.uid;
        record.startedAt = params.startedAt;
        record.status = params.status;
        record.apiKeyId = params.apiKeyId;
      })
    );
  }

  async update(id: string, params: UpdateSessionParams): Promise<void> {
    const collection = this.db.collections.get<SessionModel>('sessions');
    const record = await collection.find(id);
    await this.db.write(async () =>
      record.update((r) => {
        if (params.status !== undefined) r.status = params.status!;
        if (params.endedAt !== undefined) r.endedAt = params.endedAt!;
      })
    );
  }

  async findById(id: string): Promise<SessionModel | null> {
    try {
      return await this.db.collections.get<SessionModel>('sessions').find(id);
    } catch {
      return null;
    }
  }

  async allForChannel(channelId: string): Promise<SessionModel[]> {
    // FIX #7: was .query().then() — must be .query().fetch().then() or await .fetch()
    const rows = await this.db.collections.get<SessionModel>('sessions').query().fetch();
    return rows.filter((r) => r.channelId === channelId);
  }
}

// ─── ParticipantRepository ───────────────────────────────────────────────────

export class ParticipantRepository {
  private db: Database;

  constructor() {
    this.db = getDatabase();
  }

  async create(channelId: string, uid: string): Promise<ParticipantModel> {
    const collection = this.db.collections.get<ParticipantModel>('participants');
    return this.db.write(async () =>
      collection.create((record) => {
        record.channelId = channelId;
        record.uid = uid;
        record.joinedAt = new Date();
      })
    );
  }

  async markLeft(id: string): Promise<void> {
    const collection = this.db.collections.get<ParticipantModel>('participants');
    const record = await collection.find(id);
    const now = new Date();
    await this.db.write(async () =>
      record.update((r) => {
        r.leftAt = now;
        r.durationSeconds = Math.round(
          (now.getTime() - r.joinedAt.getTime()) / 1000
        );
      })
    );
  }

  async allForChannel(channelId: string): Promise<ParticipantModel[]> {
    // FIX #7: .query().fetch() not .query().then()
    const rows = await this.db.collections.get<ParticipantModel>('participants').query().fetch();
    return rows.filter((r) => r.channelId === channelId);
  }
}

// ─── ApiKeyRepository ────────────────────────────────────────────────────────

export class ApiKeyRepository {
  private db: Database;

  constructor() {
    this.db = getDatabase();
  }

  async create(keyHash: string, name: string): Promise<ApiKeyModel> {
    const collection = this.db.collections.get<ApiKeyModel>('api_keys');
    return this.db.write(async () =>
      collection.create((record) => {
        record.keyHash = keyHash;
        record.name = name;
        record.isActive = true;
      })
    );
  }

  async findByHash(keyHash: string): Promise<ApiKeyModel | null> {
    // Already used .fetch() correctly — no change needed
    const all = await this.db.collections.get<ApiKeyModel>('api_keys').query().fetch();
    return all.find((r) => r.keyHash === keyHash) ?? null;
  }

  async updateJwt(id: string, jwt: string, refreshToken?: string): Promise<void> {
    const record = await this.db.collections.get<ApiKeyModel>('api_keys').find(id);
    await this.db.write(async () =>
      record.update((r) => {
        r.jwt = jwt;
        if (refreshToken) r.refreshToken = refreshToken;
      })
    );
  }

  async deactivate(id: string): Promise<void> {
    const record = await this.db.collections.get<ApiKeyModel>('api_keys').find(id);
    await this.db.write(async () =>
      record.update((r) => {
        r.isActive = false;
      })
    );
  }
}
