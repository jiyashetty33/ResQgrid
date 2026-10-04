-- ResQGrid Seed Data for Supabase
-- Run after schema.sql

-- 1. Initial System Settings
INSERT INTO system_settings (key, value) VALUES
('coordinator_name', '"Duty Coordinator"'::jsonb),
('replan_threshold', '15'::jsonb),
('auto_approve_noncritical', 'false'::jsonb),
('critical_requires_approval', 'true'::jsonb),
('automation_mode', '"local"'::jsonb),
('simulated_feed_interval_seconds', '10'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 2. Initial Resources (Mangaluru Region)
INSERT INTO resources (id, code, type, name, total_quantity, available_quantity, location_name, lat, lng, status, is_bulk) VALUES
('11111111-1111-1111-1111-111111110001', 'BOAT-01', 'boat', 'Rigid Inflatable Rescue Boat 1', 1, 1, 'Bunder Logistics Depot', 12.8555, 74.8355, 'AVAILABLE', false),
('11111111-1111-1111-1111-111111110002', 'BOAT-02', 'boat', 'Flood Evacuation Dinghy 2', 1, 1, 'Ullal Coastal Base', 12.8100, 74.8440, 'AVAILABLE', false),
('11111111-1111-1111-1111-111111110003', 'AMB-01', 'ambulance', 'Advanced Life Support Ambulance 1', 1, 1, 'Kankanady Emergency Depot', 12.8700, 74.8560, 'AVAILABLE', false),
('11111111-1111-1111-1111-111111110004', 'MED-01', 'medical_team', 'Rapid Trauma & Triage Team Alpha', 1, 1, 'Kankanady Emergency Depot', 12.8700, 74.8560, 'AVAILABLE', false),
('11111111-1111-1111-1111-111111110005', 'GEN-01', 'generator', '120kVA Heavy Diesel Generator Unit', 1, 1, 'Bunder Logistics Depot', 12.8555, 74.8355, 'AVAILABLE', false),
('11111111-1111-1111-1111-111111110006', 'VEH-01', 'emergency_vehicle', '4x4 High-Clearance Rescue Truck', 1, 1, 'Kankanady Emergency Depot', 12.8700, 74.8560, 'AVAILABLE', false),
('11111111-1111-1111-1111-111111110007', 'FOOD-POOL', 'food_kit', 'Emergency Ration Kits (24hr Family)', 500, 500, 'Bunder Logistics Depot', 12.8555, 74.8355, 'AVAILABLE', true),
('11111111-1111-1111-1111-111111110008', 'WATER-POOL', 'water_kit', 'Potable Water Canisters (15L)', 300, 300, 'Bunder Logistics Depot', 12.8555, 74.8355, 'AVAILABLE', true),
('11111111-1111-1111-1111-111111110009', 'VOL-POOL', 'volunteer', 'Civil Defense Disaster Volunteers', 10, 10, 'Kankanady Emergency Depot', 12.8700, 74.8560, 'AVAILABLE', true)
ON CONFLICT (code) DO NOTHING;

-- 3. Initial 7 Incidents
INSERT INTO incidents (id, code, name, type, location_name, lat, lng, people_affected, severity, urgency, medical_urgency, is_critical_infrastructure, confidence, required_resources, status, priority_score, summary, report_count) VALUES
('22222222-2222-2222-2222-222222220001', 'INC-A', 'School Evacuation Flood – Ullal', 'flood', 'Ullal', 12.8100, 74.8440, 180, 'HIGH', 80, 45, false, 0.95, '[{"type":"boat","quantity":1},{"type":"food_kit","quantity":120}]'::jsonb, 'new', 76.5, 'Heavy inundation around Ullal Govt School. 180 stranded students and faculty requiring waterborne rescue and food rations.', 4),
('22222222-2222-2222-2222-222222220002', 'INC-B', 'Riverside Settlement Inundation – Kulur', 'flood', 'Kulur', 12.9390, 74.8330, 60, 'HIGH', 75, 35, false, 0.92, '[{"type":"boat","quantity":1},{"type":"water_kit","quantity":60}]'::jsonb, 'new', 69.2, 'Gurupura river breach submerging low-lying homes. 60 residents stranded on rooftops needing boat evacuation and potable water.', 3),
('22222222-2222-2222-2222-222222220003', 'INC-C', 'Urban Water Stagnation & Blackout – Jeppu', 'infrastructure', 'Jeppu', 12.8470, 74.8380, 200, 'MEDIUM', 65, 25, false, 0.90, '[{"type":"generator","quantity":1},{"type":"food_kit","quantity":80},{"type":"water_kit","quantity":80}]'::jsonb, 'new', 63.8, 'Grid transformer submerged causing residential blackout. 200 residents require generator for drainage pumps and food supplies.', 3),
('22222222-2222-2222-2222-222222220004', 'INC-D', 'Senior Living Facility Isolation – Surathkal', 'medical', 'Surathkal', 12.9910, 74.8056, 25, 'HIGH', 80, 85, false, 0.94, '[{"type":"medical_team","quantity":1},{"type":"ambulance","quantity":1}]'::jsonb, 'new', 74.1, 'Isolated care home with 25 elders needing chronic medication triage and medical transport.', 3),
('22222222-2222-2222-2222-222222220005', 'INC-E', 'Road Debris & Landslide – Bajpe Ghat', 'landslide', 'Bajpe', 12.9760, 74.8890, 15, 'MEDIUM', 55, 20, false, 0.88, '[{"type":"emergency_vehicle","quantity":1},{"type":"volunteer","quantity":5}]'::jsonb, 'new', 51.4, 'Rock and mud obstruction blocking airport transit corridor; requires winch vehicle and road clearing crew.', 2),
('22222222-2222-2222-2222-222222220006', 'INC-F', 'Wharf Industrial Fire – Panambur', 'fire', 'Panambur', 12.9420, 74.8120, 12, 'HIGH', 85, 75, false, 0.93, '[{"type":"emergency_vehicle","quantity":1},{"type":"ambulance","quantity":1},{"type":"volunteer","quantity":5}]'::jsonb, 'new', 73.0, 'Lightning-induced electrical warehouse fire at industrial dock. 12 workers requiring containment and burn medical response.', 3),
('22222222-2222-2222-2222-222222220007', 'INC-G', 'Traffic Junction Waterlogging – Pumpwell', 'flood', 'Pumpwell', 12.8650, 74.8700, 8, 'LOW', 25, 10, false, 0.80, '[]'::jsonb, 'monitoring', 31.8, 'Low-severity pooling beneath flyover with slow vehicle flow. Situation stable, no urgent resources needed.', 2)
ON CONFLICT (code) DO NOTHING;

-- 4. Initial Activity Logs
INSERT INTO activity_logs (level, category, message, metadata) VALUES
('success', 'system', 'Database successfully populated with baseline emergency telemetry.', '{"version": "1.0.0"}'::jsonb),
('warning', 'conflict', 'Boat demand exceeds local unit availability. Contention flag active.', '{"resource": "boat", "deficit": 1}'::jsonb);
