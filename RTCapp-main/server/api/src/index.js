const express = require('express');
const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('X-API-Version', 'v1');
  next();
});

app.use('/v1/tokens',      require('./routes/tokens'));
app.use('/v1/channels',    require('./routes/channels'));

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'rtc-api', version: 'v1' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(3002, () => console.log('API server running on :3002'));