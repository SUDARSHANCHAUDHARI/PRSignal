import type { Request, Response, NextFunction } from 'express';

type Bucket = { count: number; resetAt: number };

/**
 * Minimal dependency-free fixed-window rate limiter, keyed by client IP.
 * Adequate for a single-instance MVP; swap for a shared store before scaling out.
 */
export function rateLimit(options: { windowMs: number; max: number; message?: string }) {
  const { windowMs, max, message = 'Too many requests' } = options;
  const buckets = new Map<string, Bucket>();

  return function rateLimiter(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    const key = req.ip ?? 'unknown';

    // Opportunistic cleanup so the map cannot grow unbounded under many IPs.
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) {
        if (now > b.resetAt) buckets.delete(k);
      }
    }

    let bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }

    next();
  };
}
