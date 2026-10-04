import { Router, Request, Response, NextFunction } from 'express';
import { getRepository } from '../db/index.js';
import {
  runFullDemo,
  getDemoProgress,
  approveDemoStep,
  addSseListener,
  removeSseListener,
} from '../services/demo/demoRunner.js';
import { ENV } from '../config/env.js';

export const demoRouter = Router();

// POST /api/demo/run
demoRouter.post('/run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepository();
    const { autoApprove = false, delayMs = 1200 } = req.body;
    const result = await runFullDemo(repo, { autoApprove, delayMs });
    res.json({ data: result, error: null });
  } catch (err) {
    next(err);
  }
});

// GET /api/demo/progress (Supports SSE or JSON polling)
demoRouter.get('/progress', (req: Request, res: Response) => {
  if (req.headers.accept && req.headers.accept.includes('text/event-stream')) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    addSseListener(res);

    req.on('close', () => {
      removeSseListener(res);
    });
  } else {
    // Standard JSON response
    res.json({ data: getDemoProgress(), error: null });
  }
});

// POST /api/demo/approve
demoRouter.post('/approve', (_req: Request, res: Response) => {
  const approved = approveDemoStep();
  res.json({ data: { approved }, error: null });
});

// POST /api/demo/reset
demoRouter.post('/reset', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepository();
    await repo.resetDemoState();
    res.json({ data: { reset: true, message: 'Demo state restored to initial baseline.' }, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/seed (Guarded by DEMO_MODE)
demoRouter.post('/seed', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (!ENV.DEMO_MODE) {
      res.status(403).json({ data: null, error: { message: 'Seed endpoint disabled in production mode.' } });
      return;
    }
    const repo = await getRepository();
    await repo.resetDemoState();
    res.json({ data: { seeded: true, message: 'Database reseeded successfully.' }, error: null });
  } catch (err) {
    next(err);
  }
});
