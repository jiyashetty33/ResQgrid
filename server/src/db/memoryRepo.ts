import crypto from 'crypto';
import {
  Incident,
  Report,
  Resource,
  Allocation,
  Dispatch,
  ReplanningEvent,
  ActivityLog,
  IncidentReportRelation,
} from '../types/index.js';
import { IRepository } from './repository.js';
import {
  INITIAL_RESOURCES,
  INITIAL_SETTINGS,
  SEED_REPORTS_RAW,
  buildInitialIncidents,
} from './seedData.js';
import { extractReportHeuristic } from '../services/ai/heuristicExtractor.js';
import { runAllocation } from '../services/logic/allocation.js';

export class MemoryRepository implements IRepository {
  name: 'supabase' | 'memory' = 'memory';

  private reports: Map<string, Report> = new Map();
  private incidents: Map<string, Incident> = new Map();
  private incidentReports: IncidentReportRelation[] = [];
  private resources: Map<string, Resource> = new Map();
  private allocations: Map<string, Allocation> = new Map();
  private dispatches: Map<string, Dispatch> = new Map();
  private replanningEvents: ReplanningEvent[] = [];
  private activityLogs: ActivityLog[] = [];
  private settings: Map<string, any> = new Map();

  constructor() {
    this.seed();
  }

  public async seed(): Promise<void> {
    this.reports.clear();
    this.incidents.clear();
    this.incidentReports = [];
    this.resources.clear();
    this.allocations.clear();
    this.dispatches.clear();
    this.replanningEvents = [];
    this.activityLogs = [];
    this.settings.clear();

    // 1. Settings
    for (const s of INITIAL_SETTINGS) {
      this.settings.set(s.key, s.value);
    }

    // 2. Resources
    for (const r of INITIAL_RESOURCES) {
      this.resources.set(r.id, JSON.parse(JSON.stringify(r)));
    }

    // 3. Incidents
    const initialIncidents = buildInitialIncidents();
    for (const inc of initialIncidents) {
      this.incidents.set(inc.id, JSON.parse(JSON.stringify(inc)));
    }

    // 4. Reports (ingest raw seed reports)
    const incCodeMap = new Map<string, Incident>();
    for (const inc of this.incidents.values()) {
      incCodeMap.set(inc.code, inc);
    }

    const now = new Date();
    for (let i = 0; i < SEED_REPORTS_RAW.length; i++) {
      const raw = SEED_REPORTS_RAW[i];
      const extracted = extractReportHeuristic(raw.raw_text);
      const targetInc = incCodeMap.get(raw.target_incident_code);
      const isDuplicate = i > 0 && targetInc ? true : false;
      const isRejected = raw.target_incident_code === 'INC-IRRELEVANT';

      const reportId = `rpt-${(i + 1).toString().padStart(3, '0')}`;
      const reportDate = new Date(now.getTime() - (SEED_REPORTS_RAW.length - i) * 120000).toISOString();

      const report: Report = {
        id: reportId,
        code: raw.code,
        source: raw.source,
        raw_text: raw.raw_text,
        reporter: raw.reporter || 'Field Informant',
        extracted,
        extraction_method: 'fallback',
        confidence: isRejected ? 0.20 : extracted.confidence,
        incident_id: isRejected ? null : targetInc ? targetInc.id : null,
        is_duplicate: isDuplicate,
        status: isRejected ? 'rejected' : targetInc ? 'linked' : 'new',
        received_at: reportDate,
        created_at: reportDate,
        updated_at: reportDate,
      };

      this.reports.set(report.id, report);

      if (targetInc && !isRejected) {
        this.incidentReports.push({
          incident_id: targetInc.id,
          report_id: report.id,
          relation: isDuplicate ? 'duplicate' : 'primary',
          similarity: isDuplicate ? 0.78 : 1.0,
          reasoning: isDuplicate
            ? 'Corroborating citizen alert matched by gazetteer zone and incident type.'
            : 'Initial anchor report for this hazard sector.',
        });
      }
    }

    // 5. Initial Allocations & Dispatches
    const initialPlan = runAllocation(
      Array.from(this.incidents.values()),
      Array.from(this.resources.values()),
      { planId: 'initial-plan-001', planVersion: 1 }
    );

    for (const a of initialPlan.allocations) {
      this.allocations.set(a.id, a);

      // Create initial dispatches
      const inc = this.incidents.get(a.incident_id);
      const res = this.resources.get(a.resource_id);
      const requiresApproval = (inc && (inc.severity === 'CRITICAL' || inc.severity === 'HIGH')) || false;

      const dispatch: Dispatch = {
        id: crypto.randomUUID(),
        code: `DSP-${Math.floor(1000 + Math.random() * 9000)}`,
        allocation_id: a.id,
        incident_id: a.incident_id,
        resource_id: a.resource_id,
        quantity: a.quantity,
        destination: inc ? inc.location_name : 'Disaster Site',
        priority_score: a.priority_score,
        eta_minutes: a.eta_minutes,
        reason: a.reason,
        requires_approval: requiresApproval,
        status: 'PENDING',
        notification: {
          channel: 'radio',
          message: `Recommended dispatch of ${a.quantity} unit(s) [${res?.name}] to ${inc?.name}. ETA: ${a.eta_minutes}m.`,
          timestamp: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      this.dispatches.set(dispatch.id, dispatch);
    }

    // 6. Initial Activity Logs
    this.createActivityLogSync({
      level: 'success',
      category: 'system',
      message: 'ResQGrid in-memory engine initialized. 22 reports ingested, 7 incidents fused, baseline allocations computed.',
      metadata: { incidentsCount: this.incidents.size, resourcesCount: this.resources.size },
    });

    this.createActivityLogSync({
      level: 'warning',
      category: 'conflict',
      message: 'Resource contention detected: Boat capacity deficit (2 units available vs 3 required).',
      metadata: { resource: 'boat', available: 2, required: 3 },
    });
  }

  private createActivityLogSync(log: Omit<ActivityLog, 'id' | 'created_at'>): ActivityLog {
    const entry: ActivityLog = {
      id: crypto.randomUUID(),
      ...log,
      created_at: new Date().toISOString(),
    };
    this.activityLogs.unshift(entry);
    if (this.activityLogs.length > 500) {
      this.activityLogs.pop();
    }
    return entry;
  }

  async getHealth(): Promise<{ data: 'supabase' | 'memory'; time: string }> {
    return { data: 'memory', time: new Date().toISOString() };
  }

  async getReports(filter?: { status?: string; source?: string }): Promise<Report[]> {
    let list = Array.from(this.reports.values());
    if (filter?.status) {
      list = list.filter((r) => r.status === filter.status);
    }
    if (filter?.source) {
      list = list.filter((r) => r.source === filter.source);
    }
    return list.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
  }

  async getReportById(id: string): Promise<Report | null> {
    return this.reports.get(id) || null;
  }

  async createReport(report: Report): Promise<Report> {
    this.reports.set(report.id, report);
    return report;
  }

  async updateReport(id: string, updates: Partial<Report>): Promise<Report | null> {
    const existing = this.reports.get(id);
    if (!existing) return null;
    const updated: Report = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.reports.set(id, updated);
    return updated;
  }

  async getIncidents(filter?: { status?: string; severity?: string; search?: string }): Promise<Incident[]> {
    let list = Array.from(this.incidents.values());
    if (filter?.status && filter.status !== 'all') {
      list = list.filter((i) => i.status === filter.status);
    }
    if (filter?.severity && filter.severity !== 'all') {
      list = list.filter((i) => i.severity === filter.severity);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.code.toLowerCase().includes(q) ||
          i.location_name.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => b.priority_score - a.priority_score);
  }

  async getIncidentById(id: string): Promise<Incident | null> {
    return this.incidents.get(id) || null;
  }

  async createIncident(incident: Incident): Promise<Incident> {
    this.incidents.set(incident.id, incident);
    return incident;
  }

  async updateIncident(id: string, updates: Partial<Incident>): Promise<Incident | null> {
    const existing = this.incidents.get(id);
    if (!existing) return null;
    const updated: Incident = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.incidents.set(id, updated);
    return updated;
  }

  async getIncidentReports(incidentId: string): Promise<IncidentReportRelation[]> {
    return this.incidentReports.filter((r) => r.incident_id === incidentId);
  }

  async addIncidentReport(relation: IncidentReportRelation): Promise<void> {
    this.incidentReports.push(relation);
  }

  async getResources(filter?: { type?: string; status?: string }): Promise<Resource[]> {
    let list = Array.from(this.resources.values());
    if (filter?.type && filter.type !== 'all') {
      list = list.filter((r) => r.type === filter.type);
    }
    if (filter?.status && filter.status !== 'all') {
      list = list.filter((r) => r.status === filter.status);
    }
    return list;
  }

  async getResourceById(id: string): Promise<Resource | null> {
    return this.resources.get(id) || null;
  }

  async createResource(resource: Resource): Promise<Resource> {
    this.resources.set(resource.id, resource);
    return resource;
  }

  async updateResource(id: string, updates: Partial<Resource>): Promise<Resource | null> {
    const existing = this.resources.get(id);
    if (!existing) return null;
    const updated: Resource = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.resources.set(id, updated);
    return updated;
  }

  async getAllocations(planId?: string, isCurrent?: boolean): Promise<Allocation[]> {
    let list = Array.from(this.allocations.values());
    if (planId) {
      list = list.filter((a) => a.plan_id === planId);
    }
    if (isCurrent !== undefined) {
      list = list.filter((a) => a.is_current === isCurrent);
    }
    return list.sort((a, b) => b.priority_score - a.priority_score);
  }

  async saveAllocations(newAllocations: Allocation[]): Promise<Allocation[]> {
    for (const a of newAllocations) {
      this.allocations.set(a.id, a);
    }
    return newAllocations;
  }

  async updateAllocation(id: string, updates: Partial<Allocation>): Promise<Allocation | null> {
    const existing = this.allocations.get(id);
    if (!existing) return null;
    const updated: Allocation = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.allocations.set(id, updated);
    return updated;
  }

  async getDispatches(filter?: { status?: string }): Promise<Dispatch[]> {
    let list = Array.from(this.dispatches.values());
    if (filter?.status && filter.status !== 'all') {
      list = list.filter((d) => d.status === filter.status);
    }
    return list.sort((a, b) => b.priority_score - a.priority_score);
  }

  async getDispatchById(id: string): Promise<Dispatch | null> {
    return this.dispatches.get(id) || null;
  }

  async createDispatch(dispatch: Dispatch): Promise<Dispatch> {
    this.dispatches.set(dispatch.id, dispatch);
    return dispatch;
  }

  async updateDispatch(id: string, updates: Partial<Dispatch>): Promise<Dispatch | null> {
    const existing = this.dispatches.get(id);
    if (!existing) return null;
    const updated: Dispatch = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.dispatches.set(id, updated);
    return updated;
  }

  async getReplanningEvents(): Promise<ReplanningEvent[]> {
    return [...this.replanningEvents].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  async createReplanningEvent(event: ReplanningEvent): Promise<ReplanningEvent> {
    this.replanningEvents.unshift(event);
    return event;
  }

  async getActivityLogs(limit: number = 50, since?: string): Promise<ActivityLog[]> {
    let logs = this.activityLogs;
    if (since) {
      const sinceDate = new Date(since).getTime();
      logs = logs.filter((l) => new Date(l.created_at).getTime() > sinceDate);
    }
    return logs.slice(0, limit);
  }

  async createActivityLog(log: Omit<ActivityLog, 'id' | 'created_at'>): Promise<ActivityLog> {
    return this.createActivityLogSync(log);
  }

  async getSettings(): Promise<Record<string, any>> {
    const out: Record<string, any> = {};
    for (const [k, v] of this.settings.entries()) {
      out[k] = v;
    }
    return out;
  }

  async getSetting(key: string): Promise<any> {
    return this.settings.get(key);
  }

  async updateSetting(key: string, value: any): Promise<void> {
    this.settings.set(key, value);
  }

  async resetDemoState(): Promise<void> {
    await this.seed();
  }
}
