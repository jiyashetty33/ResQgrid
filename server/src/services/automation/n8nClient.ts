import { ENV } from '../../config/env.js';

export async function forwardToN8nWebhook(
  endpointPath: string,
  payload: Record<string, any>
): Promise<{ forwarded: boolean; error?: string }> {
  if (!ENV.N8N_ENABLED || !ENV.N8N_BASE_URL) {
    return { forwarded: false };
  }

  const url = `${ENV.N8N_BASE_URL.replace(/\/+$/, '')}/${endpointPath.replace(/^\/+/, '')}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': ENV.N8N_WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { forwarded: false, error: `n8n responded with status ${res.status}` };
    }
    return { forwarded: true };
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn(`[n8n Forwarder] Could not forward event to n8n (${err?.message || err}). Falling back to local pipeline.`);
    return { forwarded: false, error: err?.message };
  }
}
