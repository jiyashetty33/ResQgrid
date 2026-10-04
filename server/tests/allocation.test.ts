import { describe, it, expect } from 'vitest';
import { runAllocation } from '../src/services/logic/allocation.js';
import { buildInitialIncidents, INITIAL_RESOURCES } from '../src/db/seedData.js';

describe('Allocation Engine', () => {
  it('should allocate nearest available discrete units without exceeding pool', () => {
    const incidents = buildInitialIncidents();
    const resources = JSON.parse(JSON.stringify(INITIAL_RESOURCES));

    const plan = runAllocation(incidents, resources);

    expect(plan.allocations.length).toBeGreaterThan(0);

    // Verify no single boat is allocated more than available
    const boatAllocations = plan.allocations.filter((a) => {
      const res = resources.find((r: any) => r.id === a.resource_id);
      return res?.type === 'boat';
    });
    expect(boatAllocations.length).toBeLessThanOrEqual(2);

    // Verify reason and ETA calculated
    for (const a of plan.allocations) {
      expect(a.eta_minutes).toBeGreaterThanOrEqual(10);
      expect(a.distance_km).toBeGreaterThanOrEqual(0);
      expect(a.reason).toBeDefined();
    }
  });

  it('should prioritize higher score incidents when resources are contested', () => {
    const incidents = buildInitialIncidents();
    const resources = JSON.parse(JSON.stringify(INITIAL_RESOURCES));

    const plan = runAllocation(incidents, resources);

    // Generator should go to INC-C initially
    const genAlloc = plan.allocations.find((a) => {
      const r = resources.find((res: any) => res.id === a.resource_id);
      return r?.type === 'generator';
    });
    expect(genAlloc).toBeDefined();
    expect(genAlloc?.incident_id).toBe('inc-003'); // Jeppu
  });

  it('should fair-share bulk resources proportionally', () => {
    const incidents = buildInitialIncidents();
    const resources = JSON.parse(JSON.stringify(INITIAL_RESOURCES));

    const plan = runAllocation(incidents, resources);

    const foodAllocations = plan.allocations.filter((a) => {
      const r = resources.find((res: any) => res.id === a.resource_id);
      return r?.type === 'food_kit';
    });

    const totalFoodAssigned = foodAllocations.reduce((sum, a) => sum + a.quantity, 0);
    expect(totalFoodAssigned).toBeLessThanOrEqual(500);
  });
});
