import crypto from 'crypto';
import { Incident, Report, ResourceConflict } from '../../types/index.js';
import { callGeminiJson } from './geminiClient.js';
import { PROMPTS } from './prompts.js';
import { ExplanationSchema } from './schemas.js';

interface CachedSummary {
  hash: string;
  timestamp: number;
  text: string;
}

let summaryCache: CachedSummary | null = null;
const CACHE_TTL_MS = 20000; // 20 seconds cache

/**
 * Summarizes an incident given its source reports
 */
export async function summarizeIncident(
  incidentName: string,
  reports: Report[]
): Promise<string> {
  const combinedText = reports.map((r) => r.raw_text).join(' ');
  return `${incidentName}: Corroborated by ${reports.length} incoming reports. Key issues: ${combinedText.slice(0, 160)}...`;
}

/**
 * Generates dynamic high-level disaster situation summary with 20s caching.
 */
export async function generateSituationSummary(
  incidents: Incident[],
  conflicts: ResourceConflict[],
  stats: { totalReports: number; activeIncidents: number; criticalCount: number }
): Promise<string> {
  // Compute state hash
  const stateSignature = JSON.stringify({
    stats,
    incidents: incidents.map((i) => ({ id: i.id, p: i.priority_score, s: i.severity })),
    conflicts: conflicts.map((c) => ({ type: c.resource_type, short: c.shortage })),
  });
  const hash = crypto.createHash('md5').update(stateSignature).digest('hex');

  const now = Date.now();
  if (summaryCache && summaryCache.hash === hash && now - summaryCache.timestamp < CACHE_TTL_MS) {
    return summaryCache.text;
  }

  const statsText = `Total Reports: ${stats.totalReports} | Active Incidents: ${stats.activeIncidents} | Critical: ${stats.criticalCount}`;
  const activeIncidentsText = incidents
    .slice(0, 5)
    .map((i) => `[${i.code}] ${i.name} - ${i.severity} (Priority: ${i.priority_score})`)
    .join('; ');
  const conflictsText = conflicts.length > 0
    ? conflicts.map((c) => `${c.resource_type} shortage (${c.shortage} units)`).join(', ')
    : 'No active resource bottlenecks.';

  const geminiRes = await callGeminiJson<{ explanation: string }>(
    PROMPTS.situationSummary(statsText, activeIncidentsText, conflictsText)
  );

  let resultSummary = '';

  if (geminiRes.ok && geminiRes.data) {
    const parsed = ExplanationSchema.safeParse(geminiRes.data);
    if (parsed.success && parsed.data.explanation) {
      resultSummary = parsed.data.explanation;
    }
  }

  if (!resultSummary) {
    // Template fallback
    const topIncident = incidents[0];
    const topConflict = conflicts[0];
    resultSummary = `Operational status shows ${stats.activeIncidents} active incident sectors with ${stats.criticalCount} at critical alert. ` +
      (topIncident ? `Highest priority emergency is "${topIncident.name}" (score: ${topIncident.priority_score}). ` : '') +
      (topConflict
        ? `Primary resource bottleneck is ${topConflict.resource_type}s with ${topConflict.shortage} units in deficit. `
        : 'Sufficient supply available across all categories. ') +
      `Automated monitoring is continuous and awaiting coordinator dispatch approvals.`;
  }

  summaryCache = {
    hash,
    timestamp: now,
    text: resultSummary,
  };

  return resultSummary;
}
