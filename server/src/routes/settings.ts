import { Router, Request, Response, NextFunction } from 'express';
import { getRepository } from '../db/index.js';

export const settingsRouter = Router();

// GET /api/settings
settingsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepository();
    const settings = await repo.getSettings();
    res.json({ data: settings, error: null });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/settings
settingsRouter.patch('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepository();
    const updates = req.body;

    for (const [key, value] of Object.entries(updates)) {
      // Rule: critical_requires_approval is ALWAYS true and cannot be overridden
      if (key === 'critical_requires_approval') {
        continue;
      }
      await repo.updateSetting(key, value);
    }

    const current = await repo.getSettings();
    res.json({ data: current, error: null });
  } catch (err) {
    next(err);
  }
});
