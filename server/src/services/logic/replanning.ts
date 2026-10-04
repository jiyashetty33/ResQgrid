import crypto from 'crypto';
import {
  Incident,
  Resource,
  Allocation,
  AllocationPlanResult,
  ReplanDiff,
  ReplanTriggerType,
  ReplanningEvent,
} from '../../types/index.js';
import { calculatePriorityScore } from './priority.js';
import { runAllocation } from './allocation.js';
import { GAZETTEER } from './geo.js';

export interface ReplanTriggerPayload {
  trigger: ReplanTriggerType;
  params?: Record<string, any>;
  replanThreshold?: number; // default 15
}

export interface ReplanExecutionResult {
  event: ReplanningEvent;
  updatedIncidents: Incident[];
  updatedResources: Resource[];
  beforePlan: AllocationPlanResult;
  afterPlan: AllocationPlanResult;
}

/**
 * Computes exact diff between before and after allocation plans
 */
export function computePlanDiff(
  beforeAllocations: Allocation[],
  afterAllocations: Allocation[],
  incidents: Incident[],
  resources: Resource[]
): ReplanDiff {
  const incMap = new Map(incidents.map((i) => [i.id, i.name]));
  const resMap = new Map(resources.map((r) => [r.id, r]));

  // Map resourceId -> Allocation in before plan
  const beforeByResource = new Map<string, Allocation>();
  for (const a of beforeAllocations) {
    beforeByResource.set(a.resource_id, a);
  }

  // Map resourceId -> Allocation in after plan
  const afterByResource = new Map<string, Allocation>();
  for (const a of afterAllocations) {
    afterByResource.set(a.resource_id, a);
  }

  const kept: Allocation[] = [];
  const moved: ReplanDiff['moved'] = [];
  const added: Allocation[] = [];
  const removed: Allocation[] = [];

  for (const a of afterAllocations) {
    const prev = beforeByResource.get(a.resource_id);
    if (!prev) {
      added.push(a);
    } else if (prev.incident_id === a.incident_id) {
      kept.push(a);
    } else {
      // Reassigned to another incident!
      const res = resMap.get(a.resource_id);
      moved.push({
        resource_id: a.resource_id,
        resource_name: res?.name || 'Resource Unit',
        resource_code: res?.code || 'RES',
        from_incident_id: prev.incident_id,
        from_incident_name: incMap.get(prev.incident_id) || 'Previous Site',
        to_incident_id: a.incident_id,
        to_incident_name: incMap.get(a.incident_id) || 'New Critical Site',
        quantity: a.quantity,
        reason: `Reassigned due to higher priority delta (priority score: ${a.priority_score} vs prev: ${prev.priority_score}).`,
      });
    }
  }

  for (const b of beforeAllocations) {
    if (!afterByResource.has(b.resource_id)) {
      removed.push(b);
    }
  }

  return {
    kept,
    moved,
    added,
    removed,
    unmet: [],
  };
}

/**
 * Executes a deterministic replanning cycle for any supported trigger.
 */
export function executeReplanning(
  triggerPayload: ReplanTriggerPayload,
  currentIncidents: Incident[],
  currentResources: Resource[],
  currentAllocations: Allocation[],
  replanThreshold: number = 15
): ReplanExecutionResult {
  const trigger = triggerPayload.trigger;
  const threshold = triggerPayload.replanThreshold ?? replanThreshold;

  // 1. Snapshot current before_plan
  const beforePlan: AllocationPlanResult = {
    plan_id: currentAllocations[0]?.plan_id || crypto.randomUUID(),
    plan_version: currentAllocations[0]?.plan_version || 1,
    allocations: [...currentAllocations],
    conflicts: [],
    unmet: [],
  };

  // Deep clone mutable entities
  let incidents: Incident[] = JSON.parse(JSON.stringify(currentIncidents));
  let resources: Resource[] = JSON.parse(JSON.stringify(currentResources));

  let triggerDescription = '';
  let weatherWorsened = false;

  // 2. Apply trigger mutation
  switch (trigger) {
    case 'hospital_power_failure': {
      triggerDescription =
        'Sudden total grid failure at City Hospital ICU. Critical infrastructure alert raised.';
      const hospitalLoc = GAZETTEER.hospital;
      const existingHosp = incidents.find((i) => i.name.includes('City Hospital'));

      if (existingHosp) {
        existingHosp.severity = 'CRITICAL';
        existingHosp.is_critical_infrastructure = true;
        existingHosp.medical_urgency = 95;
        existingHosp.urgency = 95;
        existingHosp.people_affected = 120;
        existingHosp.required_resources = [
          { type: 'generator', quantity: 1 },
          { type: 'medical_team', quantity: 1 },
        ];
      } else {
        const priorityCalc = calculatePriorityScore({
          severity: 'CRITICAL',
          people_affected: 120,
          medical_urgency: 95,
          urgency: 95,
          lat: hospitalLoc.lat,
          lng: hospitalLoc.lng,
          confidence: 0.98,
          is_critical_infrastructure: true,
        });

        incidents.unshift({
          id: crypto.randomUUID(),
          code: 'INC-HOSP',
          name: 'Hospital Power Failure – City Hospital Kadri',
          type: 'infrastructure',
          location_name: hospitalLoc.name,
          lat: hospitalLoc.lat,
          lng: hospitalLoc.lng,
          people_affected: 120,
          severity: 'CRITICAL',
          urgency: 95,
          medical_urgency: 95,
          is_critical_infrastructure: true,
          confidence: 0.98,
          required_resources: [
            { type: 'generator', quantity: 1 },
            { type: 'medical_team', quantity: 1 },
          ],
          status: 'new',
          priority_score: priorityCalc.score,
          priority_breakdown: priorityCalc.breakdown,
          summary:
            'Critical power failure threatening ventilator and ICU operations at City Hospital Kadri. Requires urgent backup generator and clinical response team.',
          report_count: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      break;
    }

    case 'boat_unavailable': {
      triggerDescription =
        'Rescue Boat BOAT-01 encountered engine damage and is declared UNAVAILABLE.';
      // Find boat BOAT-01 or currently assigned boat
      const boat = resources.find((r) => r.type === 'boat' && r.status === 'AVAILABLE') || resources.find((r) => r.type === 'boat');
      if (boat) {
        boat.status = 'UNAVAILABLE';
        boat.available_quantity = 0;
      }
      break;
    }

    case 'new_flood_incident': {
      triggerDescription =
        'Flash flood breached embankment in Mangaladevi lowlands; 80 trapped residents reported.';
      const loc = GAZETTEER.mangaladevi;
      const priorityCalc = calculatePriorityScore({
        severity: 'HIGH',
        people_affected: 80,
        medical_urgency: 60,
        urgency: 85,
        lat: loc.lat,
        lng: loc.lng,
        confidence: 0.9,
        is_critical_infrastructure: false,
      });

      incidents.unshift({
        id: crypto.randomUUID(),
        code: `INC-${Math.floor(100 + Math.random() * 900)}`,
        name: 'Flash Flood Embankment Breach – Mangaladevi',
        type: 'flood',
        location_name: loc.name,
        lat: loc.lat,
        lng: loc.lng,
        people_affected: 80,
        severity: 'HIGH',
        urgency: 85,
        medical_urgency: 60,
        is_critical_infrastructure: false,
        confidence: 0.9,
        required_resources: [
          { type: 'boat', quantity: 1 },
          { type: 'food_kit', quantity: 50 },
        ],
        status: 'new',
        priority_score: priorityCalc.score,
        priority_breakdown: priorityCalc.breakdown,
        summary: 'Rapid water level increase following embankment collapse near Mangaladevi.',
        report_count: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      break;
    }

    case 'population_increase': {
      triggerDescription =
        'Surge in stranded population (+80%) reported at primary flood sector.';
      const topFlood = incidents.find((i) => i.type === 'flood');
      if (topFlood) {
        topFlood.people_affected = Math.round(topFlood.people_affected * 1.8);
        for (const req of topFlood.required_resources) {
          if (req.type === 'food_kit' || req.type === 'water_kit') {
            req.quantity = Math.round(req.quantity * 1.8);
          }
        }
      }
      break;
    }

    case 'weather_worsens': {
      weatherWorsened = true;
      triggerDescription =
        'Severe squall warning issued. Water travel speeds reduced by 25%, urgency increased across all water zones.';
      for (const inc of incidents) {
        if (inc.type === 'flood' || inc.type === 'storm') {
          inc.urgency = Math.min(100, inc.urgency + 15);
          if (inc.severity === 'MEDIUM') inc.severity = 'HIGH';
          else if (inc.severity === 'HIGH') inc.severity = 'CRITICAL';
        }
      }
      break;
    }

    case 'monitor_detected_change': {
      triggerDescription =
        'Automatic monitor detected resource state mutation or priority divergence exceeding replan threshold.';
      break;
    }
  }

  // 3. Recompute priority scores for all non-resolved incidents
  for (const inc of incidents) {
    if (inc.status !== 'resolved') {
      const calc = calculatePriorityScore({
        severity: inc.severity,
        people_affected: inc.people_affected,
        medical_urgency: inc.medical_urgency,
        urgency: inc.urgency,
        lat: inc.lat,
        lng: inc.lng,
        confidence: inc.confidence,
        is_critical_infrastructure: inc.is_critical_infrastructure,
      });
      inc.priority_score = calc.score;
      inc.priority_breakdown = calc.breakdown;
    }
  }

  // 4. Identify locked resources
  // A resource is locked if it's already dispatched or in-transit, UNLESS:
  // - the resource itself became UNAVAILABLE
  // - OR a new incident outranks its current incident by >= threshold and resource is not in-transit
  const lockedResourceIds = new Set<string>();
  const topIncidentScore = Math.max(...incidents.map((i) => i.priority_score));

  for (const r of resources) {
    if (r.status === 'UNAVAILABLE') {
      continue; // Never locked as available
    }

    const currentAssigned = currentAllocations.find((a) => a.resource_id === r.id);
    if (currentAssigned) {
      const scoreDiff = topIncidentScore - currentAssigned.priority_score;
      if (scoreDiff >= threshold && r.status !== 'IN_TRANSIT') {
        // Eligible for reassignment! Resource is freed up for reassignment
        r.status = 'AVAILABLE';
        r.available_quantity = r.total_quantity;
      } else if (r.status === 'IN_TRANSIT') {
        lockedResourceIds.add(r.id);
      }
    }
  }

  // 5. Re-run allocator and conflict detection
  const newPlanVersion = (beforePlan.plan_version || 1) + 1;
  const afterPlan = runAllocation(incidents, resources, {
    planId: crypto.randomUUID(),
    planVersion: newPlanVersion,
    lockedResourceIds,
    weatherWorsened,
  });

  // 6. Compute plan diff
  const diff = computePlanDiff(beforePlan.allocations, afterPlan.allocations, incidents, resources);
  diff.unmet = afterPlan.unmet;

  // 7. Deterministic template explanation
  let templateExplanation = '';
  if (diff.moved.length > 0) {
    const movedSummaries = diff.moved
      .map(
        (m) =>
          `${m.resource_name} moved from "${m.from_incident_name}" to higher-priority "${m.to_incident_name}"`
      )
      .join('; ');
    templateExplanation = `Replanning triggered by ${trigger.replace(/_/g, ' ')}. ${movedSummaries}. Pre-existing lower priority requirements were deferred.`;
  } else if (diff.added.length > 0) {
    templateExplanation = `Replanning initiated by ${trigger.replace(/_/g, ' ')}. Successfully allocated ${diff.added.length} additional unit(s) without displacing existing critical dispatches.`;
  } else if (diff.removed.length > 0) {
    templateExplanation = `Replanning adjusted capacity following ${trigger.replace(/_/g, ' ')}. ${diff.removed.length} unit(s) de-allocated due to resource status change.`;
  } else {
    templateExplanation = `System re-evaluated state for ${trigger.replace(/_/g, ' ')}. Existing allocations maintain optimal priority coverage.`;
  }

  const event: ReplanningEvent = {
    id: crypto.randomUUID(),
    trigger_type: trigger,
    trigger_description: triggerDescription,
    trigger_payload: triggerPayload.params,
    before_plan: beforePlan,
    after_plan: afterPlan,
    diff,
    conflicts: afterPlan.conflicts,
    ai_explanation: templateExplanation,
    status: 'pending_approval',
    created_at: new Date().toISOString(),
  };

  return {
    event,
    updatedIncidents: incidents,
    updatedResources: resources,
    beforePlan,
    afterPlan,
  };
}
