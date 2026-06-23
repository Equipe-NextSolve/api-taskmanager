import 'dotenv/config';
import { Redis } from 'ioredis';

const globalForRedis = global as unknown as { redis: Redis };

export const redis =
  globalForRedis.redis ||
  new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableOfflineQueue: false,
  });

redis.on('error', (err) => {
  console.error('[redis] Erro de conexão:', err.message);
});

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;