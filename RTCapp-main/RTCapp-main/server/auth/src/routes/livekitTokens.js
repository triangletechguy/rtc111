// src/routes/livekitTokens.js
// POST /sdk/livekit-token
// Called by the Android SDK to get a LiveKit room token.
// Requires a valid SDK JWT in the Authorization header.

const express    = require('express');
const { AccessToken } = require('livekit-server-sdk');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();

const LIVEKIT_API_KEY    = process.env.LIVEKIT_API_KEY    || 'APIRFTVaL4vHqTu';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'PNNpBUTXafhQA6efZLHcgB6n7m0IUH9Lwa8o6VhFe4RB';
const LIVEKIT_URL        = process.env.LIVEKIT_URL        || 'wss://webrtc-0d1y6i0l.livekit.cloud';

// ── POST /sdk/livekit-token ───────────────────────────────────────────────────
// Body: { room: string, identity: string }
// Returns: { token: string, url: string }

router.post('/livekit-token', authenticate, async (req, res) => {
  const { room, identity } = req.body;

  if (!room || !identity) {
    return res.status(400).json({ error: 'room and identity are required' });
  }

  try {
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      ttl: '1h',
    });

    at.addGrant({
      roomJoin:     true,
      room,
      canPublish:   true,
      canSubscribe: true,
      canUpdateOwnMetadata: true,
    });

    const token = await at.toJwt();

    res.json({ token, url: LIVEKIT_URL });

  } catch (err) {
    console.error('LiveKit token error:', err);
    res.status(500).json({ error: 'Failed to generate LiveKit token' });
  }
});

module.exports = router;
