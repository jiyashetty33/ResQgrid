import { createClient, SupabaseClient } from '@supabase/supabase-js';
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
import { ENV } from '../config/env.js';

export class SupabaseRepository implements IRepository {
  name: 'supabase' | 'memory' = 'supabase';
  private client: SupabaseClient;

  constructor() {
    this.client = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }

  async getHealth(): Promise<{ data: 'supabase' | 'memory'; time: string }> {
    const { error } = await this.client.from('system_settings').select('key').limit(1);
    if (error) {
      throw error;
    }
    return { data: 'supabase', time: new Date().toISOString() };
  }

  async getReports(filter?: { status?: string; source?: string }): Promise<Report[]> {
    let query = this.client.from('reports').select('*').order('received_at', { ascending: false });
    if (filter?.status) query = query.eq('status', filter.status);
    if (filter?.source) query = query.eq('source', filter.source);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Report[];
  }

  async getReportById(id: string): Promise<Report | null> {
    const { data, error } = await this.client.from('reports').select('*').eq('id', id).single();
    if (error) return null;
    return data as Report;
  }

  async createReport(report: Report): Promise<Report> {
    const { data, error } = await this.client.from('reports').insert(report).select().single();
    if (error) throw error;
    return data as Report;
  }

  async updateReport(id: string, updates: Partial<Report>): Promise<Report | null> {
    const { data, error } = await this.client.from('reports').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data as Report;
  }

  async getIncidents(filter?: { status?: string; severity?: string; search?: string }): Promise<Incident[]> {
    let query = this.client.from('incidents').select('*').order('priority_score', { ascending: false });
    if (filter?.status && filter.status !== 'all') query = query.eq('status', filter.status);
    if (filter?.severity && filter.severity !== 'all') query = query.eq('severity', filter.severity);
    if (filter?.search) {
      query = query.or(`name.ilike.%${filter.search}%,code.ilike.%${filter.search}%,location_name.ilike.%${filter.search}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Incident[];
  }

  async getIncidentById(id: string): Promise<Incident | null> {
    const { data, error } = await this.client.from('incidents').select('*').eq('id', id).single();
    if (error) return null;
    return data as Incident;
  }

  async createIncident(incident: Incident): Promise<Incident> {
    const { data, error } = await this.client.from('incidents').insert(incident).select().single();
    if (error) throw error;
    return data as Incident;
  }

  async updateIncident(id: string, updates: Partial<Incident>): Promise<Incident | null> {
    const { data, error } = await this.client.from('incidents').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data as Incident;
  }

  async getIncidentReports(incidentId: string): Promise<IncidentReportRelation[]> {
    const { data, error } = await this.client.from('incident_reports').select('*').eq('incident_id', incidentId);
    if (error) throw error;
    return (data || []) as IncidentReportRelation[];
  }

  async addIncidentReport(relation: IncidentReportRelation): Promise<void> {
    const { error } = await this.client.from('incident_reports').insert(relation);
    if (error) throw error;
  }

  async getResources(filter?: { type?: string; status?: string }): Promise<Resource[]> {
    let query = this.client.from('resources').select('*');
    if (filter?.type && filter.type !== 'all') query = query.eq('type', filter.type);
    if (filter?.status && filter.status !== 'all') query = query.eq('status', filter.status);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Resource[];
  }

  async getResourceById(id: string): Promise<Resource | null> {
    const { data, error } = await this.client.from('resources').select('*').eq('id', id).single();
    if (error) return null;
    return data as Resource;
  }

  async createResource(resource: Resource): Promise<Resource> {
    const { data, error } = await this.client.from('resources').insert(resource).select().single();
    if (error) throw error;
    return data as Resource;
  }

  async updateResource(id: string, updates: Partial<Resource>): Promise<Resource | null> {
    const { data, error } = await this.client.from('resources').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data as Resource;
  }

  async getAllocations(planId?: string, isCurrent?: boolean): Promise<Allocation[]> {
    let query = this.client.from('allocations').select('*').order('priority_score', { ascending: false });
    if (planId) query = query.eq('plan_id', planId);
    if (isCurrent !== undefined) query = query.eq('is_current', isCurrent);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Allocation[];
  }

  async saveAllocations(allocations: Allocation[]): Promise<Allocation[]> {
    const { data, error } = await this.client.from('allocations').upsert(allocations).select();
    if (error) throw error;
    return (data || []) as Allocation[];
  }

  async updateAllocation(id: string, updates: Partial<Allocation>): Promise<Allocation | null> {
    const { data, error } = await this.client.from('allocations').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data as Allocation;
  }

  async getDispatches(filter?: { status?: string }): Promise<Dispatch[]> {
    let query = this.client.from('dispatches').select('*').order('priority_score', { ascending: false });
    if (filter?.status && filter.status !== 'all') query = query.eq('status', filter.status);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Dispatch[];
  }

  async getDispatchById(id: string): Promise<Dispatch | null> {
    const { data, error } = await this.client.from('dispatches').select('*').eq('id', id).single();
    if (error) return null;
    return data as Dispatch;
  }

  async createDispatch(dispatch: Dispatch): Promise<Dispatch> {
    const { data, error } = await this.client.from('dispatches').insert(dispatch).select().single();
    if (error) throw error;
    return data as Dispatch;
  }

  async updateDispatch(id: string, updates: Partial<Dispatch>): Promise<Dispatch | null> {
    const { data, error } = await this.client.from('dispatches').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data as Dispatch;
  }

  async getReplanningEvents(): Promise<ReplanningEvent[]> {
    const { data, error } = await this.client
      .from('replanning_events')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as ReplanningEvent[];
  }

  async createReplanningEvent(event: ReplanningEvent): Promise<ReplanningEvent> {
    const { data, error } = await this.client.from('replanning_events').insert(event).select().single();
    if (error) throw error;
    return data as ReplanningEvent;
  }

  async getActivityLogs(limit: number = 50, since?: string): Promise<ActivityLog[]> {
    let query = this.client.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(limit);
    if (since) query = query.gt('created_at', since);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as ActivityLog[];
  }

  async createActivityLog(log: Omit<ActivityLog, 'id' | 'created_at'>): Promise<ActivityLog> {
    const { data, error } = await this.client.from('activity_logs').insert(log).select().single();
    if (error) throw error;
    return data as ActivityLog;
  }

  async getSettings(): Promise<Record<string, any>> {
    const { data, error } = await this.client.from('system_settings').select('*');
    if (error) throw error;
    const out: Record<string, any> = {};
    for (const item of data || []) {
      out[item.key] = item.value;
    }
    return out;
  }

  async getSetting(key: string): Promise<any> {
    const { data, error } = await this.client.from('system_settings').select('value').eq('key', key).single();
    if (error) return null;
    return data?.value;
  }

  async updateSetting(key: string, value: any): Promise<void> {
    const { error } = await this.client.from('system_settings').upsert({ key, value });
    if (error) throw error;
  }

  async resetDemoState(): Promise<void> {
    // In demo mode with Supabase, you could re-insert initial records
    // but the fallback memory store handles instant in-process resets cleanly
  }
}
