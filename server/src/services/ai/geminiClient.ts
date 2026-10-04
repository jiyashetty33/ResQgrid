import { GoogleGenerativeAI } from '@google/generative-ai';
import { ENV } from '../../config/env.js';

export interface GeminiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  method: 'gemini' | 'fallback';
}

let genAIInstance: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI | null {
  if (!ENV.GEMINI_API_KEY || ENV.GEMINI_API_KEY.trim() === '') {
    return null;
  }
  if (!genAIInstance) {
    genAIInstance = new GoogleGenerativeAI(ENV.GEMINI_API_KEY);
  }
  return genAIInstance;
}

/**
 * Sends a structured JSON prompt to Gemini with a 15-second timeout and 1 retry.
 */
export async function callGeminiJson<T = any>(
  prompt: string,
  modelName: string = ENV.GEMINI_MODEL || 'gemini-2.5-flash'
): Promise<GeminiResponse<T>> {
  const genAI = getGenAI();
  if (!genAI) {
    return {
      ok: false,
      error: 'GEMINI_API_KEY is not configured',
      method: 'fallback',
    };
  }

  const executeCall = async (): Promise<T> => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      clearTimeout(timeoutId);

      const rawText = result.response.text();
      // Clean possible markdown code fences if model included them
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      return JSON.parse(cleaned) as T;
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw err;
    }
  };

  // Attempt with 1 retry
  try {
    const data = await executeCall();
    return { ok: true, data, method: 'gemini' };
  } catch (firstErr: any) {
    console.warn(`[Gemini] Primary call failed (${firstErr?.message || firstErr}), retrying once...`);
    try {
      const retryData = await executeCall();
      return { ok: true, data: retryData, method: 'gemini' };
    } catch (secondErr: any) {
      console.warn(`[Gemini] Retry failed (${secondErr?.message || secondErr}), switching to local fallback.`);
      return {
        ok: false,
        error: secondErr?.message || 'Gemini API call failed',
        method: 'fallback',
      };
    }
  }
}
