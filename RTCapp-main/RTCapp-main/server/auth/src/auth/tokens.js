// src/auth/tokens.js
// JWT + refresh token logic

const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { RefreshTokenRepo, ApiKeyRepo } = require('../db/repositories');

const JWT_SECRET          = process.env.JWT_SECRET || 'change-this-secret-in-production';
const JWT_EXPIRES_IN      = '1h';
const REFRESH_EXPIRES_DAYS = 30;

// ── Issue token pair ──────────────────────────────────────────────────────────

async function issueTokenPair(apiKey) {
  const now = Date.now();

  const accessToken = jwt.sign(
    {
      sub:        apiKey.id,
      app_id:     apiKey.app_id,
      project_id: apiKey.project_id,
      type:       'access',
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  const rawRefresh = crypto.randomBytes(40).toString('hex');
  const tokenHash  = await bcrypt.hash(rawRefresh, 10);
  const expiresAt  = now + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000;

  await RefreshTokenRepo.create({
    id: uuidv4(),
    apiKeyId: apiKey.id,
    tokenHash,
    expiresAt,
    now,
  });

  return {
    access_token:  accessToken,
    refresh_token: rawRefresh,
    expires_in:    3600,
    token_type:    'Bearer',
  };
}

// ── Verify access JWT ─────────────────────────────────────────────────────────

function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// ── Rotate refresh token ──────────────────────────────────────────────────────

async function rotateRefreshToken(rawRefreshToken) {
  const now  = Date.now();
  const rows = await RefreshTokenRepo.findAllActive(now);

  let matched = null;
  for (const row of rows) {
    const ok = await bcrypt.compare(rawRefreshToken, row.token_hash);
    if (ok) { matched = row; break; }
  }

  if (!matched) {
    throw new Error('Invalid or expired refresh token');
  }

  await RefreshTokenRepo.revoke(matched.id);

  const apiKey = await ApiKeyRepo.findByAppId
    ? null  // findByAppId needs app_id not api_key id — use direct lookup below
    : null;

  const { db } = require('../db/database');
  const key = await db('api_keys').where({ id: matched.api_key_id, is_active: 1 }).first();

  if (!key) {
    throw new Error('API key no longer active');
  }

  return issueTokenPair(key);
}

module.exports = { issueTokenPair, verifyAccessToken, rotateRefreshToken };
