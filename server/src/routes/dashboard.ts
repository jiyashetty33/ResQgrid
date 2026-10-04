import { Router, Request, Response, NextFunction } from 'express';
import { getRepository } from '../db/index.js';
import { generateSituationSummary } from '../services/ai/summarize.js';
import { detectConflicts } from '../services/logic/conflicts.js';

export const dashboardRouter = Router();

// GET /api/dashboard/summary
dashboardRouter.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepository();
    const reports = await repo.getReports();
    const incidents = await repo.getIncidents({ status: 'all' });
    const resources = await repo.getResources({ status: 'all' });
    const dispatches = await repo.getDispatches({ status: 'all' });
    const replanEvents = await repo.getReplanningEvents();

    const activeIncidents = incidents.filter((i) => i.status !== 'resolved');
    const criticalCount = activeIncidents.filter((i) => i.severity === 'CRITICAL').length;
    const availableResources = resources.filter((r) => r.status === 'AVAILABLE').length;
    const pendingApprovals = dispatches.filter((d) => d.status === 'PENDING').length;

    // Severity and Type counts
    const severityCounts = {
      CRITICAL: incidents.filter((i) => i.severity === 'CRITICAL').length,
      HIGH: incidents.filter((i) => i.severity === 'HIGH').length,
      MEDIUM: incidents.filter((i) => i.severity === 'MEDIUM').length,
      LOW: incidents.filter((i) => i.severity === 'LOW').length,
    };

    const typeCounts: Record<string, number> = {};
    for (const inc of incidents) {
      typeCounts[inc.type] = (typeCounts[inc.type] || 0) + 1;
    }

    const conflicts = detectConflicts(incidents, resources);

    // AI Situation summary
    const situationSummary = await generateSituationSummary(
      activeIncidents,
      conflicts,
      {
        totalReports: reports.length,
        activeIncidents: activeIncidents.length,
        criticalCount,
      }
    );

    // Has pending replan needing approval?
    const hasPendingReplan =
      replanEvents.length > 0 &&
      replanEvents[0].status === 'pending_approval' &&
      dispatches.some((d) => d.status === 'PENDING' && d.requires_approval);

    res.json({
      data: {
        stats: {
          totalReports: reports.length,
          activeIncidents: activeIncidents.length,
          criticalCount,
          availableResources,
          pendingApprovals,
        },
        severityCounts,
        typeCounts,
        conflicts,
        situationSummary,
        latestReplanEvent: replanEvents[0] || null,
        hasPendingReplan,
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
});
