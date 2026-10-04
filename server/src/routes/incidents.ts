import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getRepository } from '../db/index.js';
import { calculatePriorityScore } from '../services/logic/priority.js';
import { matchGazetteerLocation } from '../services/logic/geo.js';
import { Incident } from '../types/index.js';

export const incidentsRouter = Router();

// GET /api/incidents
incidentsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepository();
    const { status, severity, search } = req.query;
    const incidents = await repo.getIncidents({
      status: status ? String(status) : undefined,
      severity: severity ? String(severity) : undefined,
      search: search ? String(search) : undefined,
    });
    res.json({ data: incidents, error: null });
  } catch (err) {
    next(err);
  }
});

// GET /api/incidents/:id
incidentsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepository();
    const incident = await repo.getIncidentById(String(req.params.id));
    if (!incident) {
      res.status(404).json({ data: null, error: { message: 'Incident not found' } });
      return;
    }

    const relations = await repo.getIncidentReports(incident.id);
    const reports = [];
    for (const rel of relations) {
      const r = await repo.getReportById(rel.report_id);
      if (r) {
        reports.push({ ...r, relation: rel.relation, similarity: rel.similarity, reasoning: rel.reasoning });
      }
    }

    const allocations = (await repo.getAllocations(undefined, true)).filter(
      (a) => a.incident_id === incident.id
    );

    res.json({
      data: {
        ...incident,
        reports,
        allocations,
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/incidents
incidentsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepository();
    const body = req.body;

    const loc = matchGazetteerLocation(body.location_name || '');
    const lat = body.lat || (loc ? loc.lat : 12.8650);
    const lng = body.lng || (loc ? loc.lng : 74.8500);
    const location_name = body.location_name || (loc ? loc.name : 'Mangaluru');

    const priorityCalc = calculatePriorityScore({
      severity: body.severity || 'MEDIUM',
      people_affected: Number(body.people_affected) || 0,
      medical_urgency: Number(body.medical_urgency) || 20,
      urgency: Number(body.urgency) || 50,
      lat,
      lng,
      confidence: Number(body.confidence) || 0.85,
      is_critical_infrastructure: Boolean(body.is_critical_infrastructure),
    });

    const incident: Incident = {
      id: crypto.randomUUID(),
      code: `INC-${Math.floor(100 + Math.random() * 900)}`,
      name: body.name || `${body.severity || 'MEDIUM'} ${body.type || 'Incident'} – ${location_name}`,
      type: body.type || 'flood',
      location_name,
      lat,
      lng,
      people_affected: Number(body.people_affected) || 0,
      severity: body.severity || 'MEDIUM',
      urgency: Number(body.urgency) || 50,
      medical_urgency: Number(body.medical_urgency) || 20,
      is_critical_infrastructure: Boolean(body.is_critical_infrastructure),
      confidence: Number(body.confidence) || 0.85,
      required_resources: body.required_resources || [],
      status: body.status || 'new',
      priority_score: priorityCalc.score,
      priority_breakdown: priorityCalc.breakdown,
      summary: body.summary || `Manual incident created at ${location_name}.`,
      report_count: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const created = await repo.createIncident(incident);
    await repo.createActivityLog({
      level: created.severity === 'CRITICAL' ? 'critical' : 'info',
      category: 'priority',
      message: `Incident ${created.code} manually logged. Priority: ${created.priority_score}.`,
    });

    res.status(201).json({ data: created, error: null });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/incidents/:id
incidentsRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const repo = await getRepository();
    const existing = await repo.getIncidentById(id);
    if (!existing) {
      res.status(404).json({ data: null, error: { message: 'Incident not found' } });
      return;
    }

    const updates = { ...req.body };

    // Recompute priority if fields changed
    const severity = updates.severity ?? existing.severity;
    const people_affected = updates.people_affected !== undefined ? Number(updates.people_affected) : existing.people_affected;
    const medical_urgency = updates.medical_urgency !== undefined ? Number(updates.medical_urgency) : existing.medical_urgency;
    const urgency = updates.urgency !== undefined ? Number(updates.urgency) : existing.urgency;
    const is_critical_infrastructure = updates.is_critical_infrastructure !== undefined ? Boolean(updates.is_critical_infrastructure) : existing.is_critical_infrastructure;

    const pCalc = calculatePriorityScore({
      severity,
      people_affected,
      medical_urgency,
      urgency,
      lat: existing.lat,
      lng: existing.lng,
      confidence: existing.confidence,
      is_critical_infrastructure,
    });

    updates.priority_score = pCalc.score;
    updates.priority_breakdown = pCalc.breakdown;

    const updated = await repo.updateIncident(id, updates);

    await repo.createActivityLog({
      level: 'info',
      category: 'priority',
      message: `Incident ${existing.code} updated. Priority recomputed: ${existing.priority_score} → ${pCalc.score}.`,
    });

    res.json({ data: updated, error: null });
  } catch (err) {
    next(err);
  }
});
