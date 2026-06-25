/**
 * db/database.ts
 * FIX #10: jsi: true crashes if JSI not configured in Android build.
 * Default to false. Enable manually once JSI/Hermes is confirmed working.
 */

import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schema } from './schema';
import { migrations } from '../../migrations';
import {
  ChannelModel,
  ParticipantModel,
  SessionModel,
  ApiKeyModel,
} from '../models';

let _db: Database | null = null;

export function getDatabase(): Database {
  if (_db) return _db;

  const adapter = new SQLiteAdapter({
    schema,
    migrations,
    dbName: 'yourplatform_sdk',
    // FIX #10: jsi: true crashes if JSI not set up in android/app/build.gradle.
    // Set to true only after confirming: hermesEnabled=true and JSI bridge is active.
    // To enable: add `jsi: true` here and rebuild with `npx expo run:android`.
    jsi: false,
  });

  _db = new Database({
    adapter,
    modelClasses: [ChannelModel, ParticipantModel, SessionModel, ApiKeyModel],
  });

  return _db;
}
