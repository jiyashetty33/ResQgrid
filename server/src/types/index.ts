export type ReportSource = 'social' | 'form' | 'emergency_call' | 'news' | 'ngo' | 'weather';
export type ExtractionMethod = 'gemini' | 'fallback';
export type ReportStatus = 'new' | 'analyzed' | 'linked' | 'rejected';

export type IncidentType = 'flood' | 'fire' | 'storm' | 'medical' | 'infrastructure' | 'landslide' | 'other';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'new' | 'monitoring' | 'allocated' | 'dispatched' | 'resolved';

export type ResourceType =
  | 'boat'
  | 'ambulance'
  | 'medical_team'
  | 'generator'
  | 'food_kit'
  | 'water_kit'
  | 'volunteer'
  | 'emergency_vehicle';

export type ResourceStatus = 'AVAILABLE' | 'ASSIGNED' | 'IN_TRANSIT' | 'UNAVAILABLE';
export type AllocationStatus = 'proposed' | 'approved' | 'rejected' | 'superseded' | 'dispatched';
export type DispatchStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_TRANSIT' | 'COMPLETED';

export type ReplanTriggerType =
  | 'hospital_power_failure'
  | 'boat_unavailable'
  | 'new_flood_incident'
  | 'population_increase'
  | 'weather_worsens'
  | 'monitor_detected_change';

export type ActivityLevel = 'info' | 'warning' | 'critical' | 'success';
export type ActivityCategory =
  | 'report'
  | 'ai'
  | 'fusion'
  | 'priority'
  | 'allocation'
  | 'conflict'
  | 'dispatch'
  | 'replan'
  | 'system';

export interface ResourceRequirement {
  type: ResourceType;
  quantity: number;
}

export interface ExtractedReportData {
  incident_type: IncidentType;
  location: string;
  people_affected: number;
  required_resources: ResourceRequirement[];
  severity: Severity;
  urgency: number; // 0-100
  medical_urgency: number; // 0-100
  is_critical_infrastructure: boolean;
  confidence: number; // 0-1
  summary: string;
}

export interface Report {
  id: string;
  code: string;
  source: ReportSource;
  raw_text: string;
  reporter?: string | null;
  extracted?: ExtractedReportData | null;
  extraction_method?: ExtractionMethod;
  confidence: number;
  incident_id?: string | null;
  is_duplicate: boolean;
  status: ReportStatus;
  received_at: string;
  created_at: string;
  updated_at: string;
}

export interface PriorityBreakdownItem {
  factor: string;
  weight: number;
  value: number;
  contribution: number;
}

export interface PriorityResult {
  score: number;
  breakdown: PriorityBreakdownItem[];
  reason: string;
}

export interface Incident {
  id: string;
  code: string;
  name: string;
  type: IncidentType;
  location_name: string;
  lat: number;
  lng: number;
  people_affected: number;
  severity: Severity;
  urgency: number;
  medical_urgency: number;
  is_critical_infrastructure: boolean;
  confidence: number;
  required_resources: ResourceRequirement[];
  status: IncidentStatus;
  priority_score: number;
  priority_breakdown: PriorityBreakdownItem[];
  summary: string;
  ai_analysis?: Record<string, any>;
  report_count: number;
  created_at: string;
  updated_at: string;
}

export interface IncidentReportRelation {
  incident_id: string;
  report_id: string;
  relation: 'primary' | 'duplicate' | 'related';
  similarity: number;
  reasoning: string;
}

export interface Resource {
  id: string;
  code: string;
  type: ResourceType;
  name: string;
  total_quantity: number;
  available_quantity: number;
  location_name: string;
  lat: number;
  lng: number;
  status: ResourceStatus;
  assigned_incident_id?: string | null;
  estimated_available_at?: string | null;
  is_bulk: boolean;
  created_at: string;
  updated_at: string;
}

export interface Allocation {
  id: string;
  plan_id: string;
  plan_version: number;
  incident_id: string;
  resource_id: string;
  quantity: number;
  priority_score: number;
  distance_km: number;
  eta_minutes: number;
  reason: string;
  status: AllocationStatus;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

export interface DispatchNotification {
  channel: 'sms' | 'radio' | 'app' | 'pager';
  message: string;
  timestamp: string;
  recipient?: string;
}

export interface Dispatch {
  id: string;
  code: string;
  allocation_id: string;
  incident_id: string;
  resource_id: string;
  quantity: number;
  destination: string;
  priority_score: number;
  eta_minutes: number;
  reason: string;
  requires_approval: boolean;
  status: DispatchStatus;
  decided_by?: string | null;
  decided_at?: string | null;
  notification?: DispatchNotification | null;
  created_at: string;
  updated_at: string;
}

export interface ResourceShortfall {
  incident_id: string;
  incident_code: string;
  incident_name: string;
  type: ResourceType;
  shortfall: number;
}

export interface ResourceConflict {
  resource_type: ResourceType;
  required: number;
  available: number;
  shortage: number;
  competing_incidents: Array<{
    incident_id: string;
    incident_code: string;
    incident_name: string;
    quantity: number;
    priority_score: number;
  }>;
  recommended_resolution: string;
  served: Array<{ incident_id: string; incident_name: string; quantity: number }>;
  deferred: Array<{ incident_id: string; incident_name: string; shortfall: number }>;
}

export interface AllocationPlanResult {
  plan_id: string;
  plan_version: number;
  allocations: Allocation[];
  conflicts: ResourceConflict[];
  unmet: ResourceShortfall[];
  ai_explanation?: string;
}

export interface ReplanDiff {
  kept: Allocation[];
  moved: Array<{
    resource_id: string;
    resource_name: string;
    resource_code: string;
    from_incident_id: string;
    from_incident_name: string;
    to_incident_id: string;
    to_incident_name: string;
    quantity: number;
    reason: string;
  }>;
  added: Allocation[];
  removed: Allocation[];
  unmet: ResourceShortfall[];
}

export interface ReplanningEvent {
  id: string;
  trigger_type: ReplanTriggerType;
  trigger_description: string;
  trigger_payload?: Record<string, any>;
  before_plan: AllocationPlanResult;
  after_plan: AllocationPlanResult;
  diff: ReplanDiff;
  conflicts: ResourceConflict[];
  ai_explanation: string;
  status: 'completed' | 'pending_approval' | 'superseded';
  created_at: string;
}

export interface ActivityLog {
  id: string;
  level: ActivityLevel;
  category: ActivityCategory;
  message: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface SystemSettings {
  key: string;
  value: any;
}
