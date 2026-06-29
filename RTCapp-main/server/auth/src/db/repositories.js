// src/db/repositories.js
const { db } = require('./database');

// ── Developers ────────────────────────────────────────────────────────────────

const DeveloperRepo = {
  async create({ id, email, passwordHash, name, now }) {
    await db('developers').insert({
      id,
      email,
      password_hash: passwordHash,
      name,
      created_at: now,
      updated_at: now,
    });
  },

  async findByEmail(email) {
    const row = await db('developers').where({ email }).select('*').first();
    console.log('findByEmail result:', JSON.stringify(row));
    return row;
  },

  async findById(id) {
    return db('developers').where({ id }).select('*').first();
  },
};

// ── Projects ──────────────────────────────────────────────────────────────────

const ProjectRepo = {
  async create({ id, developerId, name, now }) {
    await db('projects').insert({
      id, developer_id: developerId, name,
      created_at: now, updated_at: now,
    });
  },

  async findByDeveloper(developerId) {
    return db('projects').where({ developer_id: developerId }).orderBy('created_at', 'desc');
  },

  async findById(id) {
    return db('projects').where({ id }).select('*').first();
  },
};

// ── API Keys ──────────────────────────────────────────────────────────────────

const ApiKeyRepo = {
  async create({ id, projectId, appId, appSecret, now }) {
    await db('api_keys').insert({
      id, project_id: projectId, app_id: appId,
      app_secret: appSecret, is_active: 1,
      created_at: now, updated_at: now,
    });
  },

  async findByAppId(appId) {
    return db('api_keys').where({ app_id: appId, is_active: 1 }).select('*').first();
  },

  async findByProject(projectId) {
    return db('api_keys').where({ project_id: projectId }).select('*');
  },

  async revoke(id, now) {
    await db('api_keys').where({ id }).update({ is_active: 0, updated_at: now });
  },
};

// ── Refresh Tokens ────────────────────────────────────────────────────────────

const RefreshTokenRepo = {
  async create({ id, apiKeyId, tokenHash, expiresAt, now }) {
    await db('refresh_tokens').insert({
      id, api_key_id: apiKeyId, token_hash: tokenHash,
      expires_at: expiresAt, revoked: 0, created_at: now,
    });
  },

  async findAllActive(now) {
    return db('refresh_tokens').where({ revoked: 0 }).where('expires_at', '>', now).select('*');
  },

  async revoke(id) {
    await db('refresh_tokens').where({ id }).update({ revoked: 1 });
  },

  async revokeAllForApiKey(apiKeyId) {
    await db('refresh_tokens').where({ api_key_id: apiKeyId }).update({ revoked: 1 });
  },

  async deleteExpired(now) {
    return db('refresh_tokens').where('expires_at', '<', now).delete();
  },
};

module.exports = { DeveloperRepo, ProjectRepo, ApiKeyRepo, RefreshTokenRepo };
