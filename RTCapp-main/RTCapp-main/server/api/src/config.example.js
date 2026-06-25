const SDK_JWT_SECRET = process.env.SDK_JWT_SECRET || 'change-this-secret-in-production';
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'wss://your-livekit-url';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'your-api-key';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'your-api-secret';
module.exports = { SDK_JWT_SECRET, LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET };