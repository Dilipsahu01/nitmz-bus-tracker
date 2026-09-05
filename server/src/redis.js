const { createClient } = require('redis');
require('dotenv').config();

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const redisClient = createClient({
  url: REDIS_URL,
  socket: {
    connectTimeout: 3000,
    reconnectStrategy: (retries) => {
      if (retries > 3) {
        return new Error('Redis connection retry limit reached');
      }
      return Math.min(retries * 500, 1500);
    }
  }
});

const redisSub = createClient({
  url: REDIS_URL,
  socket: {
    connectTimeout: 3000,
    reconnectStrategy: (retries) => {
      if (retries > 3) {
        return new Error('Redis sub retry limit reached');
      }
      return Math.min(retries * 500, 1500);
    }
  }
});

redisClient.on('error', (err) => console.error('[Redis Client] Error:', err.message || err));
redisSub.on('error', (err) => console.error('[Redis Sub] Error:', err.message || err));

let isConnected = false;

async function connectRedis() {
  if (isConnected) return;
  try {
    await redisClient.connect();
    await redisSub.connect();
    isConnected = true;
    console.log(`✅ Connected to Redis at ${REDIS_URL} (Client & Pub/Sub)`);
  } catch (err) {
    isConnected = false;
    console.warn(`⚠️ Could not connect to Redis at ${REDIS_URL}: ${err.message}. Falling back to PostgreSQL database mode.`);
  }
}

connectRedis();

module.exports = {
  redisClient,
  redisSub,
  connectRedis
};

