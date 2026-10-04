import { Request, Response, NextFunction } from 'express';
import { ENV } from '../config/env.js';

export function webhookAuth(req: Request, res: Response, next: NextFunction) {
  const secret = req.headers['x-webhook-secret'];
  if (!secret || secret !== ENV.N8N_WEBHOOK_SECRET) {
    res.status(401).json({
      data: null,
      error: { message: 'Unauthorized webhook secret', code: 'UNAUTHORIZED' },
    });
    return;
  }
  next();
}
