// src/index.js
const express  = require('express');
const cors     = require('cors');
const { bootstrap } = require('./db/database');

const developerRoutes = require('./routes/developers');
const projectRoutes   = require('./routes/projects');
const apiKeyRoutes    = require('./routes/apiKeys');
const sdkTokenRoutes    = require('./routes/sdkTokens');
const livekitRoutes     = require('./routes/livekitTokens');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.use('/auth',     developerRoutes);
app.use('/projects', projectRoutes);
app.use('/projects/:projectId/keys', apiKeyRoutes);
app.use('/sdk',      sdkTokenRoutes);
app.use('/sdk',      livekitRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'auth' }));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Periodic cleanup of expired refresh tokens
const { RefreshTokenRepo } = require('./db/repositories');
setInterval(async () => {
  const count = await RefreshTokenRepo.deleteExpired(Date.now());
  if (count > 0) console.log(`Cleaned up ${count} expired refresh tokens`);
}, 24 * 60 * 60 * 1000);

// Bootstrap DB then start server
bootstrap().then(() => {
  app.listen(PORT, () => {
    console.log(`\nAuth service running on http://localhost:${PORT}`);
    console.log(`  POST   /auth/register`);
    console.log(`  POST   /auth/login`);
    console.log(`  GET    /projects`);
    console.log(`  POST   /projects`);
    console.log(`  POST   /projects/:id/keys`);
    console.log(`  GET    /projects/:id/keys`);
    console.log(`  DELETE /projects/:id/keys/:keyId`);
    console.log(`  POST   /sdk/token`);
    console.log(`  POST   /sdk/refresh`);
    console.log(`  GET    /health\n`);
  });
}).catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});

