import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getRepository } from '../db/index.js';
import { runMonitorTick } from '../services/automation/localAutomation.js';
import { Resource } from '../types/index.js';

export const resourcesRouter = Router();

// GET /api/resources
resourcesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepository();
    const { type, status } = req.query;
    const resources = await repo.getResources({
      type: type ? String(type) : undefined,
      status: status ? String(status) : undefined,
    });
    res.json({ data: resources, error: null });
  } catch (err) {
    next(err);
  }
});

// GET /api/resources/:id
resourcesRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepository();
    const resource = await repo.getResourceById(String(req.params.id));
    if (!resource) {
      res.status(404).json({ data: null, error: { message: 'Resource not found' } });
      return;
    }
    res.json({ data: resource, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/resources
resourcesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepository();
    const body = req.body;

    const resource: Resource = {
      id: crypto.randomUUID(),
      code: body.code || `RES-${Math.floor(100 + Math.random() * 900)}`,
      type: body.type || 'emergency_vehicle',
      name: body.name || 'Emergency Unit',
      total_quantity: Number(body.total_quantity) || 1,
      available_quantity: Number(body.available_quantity) || Number(body.total_quantity) || 1,
      location_name: body.location_name || 'Bunder Logistics Depot',
      lat: Number(body.lat) || 12.8555,
      lng: Number(body.lng) || 74.8355,
      status: body.status || 'AVAILABLE',
      is_bulk: Boolean(body.is_bulk),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const created = await repo.createResource(resource);
    res.status(201).json({ data: created, error: null });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/resources/:id
resourcesRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const repo = await getRepository();
    const existing = await repo.getResourceById(id);
    if (!existing) {
      res.status(404).json({ data: null, error: { message: 'Resource not found' } });
      return;
    }

    const updates = { ...req.body };
    const updated = await repo.updateResource(id, updates);

    // If status became UNAVAILABLE, trigger automatic monitor check
    if (updates.status === 'UNAVAILABLE' || updates.available_quantity === 0) {
      await repo.createActivityLog({
        level: 'warning',
        category: 'replan',
        message: `Resource ${existing.code} (${existing.name}) marked UNAVAILABLE. Checking plan validity...`,
      });
      await runMonitorTick(repo);
    }

    res.json({ data: updated, error: null });
  } catch (err) {
    next(err);
  }
});
