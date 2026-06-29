const router = require('express').Router();
const authenticate = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const store = require('../store/channels');

router.post('/', authenticate, rateLimit, (req, res) => {
  const ch = store.createChannel(req.sdk.app_id);
  res.status(201).json(store.serializeChannel(ch));
});

router.get('/:id', authenticate, rateLimit, (req, res) => {
  const ch = store.getChannel(req.params.id);
  if (!ch) return res.status(404).json({ error: 'Channel not found' });
  if (ch.app_id !== req.sdk.app_id) return res.status(403).json({ error: 'Forbidden' });
  res.json(store.serializeChannel(ch));
});

router.delete('/:id', authenticate, rateLimit, (req, res) => {
  const ch = store.getChannel(req.params.id);
  if (!ch) return res.status(404).json({ error: 'Channel not found' });
  if (ch.app_id !== req.sdk.app_id) return res.status(403).json({ error: 'Forbidden' });
  store.closeChannel(req.params.id);
  res.status(204).send();
});

router.get('/:id/participants', authenticate, rateLimit, (req, res) => {
  const ch = store.getChannel(req.params.id);
  if (!ch) return res.status(404).json({ error: 'Channel not found' });
  if (ch.app_id !== req.sdk.app_id) return res.status(403).json({ error: 'Forbidden' });
  res.json(store.listParticipants(req.params.id));
});

router.delete('/:id/participants/:uid', authenticate, rateLimit, (req, res) => {
  const ch = store.getChannel(req.params.id);
  if (!ch) return res.status(404).json({ error: 'Channel not found' });
  if (ch.app_id !== req.sdk.app_id) return res.status(403).json({ error: 'Forbidden' });
  const result = store.removeParticipant(req.params.id, req.params.uid);
  if (!result) return res.status(404).json({ error: 'Participant not found' });
  res.status(204).send();
});

module.exports = router;