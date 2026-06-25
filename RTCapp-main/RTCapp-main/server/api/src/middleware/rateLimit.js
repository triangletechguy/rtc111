const rateLimit = require('express-rate-limit');
let store = undefined;
try {
  const Redis = require('ioredis');
  const client = new Redis({ host: '127.0.0.1', port: 6379, lazyConnect: true, connectTimeout: 500, maxRetriesPerRequest: 0, enableOfflineQueue: false });
  client.on('error', () => {});
  console.log('[rate-limit] Redis configured');
} catch(e) {
  console.log('[rate-limit] Using in-memory store');
}
module.exports = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: (req) => req.sdk && req.sdk.app_id ? req.sdk.app_id : req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Rate limit exceeded' }),
});