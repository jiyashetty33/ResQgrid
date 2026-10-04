import { Router, Request, Response, NextFunction } from 'express';
import { webhookAuth } from '../middleware/webhookAuth.js';
import { getRepository } from '../db/index.js';
import { processReportPipeline } from '../services/automation/pipeline.js';
import { runMonitorTick } from '../services/automation/localAutomation.js';
import { executeReplanning } from '../services/logic/replanning.js';

export const webhooksRouter = Router();

// Protect all webhook endpoints with secret header validation
webhooksRouter.use(webhookAuth);

// POST /api/webhooks/report-received
webhooksRouter.post('/report-received', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { raw_text, source = 'n8n_webhook', reporter } = req.body;
    if (!raw_text) {
      res.status(400).json({ data: null, error: { message: 'raw_text is required' } });
      return;
    }
    const repo = await getRepository();
    const result = await processReportPipeline({ raw_text, source, reporter }, repo);
    res.json({ data: result, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/webhooks/situation-change
webhooksRouter.post('/situation-change', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { trigger, params } = req.body;
    if (!trigger) {
      res.status(400).json({ data: null, error: { message: 'trigger is required' } });
      return;
    }
    const repo = await getRepository();
    const incidents = await repo.getIncidents({ status: 'all' });
    const resources = await repo.getResources({ status: 'all' });
    const allocations = await repo.getAllocations(undefined, true);

    const result = executeReplanning({ trigger, params }, incidents, resources, allocations, 15);
    await repo.createReplanningEvent(result.event);
    await repo.saveAllocations(result.afterPlan.allocations);

    res.json({ data: result, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/webhooks/resource-update
webhooksRouter.post('/resource-update', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { resource_id, updates } = req.body;
    const repo = await getRepository();
    const updated = await repo.updateResource(resource_id, updates);
    if (updates.status === 'UNAVAILABLE') {
      await runMonitorTick(repo);
    }
    res.json({ data: updated, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/webhooks/monitor-tick
webhooksRouter.post('/monitor-tick', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepository();
    const tickResult = await runMonitorTick(repo);
    res.json({ data: tickResult, error: null });
  } catch (err) {
    next(err);
  }
});
