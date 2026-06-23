import { Request, Response, NextFunction } from 'express';
import { redis } from '../lib/redis';

interface RateLimitOptions {
  windowSeconds: number;
  max: number;
  keyPrefix: string;
}

export function rateLimit(options: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const key = `rl:${options.keyPrefix}:${ip}`;

    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, options.windowSeconds);
      }

      res.setHeader('X-RateLimit-Limit', options.max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, options.max - count));

      if (count > options.max) {
        res.status(429).json({ error: 'Muitas requisições. Tente novamente em breve.' });
        return;
      }
      next();
    } catch {
      // Redis indisponível: deixa passar (fail open)
      next();
    }
  };
}

export const licenseRateLimit = rateLimit({ windowSeconds: 60, max: 60, keyPrefix: 'license' });
export const adminRateLimit   = rateLimit({ windowSeconds: 60, max: 30, keyPrefix: 'admin' });
export const webhookRateLimit = rateLimit({ windowSeconds: 10, max: 50, keyPrefix: 'webhook' });