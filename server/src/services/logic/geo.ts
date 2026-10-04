import { ResourceType } from '../../types/index.js';

export interface GeoLocation {
  name: string;
  lat: number;
  lng: number;
  aliases?: string[];
}

export const GAZETTEER: Record<string, GeoLocation> = {
  ullal: {
    name: 'Ullal',
    lat: 12.8100,
    lng: 74.8440,
    aliases: ['ullal', 'ullala', 'ullal school', 'ullal beach', 'someshwar'],
  },
  surathkal: {
    name: 'Surathkal',
    lat: 12.9910,
    lng: 74.8056,
    aliases: ['surathkal', 'suratkal', 'nitk', 'surathkal beach', 'elderly care'],
  },
  bunder: {
    name: 'Bunder',
    lat: 12.8555,
    lng: 74.8355,
    aliases: ['bunder', 'old port', 'dock', 'bunder port', 'wharf'],
  },
  kulur: {
    name: 'Kulur',
    lat: 12.9390,
    lng: 74.8330,
    aliases: ['kulur', 'kuloor', 'kulur bridge', 'gurupura river', 'kulur riverside'],
  },
  bajpe: {
    name: 'Bajpe',
    lat: 12.9760,
    lng: 74.8890,
    aliases: ['bajpe', 'airport road', 'kenjar', 'bajpe ghat'],
  },
  jeppu: {
    name: 'Jeppu',
    lat: 12.8470,
    lng: 74.8380,
    aliases: ['jeppu', 'jeppu market', 'morgans gate', 'jeppu bappal'],
  },
  pumpwell: {
    name: 'Pumpwell',
    lat: 12.8650,
    lng: 74.8700,
    aliases: ['pumpwell', 'pump well', 'mahaveera circle', 'kankanady bypass'],
  },
  kankanady: {
    name: 'Kankanady',
    lat: 12.8700,
    lng: 74.8560,
    aliases: ['kankanady', 'kankanadi', 'father muller', 'kankanady market'],
  },
  mangaladevi: {
    name: 'Mangaladevi',
    lat: 12.8350,
    lng: 74.8400,
    aliases: ['mangaladevi', 'mangala devi', 'bolar', 'hoige bazar'],
  },
  panambur: {
    name: 'Panambur',
    lat: 12.9420,
    lng: 74.8120,
    aliases: ['panambur', 'new mangalore port', 'panambur beach', 'nmp wharf', 'warehouse'],
  },
  hospital: {
    name: 'City Hospital – Kadri',
    lat: 12.8760,
    lng: 74.8580,
    aliases: ['city hospital', 'hospital', 'kadri', 'kadri hills', 'general hospital'],
  },
};

export const DEPOTS: GeoLocation[] = [
  { name: 'Bunder Logistics Depot', lat: 12.8555, lng: 74.8355 },
  { name: 'Kankanady Emergency Depot', lat: 12.8700, lng: 74.8560 },
];

/**
 * Calculates Haversine distance in kilometers between two lat/lng points.
 */
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

/**
 * Returns distance in km to the closest disaster response depot.
 */
export function distanceToNearestDepot(lat: number, lng: number): number {
  let minDistance = Infinity;
  for (const depot of DEPOTS) {
    const d = haversineDistanceKm(lat, lng, depot.lat, depot.lng);
    if (d < minDistance) {
      minDistance = d;
    }
  }
  return minDistance === Infinity ? 5.0 : minDistance;
}

/**
 * Matches a freeform text string against the gazetteer.
 */
export function matchGazetteerLocation(text: string): GeoLocation | null {
  const normalized = text.toLowerCase();
  for (const key of Object.keys(GAZETTEER)) {
    const loc = GAZETTEER[key];
    if (normalized.includes(loc.name.toLowerCase())) {
      return loc;
    }
    if (loc.aliases) {
      for (const alias of loc.aliases) {
        if (normalized.includes(alias)) {
          return loc;
        }
      }
    }
  }
  // Default to Bunder center if no match
  return null;
}

/**
 * Speed in km/h for various resource types.
 */
export const RESOURCE_SPEEDS_KMH: Record<ResourceType, number> = {
  boat: 20,
  ambulance: 45,
  medical_team: 40,
  generator: 35,
  emergency_vehicle: 40,
  volunteer: 30,
  food_kit: 35,
  water_kit: 35,
};

/**
 * Estimates ETA in minutes based on distance, resource type, and weather.
 */
export function calculateEtaMinutes(
  distanceKm: number,
  resourceType: ResourceType,
  weatherWorsened: boolean = false
): number {
  let speed = RESOURCE_SPEEDS_KMH[resourceType] || 35;
  if (weatherWorsened && resourceType === 'boat') {
    speed = speed * 0.75; // 25% reduction for boat in severe weather
  }
  const prepTimeMinutes = 10;
  const travelMinutes = (distanceKm / speed) * 60;
  return Math.max(12, Math.round(prepTimeMinutes + travelMinutes));
}
