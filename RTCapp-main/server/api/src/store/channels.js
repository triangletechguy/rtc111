const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');

const stmts = {
  insertChannel:      db.prepare('INSERT INTO channels (id, app_id, created_at) VALUES (?, ?, ?)'),
  getChannel:         db.prepare('SELECT * FROM channels WHERE id = ?'),
  closeChannel:       db.prepare('UPDATE channels SET closed_at = ? WHERE id = ?'),
  insertSession:      db.prepare('INSERT INTO sessions (id, channel_id, app_id, identity, room, joined_at) VALUES (?, ?, ?, ?, ?, ?)'),
  getSession:         db.prepare('SELECT * FROM sessions WHERE channel_id = ? AND identity = ? AND left_at IS NULL'),
  endSession:         db.prepare('UPDATE sessions SET left_at = ?, duration_ms = ? WHERE id = ?'),
  listParticipants:   db.prepare('SELECT * FROM sessions WHERE channel_id = ? AND left_at IS NULL'),
  countParticipants:  db.prepare('SELECT COUNT(*) as count FROM sessions WHERE channel_id = ? AND left_at IS NULL'),
};

function createChannel(appId) {
  const id = `ch_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  stmts.insertChannel.run(id, appId, Date.now());
  return getChannel(id);
}

function getChannel(id) {
  return stmts.getChannel.get(id) || null;
}

function closeChannel(id) {
  stmts.closeChannel.run(Date.now(), id);
  return getChannel(id);
}

function addParticipant(channelId, identity, room, appId) {
  const id = uuidv4();
  stmts.insertSession.run(id, channelId, appId, identity, room, Date.now());
  return stmts.getSession.get(channelId, identity);
}

function removeParticipant(channelId, identity) {
  const session = stmts.getSession.get(channelId, identity);
  if (!session) return null;
  const now = Date.now();
  stmts.endSession.run(now, now - session.joined_at, session.id);
  return session;
}

function listParticipants(channelId) {
  return stmts.listParticipants.all(channelId);
}

function serializeChannel(ch) {
  const count = stmts.countParticipants.get(ch.id);
  return {
    id:                ch.id,
    app_id:            ch.app_id,
    created_at:        ch.created_at,
    closed_at:         ch.closed_at || null,
    participant_count: count ? count.count : 0,
  };
}

module.exports = { createChannel, getChannel, closeChannel, addParticipant, removeParticipant, listParticipants, serializeChannel };