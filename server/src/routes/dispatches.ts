import { Router, Request, Response, NextFunction } from 'express';
import { getRepository } from '../db/index.js';

export const dispatchesRouter = Router();

// GET /api/dispatches
dispatchesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepository();
    const { status } = req.query;
    const dispatches = await repo.getDispatches({
      status: status ? String(status) : undefined,
    });

    const resources = await repo.getResources({ status: 'all' });
    const incidents = await repo.getIncidents({ status: 'all' });

    const enriched = dispatches.map((d) => {
      const resUnit = resources.find((r) => r.id === d.resource_id);
      const inc = incidents.find((i) => i.id === d.incident_id);
      return {
        ...d,
        resource_name: resUnit?.name || 'Resource Unit',
        resource_code: resUnit?.code || 'RES',
        incident_name: inc?.name || 'Disaster Site',
        incident_code: inc?.code || 'INC',
        incident_severity: inc?.severity || 'MEDIUM',
      };
    });

    res.json({ data: enriched, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/dispatches/:id/approve
dispatchesRouter.post('/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const repo = await getRepository();
    const dispatch = await repo.getDispatchById(id);
    if (!dispatch) {
      res.status(404).json({ data: null, error: { message: 'Dispatch not found' } });
      return;
    }

    const { approved_by = 'Duty Coordinator' } = req.body;

    // Approval rules:
    // If requires_approval is true, approved_by must be present
    if (dispatch.requires_approval && (!approved_by || approved_by.trim() === '')) {
      res.status(400).json({
        data: null,
        error: { message: 'Coordinator authorization signature is required for critical/reassigned dispatches.' },
      });
      return;
    }

    const now = new Date().toISOString();

    // Update dispatch
    const updatedDispatch = await repo.updateDispatch(dispatch.id, {
      status: 'APPROVED',
      decided_by: approved_by,
      decided_at: now,
      notification: {
        channel: 'radio',
        message: `DISPATCH AUTHORIZED by ${approved_by}: Proceed to ${dispatch.destination}. ETA ${dispatch.eta_minutes}m.`,
        timestamp: now,
      },
    });

    // Update resource state
    const resource = await repo.getResourceById(dispatch.resource_id);
    if (resource) {
      const newAvail = Math.max(0, resource.available_quantity - dispatch.quantity);
      await repo.updateResource(resource.id, {
        status: newAvail === 0 && !resource.is_bulk ? 'IN_TRANSIT' : resource.status,
        available_quantity: newAvail,
        assigned_incident_id: dispatch.incident_id,
      });
    }

    // Update allocation
    await repo.updateAllocation(dispatch.allocation_id, {
      status: 'dispatched',
    });

    // Update incident status
    await repo.updateIncident(dispatch.incident_id, {
      status: 'dispatched',
    });

    await repo.createActivityLog({
      level: 'success',
      category: 'dispatch',
      message: `Dispatch ${dispatch.code} APPROVED by ${approved_by}. Resource en route to ${dispatch.destination}.`,
      metadata: { dispatchCode: dispatch.code, approvedBy: approved_by },
    });

    res.json({ data: updatedDispatch, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/dispatches/:id/reject
dispatchesRouter.post('/:id/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const repo = await getRepository();
    const dispatch = await repo.getDispatchById(id);
    if (!dispatch) {
      res.status(404).json({ data: null, error: { message: 'Dispatch not found' } });
      return;
    }

    const { rejected_by = 'Duty Coordinator', reason = 'Overridden by coordinator' } = req.body;
    const now = new Date().toISOString();

    const updated = await repo.updateDispatch(dispatch.id, {
      status: 'REJECTED',
      decided_by: rejected_by,
      decided_at: now,
      reason: `${dispatch.reason} (Rejected: ${reason})`,
    });

    // Release allocation
    await repo.updateAllocation(dispatch.allocation_id, {
      status: 'rejected',
      is_current: false,
    });

    await repo.createActivityLog({
      level: 'warning',
      category: 'dispatch',
      message: `Dispatch ${dispatch.code} REJECTED by ${rejected_by}. Reason: ${reason}.`,
      metadata: { dispatchCode: dispatch.code, rejectedBy: rejected_by },
    });

    res.json({ data: updated, error: null });
  } catch (err) {
    next(err);
  }
});
