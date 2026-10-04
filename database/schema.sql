-- ResQGrid PostgreSQL / Supabase Schema
-- Architecture: Frontend -> Express API -> Supabase / Memory Fallback

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Function to handle auto-updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 1. INCIDENTS
CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('flood', 'fire', 'storm', 'medical', 'infrastructure', 'landslide', 'other')),
    location_name TEXT NOT NULL,
    lat NUMERIC(9, 6) NOT NULL,
    lng NUMERIC(9, 6) NOT NULL,
    people_affected INT NOT NULL DEFAULT 0,
    severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    urgency INT NOT NULL CHECK (urgency >= 0 AND urgency <= 100),
    medical_urgency INT NOT NULL CHECK (medical_urgency >= 0 AND medical_urgency <= 100),
    is_critical_infrastructure BOOLEAN NOT NULL DEFAULT false,
    confidence NUMERIC(4, 2) NOT NULL DEFAULT 0.85,
    required_resources JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'monitoring', 'allocated', 'dispatched', 'resolved')),
    priority_score NUMERIC(5, 2) NOT NULL DEFAULT 50.0,
    priority_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
    summary TEXT NOT NULL,
    ai_analysis JSONB DEFAULT '{}'::jsonb,
    report_count INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_incidents_updated_at
    BEFORE UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_priority ON incidents(priority_score DESC);

-- 2. REPORTS
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL CHECK (source IN ('social', 'form', 'emergency_call', 'news', 'ngo', 'weather')),
    raw_text TEXT NOT NULL,
    reporter TEXT,
    extracted JSONB,
    extraction_method TEXT CHECK (extraction_method IN ('gemini', 'fallback')),
    confidence NUMERIC(4, 2) NOT NULL DEFAULT 0.80,
    incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
    is_duplicate BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'analyzed', 'linked', 'rejected')),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_reports_updated_at
    BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_incident_id ON reports(incident_id);

-- 3. INCIDENT_REPORTS (Relation / Fusion Mapping)
CREATE TABLE IF NOT EXISTS incident_reports (
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    relation TEXT NOT NULL CHECK (relation IN ('primary', 'duplicate', 'related')),
    similarity NUMERIC(4, 2) NOT NULL DEFAULT 1.0,
    reasoning TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (incident_id, report_id)
);

-- 4. RESOURCES
CREATE TABLE IF NOT EXISTS resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('boat', 'ambulance', 'medical_team', 'generator', 'food_kit', 'water_kit', 'volunteer', 'emergency_vehicle')),
    name TEXT NOT NULL,
    total_quantity INT NOT NULL DEFAULT 1,
    available_quantity INT NOT NULL DEFAULT 1,
    location_name TEXT NOT NULL,
    lat NUMERIC(9, 6) NOT NULL,
    lng NUMERIC(9, 6) NOT NULL,
    status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'ASSIGNED', 'IN_TRANSIT', 'UNAVAILABLE')),
    assigned_incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
    estimated_available_at TIMESTAMPTZ,
    is_bulk BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_resources_updated_at
    BEFORE UPDATE ON resources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);
CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type);

-- 5. ALLOCATIONS
CREATE TABLE IF NOT EXISTS allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL,
    plan_version INT NOT NULL DEFAULT 1,
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 1,
    priority_score NUMERIC(5, 2) NOT NULL,
    distance_km NUMERIC(6, 2) NOT NULL,
    eta_minutes INT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected', 'superseded', 'dispatched')),
    is_current BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_allocations_updated_at
    BEFORE UPDATE ON allocations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_allocations_plan_id ON allocations(plan_id);
CREATE INDEX IF NOT EXISTS idx_allocations_is_current ON allocations(is_current);

-- 6. DISPATCHES
CREATE TABLE IF NOT EXISTS dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    allocation_id UUID NOT NULL REFERENCES allocations(id) ON DELETE CASCADE,
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 1,
    destination TEXT NOT NULL,
    priority_score NUMERIC(5, 2) NOT NULL,
    eta_minutes INT NOT NULL,
    reason TEXT NOT NULL,
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'IN_TRANSIT', 'COMPLETED')),
    decided_by TEXT,
    decided_at TIMESTAMPTZ,
    notification JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_dispatches_updated_at
    BEFORE UPDATE ON dispatches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_dispatches_status ON dispatches(status);

-- 7. REPLANNING EVENTS
CREATE TABLE IF NOT EXISTS replanning_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_type TEXT NOT NULL,
    trigger_description TEXT NOT NULL,
    trigger_payload JSONB DEFAULT '{}'::jsonb,
    before_plan JSONB NOT NULL,
    after_plan JSONB NOT NULL,
    diff JSONB NOT NULL,
    conflicts JSONB DEFAULT '[]'::jsonb,
    ai_explanation TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_replanning_created ON replanning_events(created_at DESC);

-- 8. ACTIVITY LOGS
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'critical', 'success')),
    category TEXT NOT NULL CHECK (category IN ('report', 'ai', 'fusion', 'priority', 'allocation', 'conflict', 'dispatch', 'replan', 'system')),
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- 9. SYSTEM SETTINGS
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL
);

-- Prototype Note on Row Level Security (RLS):
-- RLS is permissive for prototype speed and hackathon presentation.
-- In production, enable RLS with role-based policies (coordinator, field responder, auditor).
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE replanning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all public access for prototype" ON incidents FOR ALL USING (true);
CREATE POLICY "Allow all public access for prototype" ON reports FOR ALL USING (true);
CREATE POLICY "Allow all public access for prototype" ON incident_reports FOR ALL USING (true);
CREATE POLICY "Allow all public access for prototype" ON resources FOR ALL USING (true);
CREATE POLICY "Allow all public access for prototype" ON allocations FOR ALL USING (true);
CREATE POLICY "Allow all public access for prototype" ON dispatches FOR ALL USING (true);
CREATE POLICY "Allow all public access for prototype" ON replanning_events FOR ALL USING (true);
CREATE POLICY "Allow all public access for prototype" ON activity_logs FOR ALL USING (true);
CREATE POLICY "Allow all public access for prototype" ON system_settings FOR ALL USING (true);
