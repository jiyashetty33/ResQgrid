import { describe, it, expect } from 'vitest';
import { executeReplanning } from '../src/services/logic/replanning.js';
import { runAllocation } from '../src/services/logic/allocation.js';
import { buildInitialIncidents, INITIAL_RESOURCES } from '../src/db/seedData.js';

describe('Dynamic Replanning Engine', () => {
  it('should reassign generator from Jeppu to City Hospital on power failure', () => {
    const incidents = buildInitialIncidents();
    const resources = JSON.parse(JSON.stringify(INITIAL_RESOURCES));

    // Baseline allocation
    const baselinePlan = runAllocation(incidents, resources);

    // Initial check: generator should be allocated to Jeppu
    const initialGen = baselinePlan.allocations.find((a) => {
      const res = resources.find((r: any) => r.id === a.resource_id);
      return res?.type === 'generator';
    });
    expect(initialGen).toBeDefined();
    expect(initialGen?.incident_id).toBe('inc-003'); // Jeppu

    // Trigger replan: hospital_power_failure
    const result = executeReplanning(
      { trigger: 'hospital_power_failure' },
      incidents,
      resources,
      baselinePlan.allocations,
      15 // threshold
    );

    // The hospital incident should now be created / upgraded
    const hosp = result.updatedIncidents.find((i) => i.name.includes('City Hospital'));
    expect(hosp).toBeDefined();
    expect(hosp?.severity).toBe('CRITICAL');
    expect(hosp?.priority_score).toBeGreaterThan(85);

    // In the after plan, generator should now be moved to City Hospital
    const afterGen = result.afterPlan.allocations.find((a) => {
      const res = result.updatedResources.find((r: any) => r.id === a.resource_id);
      return res?.type === 'generator';
    });
    expect(afterGen?.incident_id).toBe(hosp?.id);

    // Diff should explicitly record GEN-01 being moved
    expect(result.event.diff.moved.length).toBeGreaterThan(0);
    const movedGen = result.event.diff.moved.find((m) => m.resource_name.includes('Generator'));
    expect(movedGen).toBeDefined();
    expect(movedGen?.from_incident_name).toContain('Jeppu');
    expect(movedGen?.to_incident_name).toContain('City Hospital');

    // Explanation should contain the reason
    expect(result.event.ai_explanation).toContain('Generator');
  });

  it('should handle boat becoming unavailable and reallocate accordingly', () => {
    const incidents = buildInitialIncidents();
    const resources = JSON.parse(JSON.stringify(INITIAL_RESOURCES));

    const baselinePlan = runAllocation(incidents, resources);

    const result = executeReplanning(
      { trigger: 'boat_unavailable' },
      incidents,
      resources,
      baselinePlan.allocations,
      15
    );

    // One boat should now be UNAVAILABLE
    const boats = result.updatedResources.filter((r) => r.type === 'boat');
    const unavailableBoat = boats.find((b) => b.status === 'UNAVAILABLE');
    expect(unavailableBoat).toBeDefined();

    // After plan should have at most 1 boat allocated
    const allocatedBoats = result.afterPlan.allocations.filter((a) => {
      const res = result.updatedResources.find((r) => r.id === a.resource_id);
      return res?.type === 'boat';
    });
    expect(allocatedBoats.length).toBeLessThanOrEqual(1);
  });
});
