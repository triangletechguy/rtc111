// src/routes/apiKeys.js
// POST /projects/:projectId/keys        — generate a new API key pair
// GET  /projects/:projectId/keys        — list keys for a project
// DELETE /projects/:projectId/keys/:id  — revoke a key
const express = require('express');
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { ApiKeyRepo, ProjectRepo, RefreshTokenRepo } = require('../db/repositories');
const { authenticate } = require('../middleware/authenticate');
const router = express.Router({ mergeParams: true });
router.use(authenticate);

// ── POST /projects/:projectId/keys ────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { projectId } = req.params;
  try {
    const project = await ProjectRepo.findById(projectId);
    console.log("DEBUG projectId:", projectId, "project:", JSON.stringify(project), "auth.sub:", req.auth.sub);
    if (!project || project.developer_id !== req.auth.sub) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const now = Date.now();
    const id  = uuidv4();
    const appId = 'ap_' + crypto.randomBytes(12).toString('hex');
    const rawSecret    = 'sk_' + crypto.randomBytes(24).toString('hex');
    const hashedSecret = await bcrypt.hash(rawSecret, 12);
    await ApiKeyRepo.create({
      id,
      projectId,
      appId,
      appSecret: hashedSecret,
      now,
    });
    res.status(201).json({
      message: 'API key created. Store the app_secret — it will not be shown again.',
      api_key: {
        id,
        app_id:     appId,
        app_secret: rawSecret,
        created_at: now,
      },
    });
  } catch (err) {
    console.error('Create API key error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /projects/:projectId/keys ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { projectId } = req.params;
  try {
    const project = await ProjectRepo.findById(projectId);
    console.log("DEBUG projectId:", projectId, "project:", JSON.stringify(project), "auth.sub:", req.auth.sub);
    if (!project || project.developer_id !== req.auth.sub) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const keys = (await ApiKeyRepo.findByProject(projectId)).map(k => ({
      id:         k.id,
      app_id:     k.app_id,
      is_active:  !!k.is_active,
      created_at: k.created_at,
    }));
    res.json({ api_keys: keys });
  } catch (err) {
    console.error('List API keys error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /projects/:projectId/keys/:id ──────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { projectId, id } = req.params;
  try {
    const project = await ProjectRepo.findById(projectId);
    console.log("DEBUG projectId:", projectId, "project:", JSON.stringify(project), "auth.sub:", req.auth.sub);
    if (!project || project.developer_id !== req.auth.sub) {
      return res.status(404).json({ error: 'Project not found' });
    }
    await RefreshTokenRepo.revokeAllForApiKey(id);
    await ApiKeyRepo.revoke(id, Date.now());
    res.json({ message: 'API key revoked' });
  } catch (err) {
    console.error('Revoke API key error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
