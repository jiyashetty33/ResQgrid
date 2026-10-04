import { Allocation, ReplanDiff, ResourceConflict } from '../../types/index.js';
import { callGeminiJson } from './geminiClient.js';
import { PROMPTS } from './prompts.js';
import { ExplanationSchema } from './schemas.js';

/**
 * Explains recommended allocation decisions for emergency coordinators.
 */
export async function explainAllocation(
  conflicts: ResourceConflict[],
  allocations: Allocation[]
): Promise<string> {
  const conflictSummary = conflicts.length > 0
    ? conflicts.map((c) => `${c.resource_type}: needed ${c.required}, available ${c.available}. Resolution: ${c.recommended_resolution}`).join('\n')
    : 'No resource contention detected. All requests satisfied.';

  const allocationsSummary = allocations
    .slice(0, 8)
    .map((a) => `${a.reason} (ETA: ${a.eta_minutes}m)`)
    .join('\n');

  const geminiRes = await callGeminiJson<{ explanation: string }>(
    PROMPTS.explainAllocation(conflictSummary, allocationsSummary)
  );

  if (geminiRes.ok && geminiRes.data) {
    const parsed = ExplanationSchema.safeParse(geminiRes.data);
    if (parsed.success && parsed.data.explanation) {
      return parsed.data.explanation;
    }
  }

  // Deterministic template fallback
  if (conflicts.length > 0) {
    const conflict = conflicts[0];
    const topServed = conflict.served.map((s) => s.incident_name).join(', ') || 'top-priority site';
    const topDeferred = conflict.deferred.map((d) => d.incident_name).join(', ') || 'lower-priority needs';
    return `Resource contention for ${conflict.resource_type}s resolved by prioritizing ${topServed} due to higher severity and population impact, while deferring ${topDeferred}.`;
  }

  return `All active resource allocations dispatched to nearest incidents based on transparent multi-factor priority scores.`;
}

/**
 * Explains dynamic replanning adjustments to coordinators.
 */
export async function explainReplan(
  triggerDescription: string,
  diff: ReplanDiff
): Promise<string> {
  const diffLines: string[] = [];

  for (const m of diff.moved) {
    diffLines.push(
      `Reassigned ${m.resource_name} from "${m.from_incident_name}" to "${m.to_incident_name}". ${m.reason}`
    );
  }
  for (const a of diff.added) {
    diffLines.push(`New allocation added: ${a.reason}`);
  }
  for (const r of diff.removed) {
    diffLines.push(`Resource allocation revoked: ${r.reason}`);
  }

  const diffSummary = diffLines.join('\n') || 'No resource movements required.';

  const geminiRes = await callGeminiJson<{ explanation: string }>(
    PROMPTS.explainReplan(triggerDescription, diffSummary)
  );

  if (geminiRes.ok && geminiRes.data) {
    const parsed = ExplanationSchema.safeParse(geminiRes.data);
    if (parsed.success && parsed.data.explanation) {
      return parsed.data.explanation;
    }
  }

  // Deterministic template fallback
  if (diff.moved.length > 0) {
    const moves = diff.moved
      .map((m) => `${m.resource_name} reassigned to ${m.to_incident_name} from ${m.from_incident_name}`)
      .join('; ');
    return `Replanning executed for "${triggerDescription}". ${moves} due to superior priority score.`;
  }

  return `Replanning evaluated for "${triggerDescription}". Maintained existing commitments with updated priority telemetry.`;
}
