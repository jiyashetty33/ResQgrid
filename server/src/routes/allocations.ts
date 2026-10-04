import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getRepository } from '../db/index.js';
import { runAllocation } from '../services/logic/allocation.js';
import { detectConflicts } from '../services/logic/conflicts.js';
import { explainAllocation } from '../services/ai/explain.js';
import { Dispatch } from '../types/index.js';

export const allocationsRouter = Router();

// GET /api/allocations
allocationsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepository();
    const incidents = await repo.getIncidents({ status: 'all' });
    const resources = await repo.getResources({ status: 'all' });
    const allocations = await repo.getAllocations(undefined, true);
    const conflicts = detectConflicts(incidents, resources);

    // Calculate unmet demands
    const unmet: any[] = [];
    const activeIncidents = incidents.filter((i) => i.status !== 'resolved');

    for (const inc of activeIncidents) {
      for (const req of inc.required_resources) {
        const allocatedQty = allocations
          .filter((a) => a.incident_id === inc.id)
          .reduce((sum, a) => {
            const r = resources.find((res) => res.id === a.resource_id);
            return r?.type === req.type ? sum + a.quantity : sum;
          }, 0);

        if (allocatedQty < req.quantity) {
          unmet.push({
            incident_id: inc.id,
            incident_code: inc.code,
            incident_name: inc.name,
            type: req.type,
            shortfall: req.quantity - allocatedQty,
          });
        }
      }
    }

    const aiExplanation = await explainAllocation(conflicts, allocations);

    res.json({
      data: {
        plan_id: allocations[0]?.plan_id || 'baseline-plan',
        plan_version: allocations[0]?.plan_version || 1,
        allocations,
        conflicts,
        unmet,
        ai_explanation: aiExplanation,
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/allocations/generate (Generate new plan + create pending dispatches)
allocationsRouter.post('/generate', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepository();
    const incidents = await repo.getIncidents({ status: 'all' });
    const resources = await repo.getResources({ status: 'all' });

    // Mark previous allocations superseded
    const prevAllocations = await repo.getAllocations(undefined, true);
    for (const a of prevAllocations) {
      await repo.updateAllocation(a.id, { is_current: false, status: 'superseded' });
    }

    const newVersion = (prevAllocations[0]?.plan_version || 0) + 1;
    const plan = runAllocation(incidents, resources, {
      planId: crypto.randomUUID(),
      planVersion: newVersion,
    });

    await repo.saveAllocations(plan.allocations);

    // Create pending dispatches
    for (const a of plan.allocations) {
      const inc = incidents.find((i) => i.id === a.incident_id);
      const resUnit = resources.find((r) => r.id === a.resource_id);
      const requiresApproval = inc?.severity === 'CRITICAL' || inc?.severity === 'HIGH';

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
          channel: 'radio',
          message: `Recommended dispatch of ${a.quantity} ${resUnit?.name} to ${inc?.name}. ETA ${a.eta_minutes}m.`,
          timestamp: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await repo.createDispatch(dispatch);
    }

    const aiExplanation = await explainAllocation(plan.conflicts, plan.allocations);
    plan.ai_explanation = aiExplanation;

    await repo.createActivityLog({
      level: 'success',
      category: 'allocation',
      message: `Fresh allocation plan v${newVersion} formulated. ${plan.allocations.length} proposed unit dispatches generated.`,
    });

    res.json({ data: plan, error: null });
  } catch (err) {
    next(err);
  }
});
