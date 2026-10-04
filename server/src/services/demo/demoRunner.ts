import { Response } from 'express';
import { IRepository } from '../../db/repository.js';
import { executeReplanning } from '../logic/replanning.js';

export interface DemoProgressStep {
  step: number;
  totalSteps: number;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'waiting_approval' | 'error';
  data?: any;
}

let activeDemoState: {
  isRunning: boolean;
  currentStep: number;
  totalSteps: number;
  steps: DemoProgressStep[];
  waitingApproval: boolean;
  approvalResolver?: () => void;
} = {
  isRunning: false,
  currentStep: 0,
  totalSteps: 15,
  steps: [],
  waitingApproval: false,
};

const sseListeners: Set<Response> = new Set();

export function addSseListener(res: Response) {
  sseListeners.add(res);
  // Send current state immediately
  res.write(`data: ${JSON.stringify(activeDemoState)}\n\n`);
}

export function removeSseListener(res: Response) {
  sseListeners.delete(res);
}

function broadcastProgress(step: DemoProgressStep) {
  activeDemoState.currentStep = step.step;
  const existingIdx = activeDemoState.steps.findIndex((s) => s.step === step.step);
  if (existingIdx >= 0) {
    activeDemoState.steps[existingIdx] = step;
  } else {
    activeDemoState.steps.push(step);
  }

  const payload = JSON.stringify({
    ...activeDemoState,
    latestStep: step,
  });

  for (const client of sseListeners) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      sseListeners.delete(client);
    }
  }
}

export function getDemoProgress() {
  return activeDemoState;
}

export function approveDemoStep() {
  if (activeDemoState.waitingApproval && activeDemoState.approvalResolver) {
    activeDemoState.waitingApproval = false;
    activeDemoState.approvalResolver();
    activeDemoState.approvalResolver = undefined;
    return true;
  }
  return false;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runFullDemo(
  repo: IRepository,
  options: { autoApprove?: boolean; delayMs?: number } = {}
) {
  if (activeDemoState.isRunning) {
    return { status: 'already_running', progress: activeDemoState };
  }

  const delay = options.delayMs ?? 1200;
  activeDemoState = {
    isRunning: true,
    currentStep: 1,
    totalSteps: 15,
    steps: [],
    waitingApproval: false,
  };

  const execute = async () => {
    try {
      // Step 1: Reset to clean baseline
      broadcastProgress({
        step: 1,
        totalSteps: 15,
        title: 'System Reset',
        description: 'Initializing clean emergency response state and gazetteer.',
        status: 'running',
      });
      await repo.resetDemoState();
      await repo.createActivityLog({
        level: 'info',
        category: 'system',
        message: 'Demo sequence initiated: State reset to baseline.',
      });
      await sleep(delay);
      broadcastProgress({
        step: 1,
        totalSteps: 15,
        title: 'System Reset',
        description: 'Baseline emergency registry initialized.',
        status: 'completed',
      });

      // Step 2: Load 22 Simulated Reports
      broadcastProgress({
        step: 2,
        totalSteps: 15,
        title: 'Ingest Reports',
        description: 'Receiving 22 multi-channel citizen, 911, and social disaster signals.',
        status: 'running',
      });
      const reports = await repo.getReports();
      await sleep(delay);
      broadcastProgress({
        step: 2,
        totalSteps: 15,
        title: 'Ingest Reports',
        description: `Successfully ingested ${reports.length} incoming reports across Mangaluru sectors.`,
        status: 'completed',
        data: { count: reports.length },
      });

      // Step 3: AI Processing
      broadcastProgress({
        step: 3,
        totalSteps: 15,
        title: 'AI Analysis & Extraction',
        description: 'Extracting location, affected people count, and resource requirements.',
        status: 'running',
      });
      await sleep(delay);
      broadcastProgress({
        step: 3,
        totalSteps: 15,
        title: 'AI Analysis & Extraction',
        description: 'Structured disaster parameters extracted with confidence scoring.',
        status: 'completed',
      });

      // Step 4: Incident Fusion & Grouping
      broadcastProgress({
        step: 4,
        totalSteps: 15,
        title: 'Incident Fusion',
        description: 'Clustering related reports and deduplicating overlapping calls (<1.5km).',
        status: 'running',
      });
      await sleep(delay);
      const incidents = await repo.getIncidents({ status: 'all' });
      broadcastProgress({
        step: 4,
        totalSteps: 15,
        title: 'Incident Fusion',
        description: `Grouped 22 reports into ${incidents.length} verified incident sectors with max-merge.`,
        status: 'completed',
        data: { incidentCount: incidents.length },
      });

      // Step 5: Incidents on Map
      broadcastProgress({
        step: 5,
        totalSteps: 15,
        title: 'Geographic Mapping',
        description: 'Plotting operational sectors onto tactical Leaflet map.',
        status: 'running',
      });
      await sleep(delay);
      broadcastProgress({
        step: 5,
        totalSteps: 15,
        title: 'Geographic Mapping',
        description: 'Tactical GIS active: Ullal, Kulur, Jeppu, Surathkal, Bajpe, Panambur, Pumpwell.',
        status: 'completed',
      });

      // Step 6: Resource Inventory
      broadcastProgress({
        step: 6,
        totalSteps: 15,
        title: 'Resource Verification',
        description: 'Scanning depots at Bunder and Kankanady for boats, teams, and bulk assets.',
        status: 'running',
      });
      const resources = await repo.getResources({ status: 'all' });
      await sleep(delay);
      broadcastProgress({
        step: 6,
        totalSteps: 15,
        title: 'Resource Verification',
        description: `Inventory verified: ${resources.length} resource categories indexed.`,
        status: 'completed',
      });

      // Step 7: Initial Allocation & Boat Conflict
      broadcastProgress({
        step: 7,
        totalSteps: 15,
        title: 'Allocation & Conflict Detection',
        description: 'Computing transparent priority scores and detecting resource contention.',
        status: 'running',
      });
      await sleep(delay);
      broadcastProgress({
        step: 7,
        totalSteps: 15,
        title: 'Allocation & Conflict Detection',
        description: 'RESOURCE CONFLICT DETECTED: 2 Boats available vs 3 required (Ullal & Kulur).',
        status: 'completed',
      });

      // Step 8: Show Allocation
      broadcastProgress({
        step: 8,
        totalSteps: 15,
        title: 'Baseline Plan Generated',
        description: 'Initial plan formulated. Generator assigned to Jeppu; boats to Ullal & Kulur.',
        status: 'running',
      });
      await sleep(delay);
      broadcastProgress({
        step: 8,
        totalSteps: 15,
        title: 'Baseline Plan Generated',
        description: 'Baseline plan active with transparent factor scoring.',
        status: 'completed',
      });

      // Step 9: Hospital Power Failure Trigger
      broadcastProgress({
        step: 9,
        totalSteps: 15,
        title: 'Emergency Trigger',
        description: 'Simulating sudden critical event: Total grid failure at City Hospital ICU.',
        status: 'running',
      });
      await sleep(delay);
      broadcastProgress({
        step: 9,
        totalSteps: 15,
        title: 'Emergency Trigger',
        description: 'CRITICAL ALERT: City Hospital ICU power failure. 120 patients at immediate risk.',
        status: 'completed',
      });

      // Step 10: Situation Changed Alert
      broadcastProgress({
        step: 10,
        totalSteps: 15,
        title: 'Situation Changed Alert',
        description: 'Automated monitor detects critical priority divergence (>15pt threshold).',
        status: 'running',
      });
      await repo.createActivityLog({
        level: 'critical',
        category: 'replan',
        message: 'Situation Changed: Hospital Power Failure – City Hospital Kadri outranks existing allocations.',
      });
      await sleep(delay);
      broadcastProgress({
        step: 10,
        totalSteps: 15,
        title: 'Situation Changed Alert',
        description: 'System triggered automatic replanning cycle.',
        status: 'completed',
      });

      // Step 11: Dynamic Replanning
      broadcastProgress({
        step: 11,
        totalSteps: 15,
        title: 'Dynamic Replanning',
        description: 'Re-evaluating priorities, availability, and optimal reassignment.',
        status: 'running',
      });

      const currentIncidents = await repo.getIncidents({ status: 'all' });
      const currentResources = await repo.getResources({ status: 'all' });
      const currentAllocations = await repo.getAllocations(undefined, true);

      const replanResult = executeReplanning(
        { trigger: 'hospital_power_failure' },
        currentIncidents,
        currentResources,
        currentAllocations,
        15
      );

      for (const inc of replanResult.updatedIncidents) {
        await repo.updateIncident(inc.id, inc);
      }
      for (const res of replanResult.updatedResources) {
        await repo.updateResource(res.id, res);
      }
      await repo.createReplanningEvent(replanResult.event);
      await repo.saveAllocations(replanResult.afterPlan.allocations);

      await sleep(delay);
      broadcastProgress({
        step: 11,
        totalSteps: 15,
        title: 'Dynamic Replanning',
        description: 'New plan calculated: GEN-01 reassigned from Jeppu to City Hospital Kadri.',
        status: 'completed',
      });

      // Step 12: Before vs After Split View
      broadcastProgress({
        step: 12,
        totalSteps: 15,
        title: 'Before vs After Comparison',
        description: 'Highlighting reallocated units, deferred demands, and AI explanation.',
        status: 'running',
        data: {
          moved: replanResult.event.diff.moved,
          explanation: replanResult.event.ai_explanation,
        },
      });
      await sleep(delay);
      broadcastProgress({
        step: 12,
        totalSteps: 15,
        title: 'Before vs After Comparison',
        description: 'Plan diff rendered with visual reassignment cards.',
        status: 'completed',
      });

      // Step 13: Coordinator Approval
      if (!options.autoApprove) {
        broadcastProgress({
          step: 13,
          totalSteps: 15,
          title: 'Coordinator Approval Required',
          description: 'Awaiting human authorization for critical reassignment of GEN-01 to City Hospital.',
          status: 'waiting_approval',
        });

        activeDemoState.waitingApproval = true;
        await new Promise<void>((resolve) => {
          activeDemoState.approvalResolver = resolve;
        });
      } else {
        broadcastProgress({
          step: 13,
          totalSteps: 15,
          title: 'Coordinator Approval (Auto-Demo)',
          description: 'Authorized by Duty Coordinator in demo mode.',
          status: 'running',
        });
        await sleep(delay);
      }

      broadcastProgress({
        step: 13,
        totalSteps: 15,
        title: 'Coordinator Approval Granted',
        description: 'Authorization logged by Duty Coordinator.',
        status: 'completed',
      });

      // Step 14: Dispatch Execution
      broadcastProgress({
        step: 14,
        totalSteps: 15,
        title: 'Dispatches Dispatched',
        description: 'Updating unit status to IN_TRANSIT, transmitting radio dispatch notifications.',
        status: 'running',
      });

      const genRes = (await repo.getResources()).find((r) => r.code === 'GEN-01');
      if (genRes) {
        await repo.updateResource(genRes.id, { status: 'IN_TRANSIT', available_quantity: 0 });
      }

      await repo.createActivityLog({
        level: 'success',
        category: 'dispatch',
        message: 'Dispatch approved: GEN-01 en route to City Hospital Kadri (ETA 18m).',
        metadata: { destination: 'City Hospital Kadri', resource: 'GEN-01' },
      });

      await sleep(delay);
      broadcastProgress({
        step: 14,
        totalSteps: 15,
        title: 'Dispatches Dispatched',
        description: 'Resource statuses updated. Radio dispatch alerts transmitted.',
        status: 'completed',
      });

      // Step 15: Sequence Finalized
      broadcastProgress({
        step: 15,
        totalSteps: 15,
        title: 'Full Story Complete',
        description: 'Central story demonstrated: Understand → Fuse → Prioritize → Allocate → Dispatch → Monitor → Replan.',
        status: 'completed',
      });

      activeDemoState.isRunning = false;
    } catch (err: any) {
      console.error('[Demo Runner] Error executing demo:', err);
      broadcastProgress({
        step: activeDemoState.currentStep || 1,
        totalSteps: 15,
        title: 'Demo Error',
        description: err?.message || 'Error occurred during demo orchestration.',
        status: 'error',
      });
      activeDemoState.isRunning = false;
    }
  };

  // Launch async
  execute();

  return { status: 'started', progress: activeDemoState };
}
