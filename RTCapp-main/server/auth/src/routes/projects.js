// src/routes/projects.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { ProjectRepo } = require('../db/repositories');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();
router.use(authenticate);

// ── GET /projects ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const projects = await ProjectRepo.findByDeveloper(req.auth.sub);
    res.json({ projects });
  } catch (err) {
    console.error('List projects error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /projects ────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const now = Date.now();
    const id  = uuidv4();
    await ProjectRepo.create({ id, developerId: req.auth.sub, name, now });
    res.status(201).json({
      message: 'Project created',
      project: { id, name, developer_id: req.auth.sub, created_at: now },
    });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;