import { ExtractedReportData, IncidentType, ResourceRequirement, Severity } from '../../types/index.js';
import { matchGazetteerLocation } from '../logic/geo.js';

/**
 * Deterministic heuristic report extractor.
 * Operates with 100% reliability offline without external APIs.
 */
export function extractReportHeuristic(text: string): ExtractedReportData {
  const lower = text.toLowerCase();

  // 1. Identify Location from Gazetteer
  const matchedLoc = matchGazetteerLocation(text);
  const location = matchedLoc ? matchedLoc.name : 'Mangaluru Central';

  // 2. Incident Type detection
  let incident_type: IncidentType = 'flood';
  if (/fire|flame|smoke|blaze|burning/.test(lower)) {
    incident_type = 'fire';
  } else if (/landslide|mudslide|debris|rocks falling|hill slip/.test(lower)) {
    incident_type = 'landslide';
  } else if (/ventilator|icu|hospital|patient|cardiac|oxygen|casualty|medical emergency/.test(lower)) {
    incident_type = 'medical';
  } else if (/power failure|blackout|grid failure|transformer|substation|generator/.test(lower)) {
    incident_type = 'infrastructure';
  } else if (/cyclone|squall|storm|wind|gale|roof blown/.test(lower)) {
    incident_type = 'storm';
  } else if (/flood|water rising|inundated|submerged|waterlogging|overflow/.test(lower)) {
    incident_type = 'flood';
  } else if (/traffic|lost|irrelevant|party|weather forecast/.test(lower)) {
    incident_type = 'other';
  }

  // 3. Extract People Affected
  let people_affected = 0;
  const peopleMatches = [
    /(\d+)\s*(people|persons|residents|victims|elders|kids|children|patients|trapped|affected)/i,
    /about\s*(\d+)/i,
    /around\s*(\d+)/i,
    /nearly\s*(\d+)/i,
    /(\d+)\s*stranger/i,
  ];

  for (const regex of peopleMatches) {
    const match = text.match(regex);
    if (match && match[1]) {
      const parsed = parseInt(match[1], 10);
      if (!isNaN(parsed) && parsed > 0 && parsed < 100000) {
        people_affected = parsed;
        break;
      }
    }
  }

  // Contextual fallback for people count if none stated
  if (people_affected === 0) {
    if (/elderly care|nursing home/.test(lower)) people_affected = 25;
    else if (/school|shelter/.test(lower)) people_affected = 100;
    else if (/hospital|icu/.test(lower)) people_affected = 120;
    else if (/family|household/.test(lower)) people_affected = 5;
    else if (incident_type === 'other') people_affected = 0;
    else people_affected = 15;
  }

  // 4. Resource requirements
  const resources: ResourceRequirement[] = [];

  if (/boat|dinghy|drowning|water rising|stranded by water/.test(lower) || (incident_type === 'flood' && people_affected > 20)) {
    resources.push({ type: 'boat', quantity: people_affected > 100 ? 2 : 1 });
  }

  if (/generator|power failure|blackout|electricity|grid/.test(lower)) {
    resources.push({ type: 'generator', quantity: 1 });
  }

  if (/hospital|icu|ventilator|breathing|elderly care|heart|serious|casualty/.test(lower) || incident_type === 'medical') {
    resources.push({ type: 'medical_team', quantity: 1 });
    resources.push({ type: 'ambulance', quantity: 1 });
  } else if (/injured|hurt|first aid|ambulance/.test(lower)) {
    resources.push({ type: 'ambulance', quantity: 1 });
  }

  if (/landslide|road blocked|tree fell|clearing|debris/.test(lower)) {
    resources.push({ type: 'emergency_vehicle', quantity: 1 });
    resources.push({ type: 'volunteer', quantity: 5 });
  }

  if (/food|ration|meals|hungry|starving/.test(lower) || (incident_type === 'flood' && people_affected > 30)) {
    resources.push({ type: 'food_kit', quantity: Math.min(500, Math.max(20, people_affected)) });
  }

  if (/drinking water|water kits|clean water|thirst/.test(lower) || (incident_type === 'flood' && people_affected > 30)) {
    resources.push({ type: 'water_kit', quantity: Math.min(300, Math.max(20, people_affected)) });
  }

  if (/volunteer|helping hands|manpower/.test(lower) && !resources.some((r) => r.type === 'volunteer')) {
    resources.push({ type: 'volunteer', quantity: 5 });
  }

  // Ensure at least one resource if disaster type
  if (resources.length === 0 && incident_type !== 'other') {
    if (incident_type === 'flood') resources.push({ type: 'boat', quantity: 1 });
    else resources.push({ type: 'emergency_vehicle', quantity: 1 });
  }

  // 5. Critical Infrastructure check
  const is_critical_infrastructure =
    /hospital|icu|ventilator|power plant|substation|dam|port|airport|bridge/.test(lower);

  // 6. Medical urgency
  let medical_urgency = 15;
  if (/ventilator|icu|life support|cardiac|critical condition/.test(lower)) medical_urgency = 95;
  else if (/elderly care|stroke|severe injury|dialysis/.test(lower)) medical_urgency = 85;
  else if (/injured|pregnant|infants|kids sick/.test(lower)) medical_urgency = 65;
  else if (incident_type === 'medical') medical_urgency = 75;

  // 7. Urgency
  let urgency = 50;
  if (is_critical_infrastructure || /immediately|emergency|dying|rising fast|submerged/.test(lower)) {
    urgency = 90;
  } else if (/urgent|soon|water rising|kids inside/.test(lower)) {
    urgency = 75;
  } else if (/low-lying|waterlogging|minor/.test(lower)) {
    urgency = 30;
  }

  // 8. Severity
  let severity: Severity = 'MEDIUM';
  if (is_critical_infrastructure || medical_urgency >= 90 || /life threatening|catastrophic|critical/.test(lower)) {
    severity = 'CRITICAL';
  } else if (urgency >= 75 || people_affected >= 50 || /danger|severe|trapped|fire/.test(lower)) {
    severity = 'HIGH';
  } else if (/waterlogging|minor|puddle|slow/.test(lower) || people_affected <= 5) {
    severity = 'LOW';
  }

  // 9. Confidence
  let confidence = 0.88;
  if (lower.length < 25 || /someone told me|maybe|rumor/.test(lower)) {
    confidence = 0.45;
  } else if (/non-disaster|party|sale|advertising|movie/.test(lower)) {
    confidence = 0.20;
  } else if (matchedLoc && people_affected > 0) {
    confidence = 0.95;
  }

  // 10. Summary
  const summary = `${severity} ${incident_type} reported in ${location}. Approximately ${people_affected} people affected; primary needs: ${
    resources.map((r) => `${r.type} (${r.quantity})`).join(', ') || 'assessment'
  }.`;

  return {
    incident_type,
    location,
    people_affected,
    required_resources: resources,
    severity,
    urgency,
    medical_urgency,
    is_critical_infrastructure,
    confidence,
    summary,
  };
}
