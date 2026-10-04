import { Router, Request, Response, NextFunction } from 'express';
import { getRepository } from '../db/index.js';

export const activityRouter = Router();

// GET /api/activity
activityRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepository();
    const { since, limit } = req.query;
    const logs = await repo.getActivityLogs(
      limit ? parseInt(String(limit), 10) : 50,
      since ? String(since) : undefined
    );
    res.json({ data: logs, error: null });
  } catch (err) {
    next(err);
  }
});
