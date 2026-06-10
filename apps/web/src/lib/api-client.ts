import 'server-only';
import { getSession } from './session';

const API_URL = () => process.env.API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Server-side fetch wrapper for the Nest API, bearer token from the session cookie. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await getSession();
  if (!session) throw new ApiError(401, 'no_session', 'Not authenticated');

  const res = await fetch(`${API_URL()}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init.headers,
      authorization: `Bearer ${session.accessToken}`,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    let code = 'api_error';
    let message = `API ${res.status}`;
    try {
      const body = (await res.json()) as { code?: string; message?: string };
      code = body.code ?? code;
      message = body.message ?? message;
    } catch {
      // non-json error body
    }
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as T;
}
