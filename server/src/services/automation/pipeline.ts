import crypto from 'crypto';
import { IRepository } from '../../db/repository.js';
import { Report, Incident, ExtractedReportData } from '../../types/index.js';
import { extractReport } from '../ai/extractReport.js';
import { matchReportToIncidents, mergeReportIntoIncident } from '../logic/fusion.js';
import { calculatePriorityScore } from '../logic/priority.js';
import { matchGazetteerLocation } from '../logic/geo.js';
import { runAllocation } from '../logic/allocation.js';
import { explainAllocation } from '../ai/explain.js';
import { updatePipelineTelemetry } from './localAutomation.js';

export interface PipelineReportInput {
  raw_text: string;
  source: Report['source'];
  reporter?: string;
}

export interface PipelineResult {
  report: Report;
  incident: Incident;
  isNewIncident: boolean;
  fusionRelation?: string;
  extractionMethod: 'gemini' | 'fallback';
}

/**
 * Executes the full end-to-end disaster report pipeline:
 * INGEST -> EXTRACT -> FUSE -> PRIORITIZE -> ALLOCATE -> LOG
 */
export async function processReportPipeline(
  input: PipelineReportInput,
  repo: IRepository
): Promise<PipelineResult> {
  const startTime = Date.now();
  updatePipelineTelemetry('ingest', 'running');

  // 1. Persist initial raw report
  const reportCode = `RPT-${Math.floor(1000 + Math.random() * 9000)}`;
  const now = new Date().toISOString();

  let report: Report = {
    id: crypto.randomUUID(),
    code: reportCode,
    source: input.source,
    raw_text: input.raw_text,
    reporter: input.reporter || 'Direct Feed',
    confidence: 0.8,
    is_duplicate: false,
    status: 'new',
    received_at: now,
    created_at: now,
    updated_at: now,
  };
  await repo.createReport(report);
  updatePipelineTelemetry('ingest', 'success');

  // 2. AI Structured Extraction
  updatePipelineTelemetry('ai_analysis', 'running');
  const extraction = await extractReport(input.raw_text);
  report.extracted = extraction.data;
  report.extraction_method = extraction.method;
  report.confidence = extraction.confidence;
  report.status = 'analyzed';
  await repo.updateReport(report.id, report);
  updatePipelineTelemetry('ai_analysis', 'success');

  await repo.createActivityLog({
    level: 'info',
    category: 'ai',
    message: `Report ${report.code} processed via ${extraction.method}. Type: ${extraction.data.incident_type} (${extraction.data.severity}).`,
    metadata: { method: extraction.method, confidence: extraction.confidence },
  });

  // 3. Incident Fusion
  updatePipelineTelemetry('fusion', 'running');
  const existingIncidents = await repo.getIncidents({ status: 'all' });
  const fusionMatch = matchReportToIncidents(report, extraction.data, existingIncidents);

  let targetIncident: Incident;
  let isNewIncident = false;

  if (fusionMatch.matchFound && fusionMatch.targetIncidentId) {
    // Merge into existing incident
    const parentInc = existingIncidents.find((i) => i.id === fusionMatch.targetIncidentId)!;
    const merged = mergeReportIntoIncident(parentInc, report, extraction.data, fusionMatch);
    targetIncident = merged.updatedIncident;

    report.incident_id = targetIncident.id;
    report.is_duplicate = fusionMatch.relation === 'duplicate';
    report.status = 'linked';
    await repo.updateReport(report.id, report);
    await repo.addIncidentReport(merged.relationRecord);
    await repo.updateIncident(targetIncident.id, targetIncident);

    await repo.createActivityLog({
      level: 'info',
      category: 'fusion',
      message: `Report ${report.code} fused into incident ${targetIncident.code} as ${fusionMatch.relation}.`,
      metadata: { targetIncident: targetIncident.code, relation: fusionMatch.relation },
    });
  } else {
    // Create new Incident
    isNewIncident = true;
    const gazLoc = matchGazetteerLocation(extraction.data.location || input.raw_text);
    const lat = gazLoc ? gazLoc.lat : 12.8650;
    const lng = gazLoc ? gazLoc.lng : 74.8500;
    const locationName = gazLoc ? gazLoc.name : extraction.data.location || 'Mangaluru';

    const pScore = calculatePriorityScore({
      severity: extraction.data.severity,
      people_affected: extraction.data.people_affected,
      medical_urgency: extraction.data.medical_urgency,
      urgency: extraction.data.urgency,
      lat,
      lng,
      confidence: extraction.data.confidence,
      is_critical_infrastructure: extraction.data.is_critical_infrastructure,
    });

    const incCode = `INC-${Math.floor(100 + Math.random() * 900)}`;
    targetIncident = {
      id: crypto.randomUUID(),
      code: incCode,
      name: `${extraction.data.severity} ${extraction.data.incident_type} – ${locationName}`,
      type: extraction.data.incident_type,
      location_name: locationName,
      lat,
      lng,
      people_affected: extraction.data.people_affected,
      severity: extraction.data.severity,
      urgency: extraction.data.urgency,
      medical_urgency: extraction.data.medical_urgency,
      is_critical_infrastructure: extraction.data.is_critical_infrastructure,
      confidence: extraction.data.confidence,
      required_resources: extraction.data.required_resources,
      status: 'new',
      priority_score: pScore.score,
      priority_breakdown: pScore.breakdown,
      summary: extraction.data.summary,
      report_count: 1,
      created_at: now,
      updated_at: now,
    };

    await repo.createIncident(targetIncident);
    report.incident_id = targetIncident.id;
    report.status = 'linked';
    await repo.updateReport(report.id, report);

    await repo.addIncidentReport({
      incident_id: targetIncident.id,
      report_id: report.id,
      relation: 'primary',
      similarity: 1.0,
      reasoning: 'Primary initiating hazard report.',
    });

    await repo.createActivityLog({
      level: targetIncident.severity === 'CRITICAL' ? 'critical' : 'warning',
      category: 'report',
      message: `New incident ${targetIncident.code} created at ${locationName}. Priority: ${targetIncident.priority_score}.`,
      metadata: { incidentId: targetIncident.id, priority: targetIncident.priority_score },
    });
  }
  updatePipelineTelemetry('fusion', 'success');

  // 4. Recalculate priority
  updatePipelineTelemetry('priority', 'running');
  const pCalc = calculatePriorityScore({
    severity: targetIncident.severity,
    people_affected: targetIncident.people_affected,
    medical_urgency: targetIncident.medical_urgency,
    urgency: targetIncident.urgency,
    lat: targetIncident.lat,
    lng: targetIncident.lng,
    confidence: targetIncident.confidence,
    is_critical_infrastructure: targetIncident.is_critical_infrastructure,
  });
  targetIncident.priority_score = pCalc.score;
  targetIncident.priority_breakdown = pCalc.breakdown;
  await repo.updateIncident(targetIncident.id, targetIncident);
  updatePipelineTelemetry('priority', 'success');

  // 5. Run allocation if resources needed
  updatePipelineTelemetry('matching', 'running');
  const allIncidents = await repo.getIncidents({ status: 'all' });
  const allResources = await repo.getResources({ status: 'all' });
  const plan = runAllocation(allIncidents, allResources);

  // Update proposed allocations
  await repo.saveAllocations(plan.allocations);
  updatePipelineTelemetry('matching', 'success');

  return {
    report,
    incident: targetIncident,
    isNewIncident,
    fusionRelation: fusionMatch.relation,
    extractionMethod: extraction.method,
  };
}
