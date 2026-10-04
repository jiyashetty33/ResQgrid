import { z } from 'zod';

export const ResourceTypeEnum = z.enum([
  'boat',
  'ambulance',
  'medical_team',
  'generator',
  'food_kit',
  'water_kit',
  'volunteer',
  'emergency_vehicle',
]);

export const SeverityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const IncidentTypeEnum = z.enum([
  'flood',
  'fire',
  'storm',
  'medical',
  'infrastructure',
  'landslide',
  'other',
]);

export const ResourceRequirementSchema = z.object({
  type: ResourceTypeEnum,
  quantity: z.number().int().min(1),
});

export const ExtractedReportSchema = z.object({
  incident_type: IncidentTypeEnum,
  location: z.string().min(1),
  people_affected: z.number().int().min(0),
  required_resources: z.array(ResourceRequirementSchema),
  severity: SeverityEnum,
  urgency: z.number().min(0).max(100),
  medical_urgency: z.number().min(0).max(100),
  is_critical_infrastructure: z.boolean(),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1),
});

export type ExtractedReportZod = z.infer<typeof ExtractedReportSchema>;

export const RelatedReportsSchema = z.object({
  same_incident: z.boolean(),
  similarity: z.number().min(0).max(1),
  reasoning: z.string(),
});

export type RelatedReportsZod = z.infer<typeof RelatedReportsSchema>;

export const ExplanationSchema = z.object({
  explanation: z.string().min(1),
  key_factors: z.array(z.string()).optional(),
});
