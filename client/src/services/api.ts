type Envelope<T> = { data: T; error: { message?: string } | null };

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload: Envelope<T>;
  try {
    payload = await response.json() as Envelope<T>;
  } catch {
    throw new Error(`Server returned an unreadable response (${response.status}).`);
  }
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || `Request failed (${response.status}).`);
  }
  return payload.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, 'POST', body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>(path, 'PATCH', body),
};

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}