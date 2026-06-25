const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { AccessToken } = require('livekit-server-sdk');
const authenticate = require('../middleware/auth');
const rateLimit    = require('../middleware/rateLimit');
const { SDK_JWT_SECRET, LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = require('../config');

// POST /v1/tokens
// Body: { room, identity, ttl_seconds? }
// Returns: { sdk_token, livekit_token, livekit_url, expires_at }
router.post('/', authenticate, rateLimit, async (req, res, next) => {
  try {
    const { room, identity, ttl_seconds = 3600 } = req.body;
    if (!room || !identity) return res.status(400).json({ error: 'room and identity are required' });

    // Fresh SDK JWT (short-lived, for this session)
    const sdk_token = jwt.sign(
      { app_id: req.sdk.app_id, identity, room },
      SDK_JWT_SECRET,
      { expiresIn: ttl_seconds }
    );

    // LiveKit room token
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      ttl: ttl_seconds,
    });
    at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
    const livekit_token = await at.toJwt();

    res.json({
      sdk_token,
      livekit_token,
      livekit_url: LIVEKIT_URL,
      expires_at: Date.now() + ttl_seconds * 1000,
    });
  } catch (err) { next(err); }
});

module.exports = router;