import { describe, it, expect } from 'vitest';
import { calculatePriorityScore } from '../src/services/logic/priority.js';
import { GAZETTEER } from '../src/services/logic/geo.js';

describe('Priority Scoring Logic', () => {
  it('should compute transparent 0-100 priority score with factor breakdown', () => {
    const ullal = GAZETTEER.ullal;
    const result = calculatePriorityScore({
      severity: 'HIGH',
      people_affected: 150,
      medical_urgency: 40,
      urgency: 75,
      lat: ullal.lat,
      lng: ullal.lng,
      confidence: 0.95,
      is_critical_infrastructure: false,
    });

    expect(result.score).toBeGreaterThan(50);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.breakdown).toHaveLength(6);
    expect(result.reason).toContain('Driven primarily by');

    // Verify weights sum to 1.00
    const totalWeight = result.breakdown.reduce((sum, item) => sum + item.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 2);
  });

  it('should apply critical infrastructure bonus and cap at 100', () => {
    const hosp = GAZETTEER.hospital;
    const result = calculatePriorityScore({
      severity: 'CRITICAL',
      people_affected: 200,
      medical_urgency: 95,
      urgency: 95,
      lat: hosp.lat,
      lng: hosp.lng,
      confidence: 0.99,
      is_critical_infrastructure: true,
    });

    expect(result.score).toBeGreaterThan(90);
    expect(result.breakdown.some((b) => b.factor.includes('Critical Infrastructure'))).toBe(true);
    expect(result.reason).toContain('Critical infrastructure');
  });

  it('should score low severity minor incidents appropriately', () => {
    const pumpwell = GAZETTEER.pumpwell;
    const result = calculatePriorityScore({
      severity: 'LOW',
      people_affected: 5,
      medical_urgency: 0,
      urgency: 20,
      lat: pumpwell.lat,
      lng: pumpwell.lng,
      confidence: 0.8,
      is_critical_infrastructure: false,
    });

    expect(result.score).toBeLessThan(45);
  });
});
