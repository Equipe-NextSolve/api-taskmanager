import { Request, Response, NextFunction } from 'express';
import { redis } from '../lib/redis';

interface RateLimitOptions {
    windowSeconds: number;
    max: number;
    keyPrefix: string;
}

const INCR_EXPIRE_SCRIPT = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return c
`;

export function rateLimit(options: RateLimitOptions) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
        const key = `rl:${options.keyPrefix}:${ip}`;

        try {
            const count = await redis.eval(
                INCR_EXPIRE_SCRIPT,
                1,
                key,
                String(options.windowSeconds)
            ) as number;

            res.setHeader('X-RateLimit-Limit', options.max);
            res.setHeader('X-RateLimit-Remaining', Math.max(0, options.max - count));

            if (count > options.max) {
                res.status(429).json({ error: 'Muitas requisições. Tente novamente em breve.' });
                return;
            }
            next();
        } catch {
            console.error('[rate-limit] Redis indisponível — bloqueando requisição.');
            res.status(503).json({ error: 'Serviço temporariamente indisponível. Tente novamente em breve.' });
        }
    };
}

export const licenseRateLimit = rateLimit({ windowSeconds: 60, max: 60, keyPrefix: 'license' });
export const adminRateLimit   = rateLimit({ windowSeconds: 60, max: 30, keyPrefix: 'admin' });
export const webhookRateLimit = rateLimit({ windowSeconds: 10, max: 50, keyPrefix: 'webhook' });
export const cronRateLimit    = rateLimit({ windowSeconds: 60, max: 5,  keyPrefix: 'cron' });
export const emailRateLimit   = rateLimit({ windowSeconds: 60, max: 20, keyPrefix: 'email' });