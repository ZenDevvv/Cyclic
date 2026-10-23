// REST calls with the session token. Errors come back as ApiError with the server's message.
import type { ErrorCode } from '../../../shared/protocol.ts';

const TOKEN_KEY = 'scidama.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private mode: the session lasts for this tab only.
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'server', 'Cannot reach the server. Check your connection.');
  }
  const data = (await res.json().catch(() => null)) as (T & { ok?: false; error?: ErrorCode; message?: string }) | null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? 'server', data?.message ?? `Request failed (${res.status}).`);
  }
  return data as T;
}
