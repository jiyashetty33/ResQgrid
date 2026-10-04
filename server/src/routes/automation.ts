import { Router, Request, Response, NextFunction } from 'express';
import {
  getPipelineTelemetry,
  startSimulatedFeed,
  stopSimulatedFeed,
  isSimulatedFeedRunning,
} from '../services/automation/localAutomation.js';
import { getRepository } from '../db/index.js';
import { ENV } from '../config/env.js';

export const automationRouter = Router();

// GET /api/automation/status
automationRouter.get('/status', (_req: Request, res: Response) => {
  const telemetry = getPipelineTelemetry();
  res.json({
    data: {
      mode: ENV.N8N_ENABLED ? 'n8n' : 'local',
      n8n_enabled: ENV.N8N_ENABLED,
      n8n_base_url: ENV.N8N_BASE_URL,
      nodes: telemetry,
      feed_running: isSimulatedFeedRunning(),
    },
    error: null,
  });
});

// POST /api/feed/start
automationRouter.post('/feed/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepository();
    const interval = Number(req.body.intervalSeconds) || 10;
    startSimulatedFeed(repo, interval);
    res.json({ data: { feed_running: true, intervalSeconds: interval }, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/feed/stop
automationRouter.post('/feed/stop', (_req: Request, res: Response) => {
  stopSimulatedFeed();
  res.json({ data: { feed_running: false }, error: null });
});
