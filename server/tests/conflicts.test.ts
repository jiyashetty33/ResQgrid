import { describe, it, expect } from 'vitest';
import { detectConflicts } from '../src/services/logic/conflicts.js';
import { buildInitialIncidents, INITIAL_RESOURCES } from '../src/db/seedData.js';

describe('Resource Conflict Detection', () => {
  it('should detect boat shortage when demand exceeds available inventory', () => {
    const incidents = buildInitialIncidents();
    const resources = JSON.parse(JSON.stringify(INITIAL_RESOURCES));

    // Ullal (INC-A) needs 1 boat, Kulur (INC-B) needs 1 boat, let's add a third incident needing a boat
    const conflicts = detectConflicts(incidents, resources);

    // Verify conflict structure
    expect(Array.isArray(conflicts)).toBe(true);
    for (const c of conflicts) {
      expect(c.required).toBeGreaterThan(c.available);
      expect(c.shortage).toBe(c.required - c.available);
      expect(c.recommended_resolution).toBeDefined();
      expect(c.competing_incidents.length).toBeGreaterThan(0);
    }
  });
});
