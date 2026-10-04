import {
  Incident,
  Report,
  ExtractedReportData,
  IncidentReportRelation,
  ResourceRequirement,
} from '../../types/index.js';
import {
  haversineDistanceKm,
  matchGazetteerLocation,
} from './geo.js';

/**
 * Computes token-set Jaccard similarity between two texts.
 */
export function tokenJaccardSimilarity(textA: string, textB: string): number {
  const tokenize = (t: string) =>
    new Set(
      t
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );

  const setA = tokenize(textA);
  const setB = tokenize(textB);

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection++;
    }
  }

  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : Number((intersection / union).toFixed(3));
}

export interface FusionMatchResult {
  matchFound: boolean;
  targetIncidentId?: string;
  relation?: 'primary' | 'duplicate' | 'related';
  similarity: number;
  reasoning: string;
}

/**
 * Determines whether a new extracted report belongs to an existing incident.
 */
export function matchReportToIncidents(
  report: Report,
  extracted: ExtractedReportData,
  existingIncidents: Incident[]
): FusionMatchResult {
  let bestMatch: {
    incident: Incident;
    score: number;
    relation: 'duplicate' | 'related';
    reason: string;
  } | null = null;

  const reportLoc = matchGazetteerLocation(extracted.location || report.raw_text);

  for (const incident of existingIncidents) {
    // 1. Incident Type check
    const typeMatch = incident.type === extracted.incident_type;

    // 2. Spatial proximity check
    let distanceKm = Infinity;
    let locationMatch = false;

    if (reportLoc) {
      distanceKm = haversineDistanceKm(reportLoc.lat, reportLoc.lng, incident.lat, incident.lng);
      locationMatch = distanceKm <= 1.5;
    } else {
      // Name string match
      const normReport = extracted.location.toLowerCase();
      const normInc = incident.location_name.toLowerCase();
      locationMatch = normReport.includes(normInc) || normInc.includes(normReport);
    }

    // 3. Text Jaccard similarity
    const textSim = tokenJaccardSimilarity(report.raw_text, incident.summary);

    // Compute composite match score
    let score = 0;
    if (typeMatch) score += 0.40;
    if (locationMatch) score += 0.40;
    score += textSim * 0.20;

    if (typeMatch && locationMatch) {
      const isDuplicate = textSim > 0.45 || (distanceKm < 0.5 && typeMatch);
      const relation = isDuplicate ? 'duplicate' : 'related';
      const reason = isDuplicate
        ? `High spatial proximity (${distanceKm.toFixed(1)} km) and matching incident type (${incident.type}) with corroborated report text.`
        : `Co-located in ${incident.location_name} with shared hazard characteristics.`;

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { incident, score, relation, reason };
      }
    } else if (textSim > 0.65) {
      // Strong text similarity even if place wording was slightly alternate
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          incident,
          score,
          relation: 'related',
          reason: `High textual similarity (${textSim.toFixed(2)}) indicating shared context.`,
        };
      }
    }
  }

  if (bestMatch && bestMatch.score >= 0.65) {
    return {
      matchFound: true,
      targetIncidentId: bestMatch.incident.id,
      relation: bestMatch.relation,
      similarity: Number(bestMatch.score.toFixed(2)),
      reasoning: bestMatch.reason,
    };
  }

  return {
    matchFound: false,
    similarity: 0,
    reasoning: 'Distinct event type or distinct geographical zone; created standalone incident.',
  };
}

/**
 * Merges a newly incoming report into an existing incident using deterministic max-merge rules.
 */
export function mergeReportIntoIncident(
  incident: Incident,
  report: Report,
  extracted: ExtractedReportData,
  match: FusionMatchResult
): { updatedIncident: Incident; relationRecord: IncidentReportRelation } {
  // People affected is max across reports (prevent false inflation from duplicates)
  const mergedPeople = Math.max(incident.people_affected, extracted.people_affected || 0);

  // Union required resources taking max per type
  const resourceMap = new Map<string, number>();
  for (const r of incident.required_resources || []) {
    resourceMap.set(r.type, Math.max(resourceMap.get(r.type) || 0, r.quantity));
  }
  for (const r of extracted.required_resources || []) {
    resourceMap.set(r.type, Math.max(resourceMap.get(r.type) || 0, r.quantity));
  }
  const mergedResources: ResourceRequirement[] = Array.from(resourceMap.entries()).map(
    ([type, quantity]) => ({ type: type as any, quantity })
  );

  // Confidence increases slightly with corroborating reports, capped at 0.99
  const newConfidence = Number(Math.min(0.99, incident.confidence + 0.04).toFixed(2));

  // Medical urgency / urgency takes maximum observed
  const mergedMedicalUrgency = Math.max(incident.medical_urgency, extracted.medical_urgency || 0);
  const mergedUrgency = Math.max(incident.urgency, extracted.urgency || 0);

  // Severity upgrades if a corroborating report indicates higher danger
  const severityOrder = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const curIdx = severityOrder.indexOf(incident.severity);
  const newIdx = severityOrder.indexOf(extracted.severity);
  const mergedSeverity = (newIdx > curIdx ? extracted.severity : incident.severity) as Incident['severity'];

  const updatedIncident: Incident = {
    ...incident,
    people_affected: mergedPeople,
    required_resources: mergedResources,
    confidence: newConfidence,
    medical_urgency: mergedMedicalUrgency,
    urgency: mergedUrgency,
    severity: mergedSeverity,
    report_count: incident.report_count + 1,
    summary: `${incident.summary} (Corroborated by ${report.source} report: "${report.raw_text.slice(0, 80)}...")`,
    updated_at: new Date().toISOString(),
  };

  const relationRecord: IncidentReportRelation = {
    incident_id: incident.id,
    report_id: report.id,
    relation: match.relation || 'related',
    similarity: match.similarity,
    reasoning: match.reasoning,
  };

  return { updatedIncident, relationRecord };
}
