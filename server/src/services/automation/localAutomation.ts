import { IRepository } from '../../db/repository.js';
import { executeReplanning } from '../logic/replanning.js';
import { SEED_REPORTS_RAW } from '../../db/seedData.js';

export interface PipelineNodeStatus {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'success' | 'error';
  lastRun?: string;
  executionCount: number;
}

const pipelineNodes: Map<string, PipelineNodeStatus> = new Map([
  ['ingest', { id: 'ingest', name: 'Report Ingestion', status: 'idle', executionCount: 22, lastRun: new Date().toISOString() }],
  ['ai_analysis', { id: 'ai_analysis', name: 'AI Analysis & Extraction', status: 'idle', executionCount: 22, lastRun: new Date().toISOString() }],
  ['fusion', { id: 'fusion', name: 'Incident Fusion & Clust.', status: 'idle', executionCount: 22, lastRun: new Date().toISOString() }],
  ['priority', { id: 'priority', name: 'Priority Scoring Engine', status: 'idle', executionCount: 25, lastRun: new Date().toISOString() }],
  ['matching', { id: 'matching', name: 'Resource Allocation', status: 'idle', executionCount: 15, lastRun: new Date().toISOString() }],
  ['dispatch', { id: 'dispatch', name: 'Dispatch & Approval', status: 'idle', executionCount: 8, lastRun: new Date().toISOString() }],
  ['monitor', { id: 'monitor', name: 'Continuous Monitor', status: 'idle', executionCount: 40, lastRun: new Date().toISOString() }],
  ['replan', { id: 'replan', name: 'Dynamic Replanning', status: 'idle', executionCount: 3, lastRun: new Date().toISOString() }],
]);

export function updatePipelineTelemetry(nodeId: string, status: 'idle' | 'running' | 'success' | 'error') {
  const node = pipelineNodes.get(nodeId);
  if (node) {
    node.status = status;
    node.lastRun = new Date().toISOString();
    if (status === 'running') {
      node.executionCount++;
    }
  }
}

export function getPipelineTelemetry(): PipelineNodeStatus[] {
  return Array.from(pipelineNodes.values());
}

/**
 * Runs a monitor tick to evaluate current plan validity.
 * If resources are marked unavailable or unserviced high-critical incidents exist, triggers replan.
 */
export async function runMonitorTick(repo: IRepository): Promise<{ replanned: boolean; reason?: string }> {
  updatePipelineTelemetry('monitor', 'running');

  const incidents = await repo.getIncidents({ status: 'all' });
  const resources = await repo.getResources({ status: 'all' });
  const allocations = await repo.getAllocations(undefined, true);

  // Check if any resource allocated is now UNAVAILABLE
  const unavailableAlloc = allocations.find((a) => {
    const res = resources.find((r) => r.id === a.resource_id);
    return res && res.status === 'UNAVAILABLE';
  });

  // Check if a CRITICAL incident has no allocations
  const criticalUnmet = incidents.find(
    (inc) =>
      inc.severity === 'CRITICAL' &&
      inc.status !== 'resolved' &&
      inc.required_resources.length > 0 &&
      !allocations.some((a) => a.incident_id === inc.id)
  );

  let needsReplan = false;
  let reason = '';

  if (unavailableAlloc) {
    needsReplan = true;
    reason = `Allocated resource became UNAVAILABLE. Re-evaluating optimal assignments.`;
  } else if (criticalUnmet) {
    needsReplan = true;
    reason = `Critical incident ${criticalUnmet.code} is unserviced. Dynamic reallocation required.`;
  }

  if (needsReplan) {
    updatePipelineTelemetry('replan', 'running');
    const replanResult = executeReplanning(
      { trigger: 'monitor_detected_change', params: { reason } },
      incidents,
      resources,
      allocations,
      15
    );

    await repo.createReplanningEvent(replanResult.event);
    await repo.saveAllocations(replanResult.afterPlan.allocations);

    await repo.createActivityLog({
      level: 'warning',
      category: 'replan',
      message: `Situation Changed: ${reason}`,
      metadata: { trigger: 'monitor_detected_change' },
    });

    updatePipelineTelemetry('replan', 'success');
    updatePipelineTelemetry('monitor', 'success');
    return { replanned: true, reason };
  }

  updatePipelineTelemetry('monitor', 'success');
  return { replanned: false };
}

// Simulated background feed runner
let feedTimer: NodeJS.Timeout | null = null;
let feedIndex = 0;

export function startSimulatedFeed(repo: IRepository, intervalSeconds: number = 10, onNewReport?: (r: any) => void) {
  if (feedTimer) clearInterval(feedTimer);

  feedTimer = setInterval(async () => {
    const sample = SEED_REPORTS_RAW[feedIndex % SEED_REPORTS_RAW.length];
    feedIndex++;

    try {
      const { processReportPipeline } = await import('./pipeline.js');
      const res = await processReportPipeline(
        {
          raw_text: `[Live Feed +${Math.floor(Math.random() * 10)}m] ${sample.raw_text}`,
          source: sample.source,
          reporter: sample.reporter,
        },
        repo
      );
      if (onNewReport) onNewReport(res);
    } catch (err) {
      console.error('[Simulated Feed] Error processing item:', err);
    }
  }, intervalSeconds * 1000);
}

export function stopSimulatedFeed() {
  if (feedTimer) {
    clearInterval(feedTimer);
    feedTimer = null;
  }
}

export function isSimulatedFeedRunning(): boolean {
  return feedTimer !== null;
}
