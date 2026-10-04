import { callGeminiJson } from './geminiClient.js';
import { PROMPTS } from './prompts.js';
import { RelatedReportsSchema, RelatedReportsZod } from './schemas.js';
import { tokenJaccardSimilarity } from '../logic/fusion.js';

export interface RelatedReportsResult {
  same_incident: boolean;
  similarity: number;
  reasoning: string;
}

/**
 * Assesses whether two reports correspond to the same emergency incident.
 */
export async function evaluateRelatedReports(
  reportText: string,
  candidateSummary: string
): Promise<RelatedReportsResult> {
  const geminiRes = await callGeminiJson<RelatedReportsZod>(
    PROMPTS.relatedReports(reportText, candidateSummary)
  );

  if (geminiRes.ok && geminiRes.data) {
    const parsed = RelatedReportsSchema.safeParse(geminiRes.data);
    if (parsed.success) {
      return parsed.data;
    }
  }

  // Fallback to token Jaccard similarity
  const sim = tokenJaccardSimilarity(reportText, candidateSummary);
  const isSame = sim >= 0.45;
  return {
    same_incident: isSame,
    similarity: sim,
    reasoning: isSame
      ? `Textual similarity score (${sim.toFixed(2)}) indicates overlapping emergency context.`
      : `Distinct linguistic profile (${sim.toFixed(2)}) suggests a separate hazard event.`,
  };
}
