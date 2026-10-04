import {
  Incident,
  Report,
  Resource,
  Allocation,
  Dispatch,
  ReplanningEvent,
  ActivityLog,
  IncidentReportRelation,
  SystemSettings,
} from '../types/index.js';

export interface IRepository {
  name: 'supabase' | 'memory';
  getHealth(): Promise<{ data: 'supabase' | 'memory'; time: string }>;

  // Reports
  getReports(filter?: { status?: string; source?: string }): Promise<Report[]>;
  getReportById(id: string): Promise<Report | null>;
  createReport(report: Report): Promise<Report>;
  updateReport(id: string, updates: Partial<Report>): Promise<Report | null>;

  // Incidents
  getIncidents(filter?: { status?: string; severity?: string; search?: string }): Promise<Incident[]>;
  getIncidentById(id: string): Promise<Incident | null>;
  createIncident(incident: Incident): Promise<Incident>;
  updateIncident(id: string, updates: Partial<Incident>): Promise<Incident | null>;

  // Incident-Report relations (Fusion)
  getIncidentReports(incidentId: string): Promise<IncidentReportRelation[]>;
  addIncidentReport(relation: IncidentReportRelation): Promise<void>;

  // Resources
  getResources(filter?: { type?: string; status?: string }): Promise<Resource[]>;
  getResourceById(id: string): Promise<Resource | null>;
  createResource(resource: Resource): Promise<Resource>;
  updateResource(id: string, updates: Partial<Resource>): Promise<Resource | null>;

  // Allocations
  getAllocations(planId?: string, isCurrent?: boolean): Promise<Allocation[]>;
  saveAllocations(allocations: Allocation[]): Promise<Allocation[]>;
  updateAllocation(id: string, updates: Partial<Allocation>): Promise<Allocation | null>;

  // Dispatches
  getDispatches(filter?: { status?: string }): Promise<Dispatch[]>;
  getDispatchById(id: string): Promise<Dispatch | null>;
  createDispatch(dispatch: Dispatch): Promise<Dispatch>;
  updateDispatch(id: string, updates: Partial<Dispatch>): Promise<Dispatch | null>;

  // Replanning Events
  getReplanningEvents(): Promise<ReplanningEvent[]>;
  createReplanningEvent(event: ReplanningEvent): Promise<ReplanningEvent>;

  // Activity Logs
  getActivityLogs(limit?: number, since?: string): Promise<ActivityLog[]>;
  createActivityLog(log: Omit<ActivityLog, 'id' | 'created_at'>): Promise<ActivityLog>;

  // System Settings
  getSettings(): Promise<Record<string, any>>;
  getSetting(key: string): Promise<any>;
  updateSetting(key: string, value: any): Promise<void>;

  // Reset / Seed
  resetDemoState(): Promise<void>;
}
