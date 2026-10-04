import { Severity, PriorityResult, PriorityBreakdownItem } from '../../types/index.js';
import { distanceToNearestDepot } from './geo.js';

export interface PriorityCalculationInput {
  severity: Severity;
  people_affected: number;
  medical_urgency: number; // 0-100
  urgency: number; // 0-100
  lat: number;
  lng: number;
  confidence: number; // 0-1
  is_critical_infrastructure: boolean;
}

const SEVERITY_SCORES: Record<Severity, number> = {
  LOW: 25,
  MEDIUM: 50,
  HIGH: 75,
  CRITICAL: 100,
};

/**
 * Deterministic Priority Scoring (0-100)
 *
 * Formula:
 * score = 0.30*severityScore + 0.20*peopleScore + 0.20*medicalScore + 0.15*urgencyScore + 0.10*accessScore + 0.05*confidenceScore
 * if is_critical_infrastructure: score = min(100, score + 10)
 */
export function calculatePriorityScore(input: PriorityCalculationInput): PriorityResult {
  const severityScore = SEVERITY_SCORES[input.severity] ?? 50;

  // log10(people+1) normalized against log10(1001) ~ 3.0004
  const people = Math.max(0, input.people_affected || 0);
  const peopleScore = Math.min(100, Math.round((100 * Math.log10(people + 1)) / Math.log10(1001)));

  const medicalScore = Math.max(0, Math.min(100, input.medical_urgency || 0));
  const urgencyScore = Math.max(0, Math.min(100, input.urgency || 0));

  const distanceKm = distanceToNearestDepot(input.lat, input.lng);
  const accessScore = Math.max(0, Math.round(100 - Math.min(100, distanceKm * 4)));

  const confidenceScore = Math.max(0, Math.min(100, Math.round((input.confidence || 0.8) * 100)));

  const breakdown: PriorityBreakdownItem[] = [
    {
      factor: 'Severity',
      weight: 0.30,
      value: severityScore,
      contribution: Number((0.30 * severityScore).toFixed(2)),
    },
    {
      factor: 'Affected Population',
      weight: 0.20,
      value: peopleScore,
      contribution: Number((0.20 * peopleScore).toFixed(2)),
    },
    {
      factor: 'Medical Urgency',
      weight: 0.20,
      value: medicalScore,
      contribution: Number((0.20 * medicalScore).toFixed(2)),
    },
    {
      factor: 'Time Urgency',
      weight: 0.15,
      value: urgencyScore,
      contribution: Number((0.15 * urgencyScore).toFixed(2)),
    },
    {
      factor: 'Depot Accessibility',
      weight: 0.10,
      value: accessScore,
      contribution: Number((0.10 * accessScore).toFixed(2)),
    },
    {
      factor: 'Information Confidence',
      weight: 0.05,
      value: confidenceScore,
      contribution: Number((0.05 * confidenceScore).toFixed(2)),
    },
  ];

  let rawScore = breakdown.reduce((sum, item) => sum + item.contribution, 0);

  if (input.is_critical_infrastructure) {
    const bonus = 10;
    rawScore = Math.min(100, rawScore + bonus);
    breakdown.push({
      factor: 'Critical Infrastructure Bonus',
      weight: 0,
      value: 100,
      contribution: bonus,
    });
  }

  const finalScore = Number(Math.min(100, Math.max(0, rawScore)).toFixed(1));

  // Build human-readable reason from the top two contributors
  const sortedFactors = [...breakdown]
    .filter((b) => b.weight > 0)
    .sort((a, b) => b.contribution - a.contribution);

  const top1 = sortedFactors[0];
  const top2 = sortedFactors[1];

  let reason = `Driven primarily by ${top1.factor.toLowerCase()} (${top1.value}/100) and ${top2.factor.toLowerCase()} (${top2.value}/100).`;
  if (input.is_critical_infrastructure) {
    reason = `Critical infrastructure site (+10 bonus); driven by ${top1.factor.toLowerCase()} (${top1.value}/100).`;
  }

  return {
    score: finalScore,
    breakdown,
    reason,
  };
}
