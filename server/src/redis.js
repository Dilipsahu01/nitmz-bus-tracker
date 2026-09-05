const { createClient } = require('redis');
require('dotenv').config();

const REDIS_URL = process.env.REDIS_URL;

const redisClient = createClient({ url: REDIS_URL });
const redisSub = createClient({ url: REDIS_URL });

redisClient.on('error', (err) => console.error('[Redis Client] Error', err));
redisSub.on('error', (err) => console.error('[Redis Sub] Error', err));

let isConnected = false;

async function connectRedis() {
  if (!isConnected && REDIS_URL) {
    try {
      await redisClient.connect();
      await redisSub.connect();
      isConnected = true;
      console.log('✅ Connected to Redis (Client & Pub/Sub)');
    } catch (err) {
      console.error('❌ Failed to connect to Redis:', err);
    }
  }
}

connectRedis();

module.exports = {
  redisClient,
  redisSub,
  connectRedis
};
