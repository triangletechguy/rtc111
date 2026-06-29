// packages/sdk/src/auth/tokenManager.ts
// Handles JWT lifecycle for the Android SDK:
//   - Fetches a new token using app_id + app_secret
//   - Refreshes automatically when the token expires
//   - Stores tokens in WatermelonDB via ApiKeyRepository

import { ApiKeyRepository } from '../db/repositories';
import { Database } from '@nozbe/watermelondb';

// Change this to your server URL when deploying
const AUTH_BASE_URL = 'http://10.0.2.2:3001'; // 10.0.2.2 = localhost from Android emulator

export class TokenManager {
  private db: Database;
  private apiKeyRepo: ApiKeyRepository;

  constructor(db: Database) {
    this.db       = db;
    this.apiKeyRepo = new ApiKeyRepository(db);
  }

  /**
   * Called once when the SDK initialises.
   * Fetches a JWT from the auth server and stores it on-device.
   */
  async authenticate(appId: string, appSecret: string): Promise<string> {
    const response = await fetch(`${AUTH_BASE_URL}/sdk/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Auth failed: ${response.status}`);
    }

    const data = await response.json();

    // Persist both tokens on-device via WatermelonDB
    await this.apiKeyRepo.upsert({
      appId,
      jwt:          data.access_token,
      refreshToken: data.refresh_token,
      expiresAt:    Date.now() + data.expires_in * 1000,
    });

    return data.access_token;
  }

  /**
   * Returns a valid access token — refreshes automatically if expired.
   * Call this before every RTC operation.
   */
  async getValidToken(appId: string): Promise<string> {
    const record = await this.apiKeyRepo.findByAppId(appId);

    if (!record) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    // If token has more than 5 minutes left, return it as-is
    const fiveMinutes = 5 * 60 * 1000;
    if (record.expiresAt && record.expiresAt - Date.now() > fiveMinutes) {
      return record.jwt!;
    }

    // Otherwise refresh
    return this.refresh(appId, record.refreshToken!);
  }

  /**
   * Exchanges the refresh token for a new JWT pair.
   * Old refresh token is invalidated — new one is stored.
   */
  private async refresh(appId: string, refreshToken: string): Promise<string> {
    const response = await fetch(`${AUTH_BASE_URL}/sdk/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      // Refresh token invalid/expired — developer must re-authenticate
      throw new Error(body.error || `Refresh failed: ${response.status}`);
    }

    const data = await response.json();

    await this.apiKeyRepo.upsert({
      appId,
      jwt:          data.access_token,
      refreshToken: data.refresh_token,
      expiresAt:    Date.now() + data.expires_in * 1000,
    });

    return data.access_token;
  }
}
