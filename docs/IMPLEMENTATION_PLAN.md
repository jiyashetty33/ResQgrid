# ResQGrid - Implementation Plan

**Project:** ResQGrid  
**Tagline:** "Turning fragmented disaster signals into coordinated, adaptive response."  
**Core Story:** UNDERSTAND → FUSE → PRIORITIZE → ALLOCATE → DISPATCH → MONITOR → REPLAN  
**Star Feature:** Dynamic Replanning (situation change detection, priority/allocation recalculation, visual BEFORE vs AFTER with AI/template explanation).

---

## Architecture Principles
1. **Frontend → Express API → Supabase**: Zero client secrets, clean separation.
2. **AI / Deterministic Separation**: 
   - AI (Gemini) handles unstructured language: extraction, reasoning, incident & situation summaries, and human-readable explanations.
   - Deterministic logic handles all math, scoring, constraints, fair-share allocation, and DB mutations.
3. **Triple Zero-External-Services Graceful Fallbacks**:
   - AI: Gemini API with fast Flash model -> Deterministic heuristic extractor (gazetteer, regex, token search) + template explanations.
   - DB: Supabase PostgreSQL -> Thread-safe in-memory Repository with identical schema & seed.
   - Automation: n8n Webhook integration -> Built-in Local Automation Mode loop.
4. **Human-in-the-Loop**: Coordinator approval required for Critical/High dispatches and reassignments; AI only suggests recommendations.

---

## Phase 1: Project Setup & Core Server Architecture
- Root `package.json` with scripts (`dev`, `install:all`, `dev:server`, `dev:client`, `build`, `test`, `seed`).
- Server setup with Express, TypeScript, Zod, CORS, Helmet, Morgan, Dotenv.
- Config and environment validation (`/server/src/config/env.ts`).
- Standardized API response structure and error handling middleware.

## Phase 2: Deterministic Logic Engine & Unit Tests
- `geo.ts`: Haversine distance calculations and gazetteer lookup (Mangaluru region: Ullal, Surathkal, Bunder, Kulur, Bajpe, Jeppu, Pumpwell, Kankanady, Mangaladevi, Panambur).
- `priority.ts`: 0–100 transparent scoring function, weight breakdown, and human-readable factor reasons.
- `conflicts.ts`: Resource contention detection, competing incident tracking, deterministic resolution recommendations.
- `allocation.ts`: Discrete nearest-unit matching + bulk fair-share rationing, ETA calculations, unmet shortfalls.
- `fusion.ts`: Token Jaccard similarity, spatial clustering (<1.5km), deduplication, max-merge logic, confidence corroboration.
- `replanning.ts`: Snapshotting, trigger mutations, lock state handling, reassignment threshold (15pts), delta diffing (`kept`, `moved`, `added`, `removed`, `unmet`).
- Comprehensive Vitest unit tests for all core algorithms.

## Phase 3: Data Layer & Seed Data
- Database schema (`/database/schema.sql`) for PostgreSQL / Supabase with UUIDs, human-readable codes, check constraints, indexes, triggers.
- Seed data (`/database/seed.sql`) containing:
  - 2 depots (Bunder, Kankanady)
  - Resources: 2 boats, 1 ambulance, 1 medical team, 1 generator, 1 emergency vehicle, bulk food/water kits and volunteers.
  - 22 realistic reports spanning 7 incidents (INC-A through INC-G) with deliberate duplicates, varying wording, and edge cases.
- Repository pattern (`IRepository`):
  - `memoryRepo.ts`: Robust in-memory implementation with full filtering, sorting, mutation, snapshotting, and transaction-safe operations.
  - `supabaseRepo.ts`: Supabase client implementation with automatic fallback on connection error.
  - `repoFactory.ts`: Auto-detects Supabase availability, seamlessly switches to in-memory on failure.

## Phase 4: AI Layer with Graceful Fallback
- `geminiClient.ts`: SDK/fetch wrapper, schema-enforced JSON mode, low temperature (0.2), 15s timeout, single repair retry.
- `heuristicExtractor.ts`: Regex/token parser with gazetteer location matching, number extraction, severity rules.
- `extractReport.ts`, `relatedReports.ts`, `summarize.ts`, `explain.ts`:
  - Structured extraction with Zod validation.
  - Situation summary with 20s caching.
  - Deterministic template generators for all explanations when AI is offline.

## Phase 5: Express API Routes & Automation Engine
- REST endpoints:
  - `/api/health`: System health & service modes (AI, Data, Automation).
  - `/api/reports`: Ingestion pipeline, batch ingest, `/analyze` preview.
  - `/api/incidents`: CRUD, detail view with related reports and priority breakdown.
  - `/api/resources`: Inventory, status toggles.
  - `/api/allocations`: Generate plan, view current plan, conflicts, unmet needs.
  - `/api/replan`: Trigger simulation (`hospital_power_failure`, `boat_unavailable`, `new_flood_incident`, `population_increase`, `weather_worsens`), history.
  - `/api/dispatches`: Approve, reject, filter.
  - `/api/dashboard/summary`, `/api/activity`, `/api/analytics`.
  - `/api/demo/run`, `/api/demo/progress`, `/api/demo/reset`: Step-by-step orchestrator with progress events.
  - `/api/feed/start`, `/api/feed/stop`: Background simulation.
  - `/api/webhooks/*`: n8n webhook targets with secret verification.
  - `/api/automation/status`: Pipeline node statuses and execution telemetry.
- Automation:
  - `localAutomation.ts`: In-process background runner for monitoring, ticks, and feed updates.
  - `n8nClient.ts`: Outbound dispatcher to n8n if enabled.

## Phase 6: Frontend Command Center
- Vite + React + TypeScript + Tailwind CSS setup.
- Dark command-center design system (deep navy `#0a0f1c`, glowing status badges, glassmorphic cards, tabular typography).
- Reusable UI component library (`Card`, `Badge`, `Button`, `Modal`, `Tabs`, `Table`, `AIBadge`, `PriorityBar`, `Skeleton`, `Toast`).
- Interactive Leaflet Map with dark tiles, custom pulsed markers for CRITICAL/HIGH alerts, depot markers, click-to-open drawer.
- 10 Complete Pages:
  1. **Command Center**: Overview stats, Leaflet map, dynamic AI situation summary, live activity timeline, quick-action replan alert.
  2. **Live Incidents**: Search/filter/sort, creation modal, edit drawer, detailed drill-down (reports, priority chart, allocations).
  3. **Resource Allocation**: Priority breakdown with formulas, active resource conflicts banner, Suggested Allocation with send-to-dispatch.
  4. **Replanning Center (Star Feature)**: Current plan, 5 trigger simulation buttons, animated BEFORE vs AFTER comparison, reassignment diff cards, AI explanations, coordinator approval actions.
  5. **Dispatch Center**: Pending/Approved/Rejected queues, coordinator signature verification, simulated dispatch toasts.
  6. **Reports (Ingestion)**: Report submission, real-time AI extract preview, 22-report sample batch loader, simulated live feed toggle.
  7. **Resources**: Inventory by category, status toggle, mark unavailable (triggers auto-replan check).
  8. **Analytics**: Recharts dashboards (severity breakdown, resource utilization, duplicate deduplication rate, replan events).
  9. **Automation**: Interactive visual n8n pipeline graph, node statuses, execution telemetry, webhook tester.
  10. **Settings**: Coordinator identity, replan threshold, service status indicators, demo reset.
- Global "RUN FULL DEMO" modal/stepper overlay with automated and step-by-step execution.

## Phase 7: n8n Workflow Assets
- Workflow 1: `resqgrid-main-pipeline.json` (report intake → analyze → fuse → priority → allocate).
- Workflow 2: `resqgrid-monitor-replan.json` (scheduled polling → plan validation → replan trigger).
- Workflow 3: `resqgrid-situation-change.json` (situation change listener → replan dispatch).
- n8n documentation and setup instructions in `/n8n/README.md`.

## Phase 8: Testing, Verification & Documentation
- Unit tests run with 100% pass rate.
- End-to-end API verification via curl and test scripts.
- Fallback verification with zero external keys.
- Complete `README.md`, `/docs/ARCHITECTURE.md`, `/docs/DEMO_SCRIPT.md`.
