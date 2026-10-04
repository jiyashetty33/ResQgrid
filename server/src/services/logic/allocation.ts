import crypto from 'crypto';
import {
  Incident,
  Resource,
  ResourceType,
  Allocation,
  ResourceShortfall,
  AllocationPlanResult,
} from '../../types/index.js';
import {
  haversineDistanceKm,
  calculateEtaMinutes,
} from './geo.js';
import { detectConflicts } from './conflicts.js';

export interface AllocationOptions {
  planId?: string;
  planVersion?: number;
  lockedResourceIds?: Set<string>;
  weatherWorsened?: boolean;
}

const BULK_TYPES: Set<ResourceType> = new Set(['food_kit', 'water_kit', 'volunteer']);

/**
 * Deterministic Allocation Algorithm:
 * 1. Sort incidents by priority_score descending.
 * 2. Discrete resources: Assign nearest available units up to required quantity.
 * 3. Bulk resources: Assign with priority-weighted fair share when demand exceeds supply.
 * 4. Never assign UNAVAILABLE or locked resources.
 * 5. Track unmet demand and supply conflicts.
 */
export function runAllocation(
  incidents: Incident[],
  resources: Resource[],
  options: AllocationOptions = {}
): AllocationPlanResult {
  const planId = options.planId || crypto.randomUUID();
  const planVersion = options.planVersion || 1;
  const lockedIds = options.lockedResourceIds || new Set<string>();
  const weatherWorsened = options.weatherWorsened || false;

  // Filter active incidents and sort by priority score descending
  const sortedIncidents = incidents
    .filter((inc) => inc.status !== 'resolved')
    .sort((a, b) => b.priority_score - a.priority_score);

  // Clone resources state for allocation simulation
  const pool = resources.map((r) => ({
    ...r,
    available_quantity:
      r.status === 'AVAILABLE' && !lockedIds.has(r.id) ? r.available_quantity : 0,
  }));

  const allocations: Allocation[] = [];
  const unmet: ResourceShortfall[] = [];

  // Group demands by resource type for bulk fair-share pre-calculation
  const bulkDemand = new Map<ResourceType, { incident: Incident; requested: number }[]>();
  for (const inc of sortedIncidents) {
    for (const req of inc.required_resources || []) {
      if (BULK_TYPES.has(req.type) && req.quantity > 0) {
        const list = bulkDemand.get(req.type) || [];
        list.push({ incident: inc, requested: req.quantity });
        bulkDemand.set(req.type, list);
      }
    }
  }

  // Pre-calculate bulk allocations per incident if demand exceeds supply
  const bulkAssigned = new Map<string, Map<ResourceType, number>>(); // incidentId -> Map<ResourceType, quantity>

  for (const [bType, demands] of bulkDemand.entries()) {
    const totalRequired = demands.reduce((sum, d) => sum + d.requested, 0);
    const availableTotal = pool
      .filter((r) => r.type === bType)
      .reduce((sum, r) => sum + r.available_quantity, 0);

    if (totalRequired <= availableTotal) {
      // Full fulfillment for all
      for (const d of demands) {
        if (!bulkAssigned.has(d.incident.id)) {
          bulkAssigned.set(d.incident.id, new Map());
        }
        bulkAssigned.get(d.incident.id)!.set(bType, d.requested);
      }
    } else {
      // Priority-weighted fair share:
      // Guarantee top half of sorted incidents their full or majority need, split remainder proportionally
      let poolLeft = availableTotal;
      for (let i = 0; i < demands.length; i++) {
        const d = demands[i];
        if (!bulkAssigned.has(d.incident.id)) {
          bulkAssigned.set(d.incident.id, new Map());
        }

        if (poolLeft <= 0) {
          bulkAssigned.get(d.incident.id)!.set(bType, 0);
          continue;
        }

        // Higher priority incidents get higher share
        const incidentRank = i; // 0 is highest priority
        let share = 0;
        if (incidentRank === 0) {
          // Highest priority gets min(requested, poolLeft)
          share = Math.min(d.requested, poolLeft);
        } else if (incidentRank === 1 && poolLeft >= d.requested * 0.7) {
          share = Math.min(d.requested, Math.floor(poolLeft * 0.6));
        } else {
          // Proportional share of what's left
          const remainingDemand = demands.slice(i).reduce((acc, curr) => acc + curr.requested, 0);
          const ratio = remainingDemand > 0 ? d.requested / remainingDemand : 1;
          share = Math.min(d.requested, Math.floor(poolLeft * ratio));
        }

        bulkAssigned.get(d.incident.id)!.set(bType, share);
        poolLeft -= share;
      }
    }
  }

  // Now perform actual unit assignments
  for (const incident of sortedIncidents) {
    for (const req of incident.required_resources || []) {
      const { type, quantity: requestedQty } = req;
      if (requestedQty <= 0) continue;

      if (BULK_TYPES.has(type)) {
        // Bulk assignment
        const plannedQty = bulkAssigned.get(incident.id)?.get(type) ?? 0;
        let qtyToAssign = plannedQty;

        // Find available bulk resource pool items
        const bulkItems = pool.filter((r) => r.type === type && r.available_quantity > 0);

        for (const item of bulkItems) {
          if (qtyToAssign <= 0) break;
          const take = Math.min(item.available_quantity, qtyToAssign);
          item.available_quantity -= take;
          qtyToAssign -= take;

          const distanceKm = haversineDistanceKm(incident.lat, incident.lng, item.lat, item.lng);
          const eta = calculateEtaMinutes(distanceKm, type, weatherWorsened);

          allocations.push({
            id: crypto.randomUUID(),
            plan_id: planId,
            plan_version: planVersion,
            incident_id: incident.id,
            resource_id: item.id,
            quantity: take,
            priority_score: incident.priority_score,
            distance_km: distanceKm,
            eta_minutes: eta,
            reason: `Bulk provision (${take} units) allocated from ${item.location_name} to priority #${incident.priority_score} site.`,
            status: 'proposed',
            is_current: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }

        const shortfall = requestedQty - (plannedQty - qtyToAssign);
        if (shortfall > 0) {
          unmet.push({
            incident_id: incident.id,
            incident_code: incident.code,
            incident_name: incident.name,
            type,
            shortfall,
          });
        }
      } else {
        // Discrete resource assignment (boat, ambulance, generator, etc.)
        let needed = requestedQty;

        // Find all available matching resources sorted by distance to this incident
        const availableUnits = pool
          .filter((r) => r.type === type && r.available_quantity > 0)
          .map((r) => ({
            resource: r,
            distanceKm: haversineDistanceKm(incident.lat, incident.lng, r.lat, r.lng),
          }))
          .sort((a, b) => a.distanceKm - b.distanceKm);

        for (const unit of availableUnits) {
          if (needed <= 0) break;
          const assignQty = Math.min(unit.resource.available_quantity, needed);
          unit.resource.available_quantity -= assignQty;
          needed -= assignQty;

          const eta = calculateEtaMinutes(unit.distanceKm, type, weatherWorsened);

          allocations.push({
            id: crypto.randomUUID(),
            plan_id: planId,
            plan_version: planVersion,
            incident_id: incident.id,
            resource_id: unit.resource.id,
            quantity: assignQty,
            priority_score: incident.priority_score,
            distance_km: unit.distanceKm,
            eta_minutes: eta,
            reason: `Nearest available ${type} unit (${unit.resource.name}) at ${unit.distanceKm} km with ${eta}m estimated arrival.`,
            status: 'proposed',
            is_current: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }

        if (needed > 0) {
          unmet.push({
            incident_id: incident.id,
            incident_code: incident.code,
            incident_name: incident.name,
            type,
            shortfall: needed,
          });
        }
      }
    }
  }

  const conflicts = detectConflicts(incidents, resources);

  return {
    plan_id: planId,
    plan_version: planVersion,
    allocations,
    conflicts,
    unmet,
  };
}
