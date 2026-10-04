import { describe, it, expect } from 'vitest';
import { extractReportHeuristic } from '../src/services/ai/heuristicExtractor.js';

describe('Deterministic Heuristic Extractor', () => {
  it('should extract location, people count, and resources from flood report', () => {
    const raw = '150 people trapped near Government School in Ullal, ground floor flooded, water rising rapidly!';
    const result = extractReportHeuristic(raw);

    expect(result.incident_type).toBe('flood');
    expect(result.location).toBe('Ullal');
    expect(result.people_affected).toBe(150);
    expect(result.severity).toBe('HIGH');
    expect(result.required_resources.some((r) => r.type === 'boat')).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.85);
  });

  it('should detect critical medical infrastructure need', () => {
    const raw = 'Sudden power failure at City Hospital ICU Kadri, 120 patients on life support needing backup generator!';
    const result = extractReportHeuristic(raw);

    expect(result.is_critical_infrastructure).toBe(true);
    expect(result.severity).toBe('CRITICAL');
    expect(result.medical_urgency).toBeGreaterThan(80);
    expect(result.required_resources.some((r) => r.type === 'generator')).toBe(true);
  });

  it('should flag irrelevant non-disaster report with low confidence', () => {
    const raw = 'Huge discounts on raincoats and umbrellas this weekend at Mangalore City Mall! Sale ends Sunday!';
    const result = extractReportHeuristic(raw);

    expect(result.confidence).toBeLessThan(0.4);
  });
});
