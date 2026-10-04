export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'new' | 'monitoring' | 'allocated' | 'dispatched' | 'resolved';
export type ResourceStatus = 'AVAILABLE' | 'ASSIGNED' | 'IN_TRANSIT' | 'UNAVAILABLE';
export type ResourceType = 'boat' | 'ambulance' | 'medical_team' | 'generator' | 'food_kit' | 'water_kit' | 'volunteer' | 'emergency_vehicle';

export interface Incident {
  id: string; code: string; name: string; type: string; location_name: string;
  lat: number; lng: number; people_affected: number; severity: Severity;
  urgency: number; medical_urgency: number; status: IncidentStatus;
  priority_score: number; summary: string; report_count: number;
  required_resources: Array<{ type: ResourceType; quantity: number }>;
  created_at: string; updated_at: string;
}

export interface Resource {
  id: string; code: string; name: string; type: ResourceType; status: ResourceStatus;
  total_quantity: number; available_quantity: number; location_name: string;
  lat: number; lng: number; is_bulk: boolean;
}

export interface Allocation {
  id: string; incident_id: string; resource_id: string; quantity: number;
  priority_score: number; distance_km: number; eta_minutes: number; reason: string;
  status: string; is_current: boolean;
}

export interface Dispatch {
  id: string; code: string; incident_id: string; resource_id: string; quantity: number;
  destination: string; priority_score: number; eta_minutes: number; reason: string;
  requires_approval: boolean; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_TRANSIT' | 'COMPLETED';
  resource_name: string; resource_code: string; incident_name: string; incident_code: string;
  incident_severity: Severity; decided_by?: string;
}

export interface ActivityLog {
  id: string; level: 'info' | 'warning' | 'critical' | 'success'; category: string;
  message: string; created_at: string;
}

export interface DashboardSummary {
  stats: { totalReports: number; activeIncidents: number; criticalCount: number; availableResources: number; pendingApprovals: number };
  severityCounts: Record<Severity, number>; typeCounts: Record<string, number>;
  conflicts: Array<{ resource_type: ResourceType; shortage: number; recommended_resolution: string }>;
  situationSummary: string; latestReplanEvent: { trigger_description: string; created_at: string } | null;
  hasPendingReplan: boolean;
}