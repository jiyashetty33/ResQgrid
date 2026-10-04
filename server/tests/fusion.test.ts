import { describe, it, expect } from 'vitest';
import {
  tokenJaccardSimilarity,
  matchReportToIncidents,
  mergeReportIntoIncident,
} from '../src/services/logic/fusion.js';
import { buildInitialIncidents } from '../src/db/seedData.js';
import { Report } from '../src/types/index.js';

describe('Incident Fusion & Deduplication', () => {
  it('should calculate accurate token Jaccard similarity', () => {
    const textA = 'Water entered school in Ullal, 150 people trapped';
    const textB = 'Flood victims stuck near Ullal school, 150 people';
    const textC = 'Fire broke out in Panambur port warehouse';

    const simAB = tokenJaccardSimilarity(textA, textB);
    const simAC = tokenJaccardSimilarity(textA, textC);

    expect(simAB).toBeGreaterThan(0.35);
    expect(simAC).toBeLessThan(0.15);
  });

  it('should match a duplicate report to the Ullal incident', () => {
    const incidents = buildInitialIncidents();
    const report: Report = {
      id: 'rpt-test-1',
      code: 'RPT-TEST',
      source: 'social',
      raw_text: 'Flood water rising fast near Government School in Ullal, kids trapped!',
      confidence: 0.9,
      is_duplicate: false,
      status: 'new',
      received_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const match = matchReportToIncidents(
      report,
      {
        incident_type: 'flood',
        location: 'Ullal',
        people_affected: 150,
        required_resources: [{ type: 'boat', quantity: 1 }],
        severity: 'HIGH',
        urgency: 80,
        medical_urgency: 40,
        is_critical_infrastructure: false,
        confidence: 0.9,
        summary: 'Flood at Ullal school',
      },
      incidents
    );

    expect(match.matchFound).toBe(true);
    expect(match.targetIncidentId).toBe('inc-001'); // Ullal
  });

  it('should merge report using max-merge for population and corroboration boost', () => {
    const incidents = buildInitialIncidents();
    const incA = incidents.find((i) => i.code === 'INC-A')!;
    const initialConfidence = incA.confidence;

    const report: Report = {
      id: 'rpt-merge',
      code: 'RPT-MERGE',
      source: 'ngo',
      raw_text: 'Red Cross confirms 220 people now trapped in Ullal school area.',
      confidence: 0.95,
      is_duplicate: true,
      status: 'new',
      received_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { updatedIncident } = mergeReportIntoIncident(
      incA,
      report,
      {
        incident_type: 'flood',
        location: 'Ullal',
        people_affected: 220,
        required_resources: [{ type: 'boat', quantity: 2 }],
        severity: 'HIGH',
        urgency: 85,
        medical_urgency: 45,
        is_critical_infrastructure: false,
        confidence: 0.95,
        summary: 'Red Cross update',
      },
      { matchFound: true, similarity: 0.8, reasoning: 'Corroborated by Red Cross' }
    );

    // Max merge people
    expect(updatedIncident.people_affected).toBe(220);
    // Report count incremented
    expect(updatedIncident.report_count).toBe(incA.report_count + 1);
    // Confidence boosted
    expect(updatedIncident.confidence).toBeGreaterThan(initialConfidence);
  });
});
