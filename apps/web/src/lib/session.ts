import 'server-only';
import { cookies } from 'next/headers';
import { EncryptJWT, jwtDecrypt } from 'jose';
import type { CmsRole } from '@cms/auth';

const COOKIE = 'cms_session';
const MAX_AGE_SECONDS = 60 * 60 * 8;

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** epoch ms when accessToken expires */
  expiresAt: number;
  email: string;
  name: string;
  roles: CmsRole[];
}

function sessionKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 64) {
    throw new Error('SESSION_SECRET must be a 32-byte hex string');
  }
  if (process.env.NODE_ENV === 'production' && /^0+$/.test(secret)) {
    throw new Error('SESSION_SECRET is the all-zeros placeholder — set a real secret in production');
  }
  return Uint8Array.from(Buffer.from(secret, 'hex'));
}

export async function sealSession(session: Session): Promise<void> {
  const jar = await cookies();
  const token = await new EncryptJWT({ s: session as unknown as Record<string, unknown> })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .encrypt(sessionKey());
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function readSession(): Promise<Session | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtDecrypt(raw, sessionKey());
    return payload.s as unknown as Session;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/**
 * Session for server components / route handlers.
 * Transparently refreshes the access token when it is about to expire.
 * Refresh re-seals the cookie — only possible in route handlers / server actions,
 * so RSC callers may get a session whose token has < 30s left; the API guard
 * still accepts it until exp.
 */
export async function getSession(opts: { refresh?: boolean } = {}): Promise<Session | null> {
  const session = await readSession();
  if (!session) return null;
  if (session.expiresAt - Date.now() > 30_000) return session;
  if (!opts.refresh) return session;

  const { refreshSession } = await import('./oidc');
  let next: Session;
  try {
    next = await refreshSession(session);
  } catch {
    // refresh genuinely failed (revoked/expired refresh token) — drop the cookie
    // if we can; ignore when called from an RSC render (cookie mutation forbidden)
    try {
      await clearSession();
    } catch {
      /* render context — cannot mutate cookies here */
    }
    return null;
  }
  // persist the rotated token when allowed; in an RSC render the cookie can't be
  // written, but the freshly refreshed session is still valid for this request
  try {
    await sealSession(next);
  } catch {
    /* render context — token valid in-memory, persisted on the next mutation */
  }
  return next;
}
