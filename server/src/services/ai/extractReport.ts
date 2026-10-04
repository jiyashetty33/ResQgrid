import { ExtractedReportData, ExtractionMethod } from '../../types/index.js';
import { callGeminiJson } from './geminiClient.js';
import { PROMPTS } from './prompts.js';
import { ExtractedReportSchema } from './schemas.js';
import { extractReportHeuristic } from './heuristicExtractor.js';

export interface ExtractionResult {
  data: ExtractedReportData;
  method: ExtractionMethod;
  confidence: number;
}

/**
 * Extracts structured disaster intelligence from raw unstructured text.
 * Always returns a validated object; guarantees zero crashes via heuristic fallback.
 */
export async function extractReport(rawText: string): Promise<ExtractionResult> {
  const geminiRes = await callGeminiJson<Record<string, any>>(PROMPTS.extractReport(rawText));

  if (geminiRes.ok && geminiRes.data) {
    // Validate with Zod
    const parsed = ExtractedReportSchema.safeParse(geminiRes.data);
    if (parsed.success) {
      return {
        data: parsed.data as ExtractedReportData,
        method: 'gemini',
        confidence: parsed.data.confidence,
      };
    }

    // Try repair once
    console.warn('[AI Extractor] Schema validation error:', parsed.error.message, '- attempting repair...');
    const repairPrompt = PROMPTS.repairJson(
      JSON.stringify(geminiRes.data),
      parsed.error.message
    );
    const repairRes = await callGeminiJson<Record<string, any>>(repairPrompt);

    if (repairRes.ok && repairRes.data) {
      const repairParsed = ExtractedReportSchema.safeParse(repairRes.data);
      if (repairParsed.success) {
        return {
          data: repairParsed.data as ExtractedReportData,
          method: 'gemini',
          confidence: repairParsed.data.confidence,
        };
      }
    }
  }

  // Graceful fallback to deterministic heuristic extractor
  const heuristicData = extractReportHeuristic(rawText);
  return {
    data: heuristicData,
    method: 'fallback',
    confidence: heuristicData.confidence,
  };
}
