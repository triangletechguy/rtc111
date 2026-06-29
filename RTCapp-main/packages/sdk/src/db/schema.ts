// ─────────────────────────────────────────────────────────────
//  Database Schema  —  WatermelonDB
//  Week 1–2: Schema v1 definition
// ─────────────────────────────────────────────────────────────
//
//  WatermelonDB is the standard choice for React Native local
//  DB: it's lazy, uses SQLite under the hood on both Android
//  and iOS, and supports full migrations.
//
//  Install:
//    yarn add @nozbe/watermelondb
//    yarn add @nozbe/with-observables   # optional reactive hooks

import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const DB_SCHEMA_VERSION = 1;

export const schema = appSchema({
  version: DB_SCHEMA_VERSION,
  tables: [

    // ── channels ───────────────────────────────────────────
    tableSchema({
      name: 'channels',
      columns: [
        { name: 'channel_id',  type: 'string'  },   // server UUID, unique
        { name: 'project_id',  type: 'string'  },
        { name: 'name',        type: 'string'  },
        { name: 'type',        type: 'string'  },   // voice | video
        { name: 'status',      type: 'string'  },   // active | ended
        { name: 'created_at',  type: 'number'  },
        { name: 'ended_at',    type: 'number',  isOptional: true },
        { name: 'metadata',    type: 'string',  isOptional: true },
      ],
    }),

    // ── participants ────────────────────────────────────────
    tableSchema({
      name: 'participants',
      columns: [
        { name: 'channel_id',       type: 'string'  },
        { name: 'user_id',          type: 'string'  },
        { name: 'display_name',     type: 'string',  isOptional: true },
        { name: 'role',             type: 'string'  },  // publisher|subscriber|both
        { name: 'is_audio_muted',   type: 'boolean' },
        { name: 'is_video_muted',   type: 'boolean' },
        { name: 'connection_state', type: 'string'  },  // connected|disconnected|reconnecting
        { name: 'joined_at',        type: 'number'  },
        { name: 'left_at',          type: 'number',  isOptional: true },
      ],
    }),

    // ── sessions (CDR — feeds Week 11–12 metering) ─────────
    tableSchema({
      name: 'sessions',
      columns: [
        { name: 'session_id',       type: 'string'  },  // client UUID
        { name: 'channel_id',       type: 'string'  },
        { name: 'user_id',          type: 'string'  },
        { name: 'project_id',       type: 'string'  },
        { name: 'media_type',       type: 'string'  },  // voice | video
        { name: 'started_at',       type: 'number'  },
        { name: 'ended_at',         type: 'number',  isOptional: true },
        { name: 'duration_seconds', type: 'number',  isOptional: true },
        { name: 'bytes_sent',       type: 'number'  },
        { name: 'bytes_received',   type: 'number'  },
        { name: 'region',           type: 'string'  },  // added in migration 2→3
        { name: 'synced',           type: 'boolean' },
        { name: 'created_at',       type: 'number'  },
      ],
    }),

    // ── api_keys (local credential store) ──────────────────
    tableSchema({
      name: 'api_keys',
      columns: [
        { name: 'project_id',       type: 'string'  },
        { name: 'api_key_encrypted',type: 'string'  },  // encrypted via SecureStore
        { name: 'jwt_token',        type: 'string',  isOptional: true },
        { name: 'jwt_expires_at',   type: 'number',  isOptional: true },
        { name: 'refresh_token',    type: 'string',  isOptional: true },  // Week 3–4
        { name: 'created_at',       type: 'number'  },
        { name: 'last_used_at',     type: 'number',  isOptional: true },
      ],
    }),

  ],
});
