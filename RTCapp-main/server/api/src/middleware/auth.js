const jwt = require('jsonwebtoken');
const { SDK_JWT_SECRET } = require('../config');

// Validates the SDK JWT issued by the auth server (server/auth)
module.exports = function authenticate(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing Authorization header' });

  try {
    req.sdk = jwt.verify(token, SDK_JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired SDK token' });
  }
};