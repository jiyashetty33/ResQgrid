import {
  Incident,
  Resource,
  ResourceType,
  ResourceConflict,
} from '../../types/index.js';

export interface IncidentRequirementDemand {
  incident: Incident;
  quantity: number;
}

/**
 * Detects supply-demand conflicts across active incidents and available resources.
 * Deterministic resolution: Highest priority incidents are served first; others are deferred or reduced.
 */
export function detectConflicts(
  incidents: Incident[],
  resources: Resource[]
): ResourceConflict[] {
  // Aggregate available quantity per resource type (only AVAILABLE units)
  const availableByType = new Map<ResourceType, number>();
  for (const r of resources) {
    if (r.status === 'AVAILABLE') {
      const current = availableByType.get(r.type) || 0;
      availableByType.set(r.type, current + r.available_quantity);
    }
  }

  // Aggregate demand per resource type from non-resolved incidents
  const activeIncidents = incidents.filter(
    (inc) => inc.status !== 'resolved' && inc.required_resources && inc.required_resources.length > 0
  );

  const demandByType = new Map<ResourceType, IncidentRequirementDemand[]>();

  for (const inc of activeIncidents) {
    for (const req of inc.required_resources) {
      if (req.quantity <= 0) continue;
      const list = demandByType.get(req.type) || [];
      list.push({ incident: inc, quantity: req.quantity });
      demandByType.set(req.type, list);
    }
  }

  const conflicts: ResourceConflict[] = [];

  for (const [type, demands] of demandByType.entries()) {
    const totalRequired = demands.reduce((acc, d) => acc + d.quantity, 0);
    const available = availableByType.get(type) || 0;

    if (totalRequired > available) {
      // Sort demands by incident priority score descending
      demands.sort((a, b) => b.incident.priority_score - a.incident.priority_score);

      let remaining = available;
      const served: Array<{ incident_id: string; incident_name: string; quantity: number }> = [];
      const deferred: Array<{ incident_id: string; incident_name: string; shortfall: number }> = [];

      for (const d of demands) {
        if (remaining >= d.quantity) {
          served.push({
            incident_id: d.incident.id,
            incident_name: d.incident.name,
            quantity: d.quantity,
          });
          remaining -= d.quantity;
        } else if (remaining > 0) {
          served.push({
            incident_id: d.incident.id,
            incident_name: d.incident.name,
            quantity: remaining,
          });
          deferred.push({
            incident_id: d.incident.id,
            incident_name: d.incident.name,
            shortfall: d.quantity - remaining,
          });
          remaining = 0;
        } else {
          deferred.push({
            incident_id: d.incident.id,
            incident_name: d.incident.name,
            shortfall: d.quantity,
          });
        }
      }

      const topServed = served.map((s) => s.incident_name).join(', ') || 'None';
      const topDeferred = deferred.map((d) => d.incident_name).join(', ') || 'None';

      const recommendedResolution =
        `Deterministic priority rule: Allocate ${available} available ${type}(s) to highest-priority incident(s) [${topServed}], ` +
        `deferring demand from [${topDeferred}] until units are freed or reinforced.`;

      conflicts.push({
        resource_type: type,
        required: totalRequired,
        available,
        shortage: totalRequired - available,
        competing_incidents: demands.map((d) => ({
          incident_id: d.incident.id,
          incident_code: d.incident.code,
          incident_name: d.incident.name,
          quantity: d.quantity,
          priority_score: d.incident.priority_score,
        })),
        recommended_resolution: recommendedResolution,
        served,
        deferred,
      });
    }
  }

  return conflicts;
}
