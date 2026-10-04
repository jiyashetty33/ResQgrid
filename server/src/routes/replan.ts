import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getRepository } from '../db/index.js';
import { executeReplanning } from '../services/logic/replanning.js';
import { explainReplan } from '../services/ai/explain.js';
import { Dispatch } from '../types/index.js';

export const replanRouter = Router();

// GET /api/replan/events
replanRouter.get('/events', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepository();
    const events = await repo.getReplanningEvents();
    res.json({ data: events, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/replan
replanRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { trigger, params } = req.body;
    if (!trigger) {
      res.status(400).json({ data: null, error: { message: 'trigger is required' } });
      return;
    }

    const repo = await getRepository();
    const currentIncidents = await repo.getIncidents({ status: 'all' });
    const currentResources = await repo.getResources({ status: 'all' });
    const currentAllocations = await repo.getAllocations(undefined, true);
    const thresholdSetting = (await repo.getSetting('replan_threshold')) || 15;

    const result = executeReplanning(
      { trigger, params },
      currentIncidents,
      currentResources,
      currentAllocations,
      Number(thresholdSetting)
    );

    // AI Explanation with fallback
    const aiExplanation = await explainReplan(
      result.event.trigger_description,
      result.event.diff
    );
    result.event.ai_explanation = aiExplanation;

    // Persist updated incidents and resources
    for (const inc of result.updatedIncidents) {
      const existing = currentIncidents.find((i) => i.id === inc.id);
      if (existing) {
        await repo.updateIncident(inc.id, inc);
      } else {
        await repo.createIncident(inc);
      }
    }

    for (const res of result.updatedResources) {
      await repo.updateResource(res.id, res);
    }

    // Mark previous allocations superseded
    for (const a of currentAllocations) {
      await repo.updateAllocation(a.id, { is_current: false, status: 'superseded' });
    }

    // Insert new allocations as proposed
    await repo.saveAllocations(result.afterPlan.allocations);

    // Create pending dispatches
    for (const a of result.afterPlan.allocations) {
      const inc = result.updatedIncidents.find((i) => i.id === a.incident_id);
      const res = result.updatedResources.find((r) => r.id === a.resource_id);

      // Reassigned or critical/high requires approval
      const isMoved = result.event.diff.moved.some((m) => m.resource_id === a.resource_id);
      const requiresApproval =
        isMoved || inc?.severity === 'CRITICAL' || inc?.severity === 'HIGH';

      const dispatch: Dispatch = {
        id: crypto.randomUUID(),
        code: `DSP-${Math.floor(1000 + Math.random() * 9000)}`,
        allocation_id: a.id,
        incident_id: a.incident_id,
        resource_id: a.resource_id,
        quantity: a.quantity,
        destination: inc ? inc.location_name : 'Site',
        priority_score: a.priority_score,
        eta_minutes: a.eta_minutes,
        reason: a.reason,
        requires_approval: requiresApproval,
        status: 'PENDING',
        notification: {
          channel: 'app',
          message: `Replanned allocation: ${a.quantity} ${res?.name} dispatched to ${inc?.name}. ETA: ${a.eta_minutes}m.`,
          timestamp: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await repo.createDispatch(dispatch);
    }

    // Persist replanning event
    await repo.createReplanningEvent(result.event);

    await repo.createActivityLog({
      level: 'critical',
      category: 'replan',
      message: `Dynamic Replanning complete for trigger: "${trigger}". ${result.event.diff.moved.length} units reassigned, ${result.event.diff.added.length} added.`,
      metadata: { trigger, diff: result.event.diff },
    });

    res.json({
      data: {
        event: result.event,
        before_plan: result.beforePlan,
        after_plan: result.afterPlan,
        diff: result.event.diff,
        conflicts: result.event.conflicts,
        ai_explanation: result.event.ai_explanation,
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
});
