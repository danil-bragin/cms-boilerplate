import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export type CmsRole = 'cms-admin' | 'cms-editor' | 'cms-viewer';

export interface AuthContext {
  sub: string;
  email: string;
  name: string;
  roles: CmsRole[];
}

type Jwks = Parameters<typeof jwtVerify>[1];

export interface VerifierOptions {
  issuer: string;
  audience: string;
  /** Injectable key set for tests; defaults to Keycloak's remote JWKS. */
  jwks?: Jwks;
}

export function createVerifier(opts: VerifierOptions) {
  const jwks =
    opts.jwks ??
    createRemoteJWKSet(new URL(`${opts.issuer}/protocol/openid-connect/certs`));

  return async function verifyAccessToken(token: string): Promise<AuthContext> {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: opts.issuer,
      audience: opts.audience,
    });
    if (!payload.sub) throw new Error('token has no sub claim');
    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : '',
      name: typeof payload.name === 'string' ? payload.name : '',
      roles: extractRoles(payload),
    };
  };
}

export type VerifyAccessToken = ReturnType<typeof createVerifier>;

export function extractRoles(payload: JWTPayload): CmsRole[] {
  const realm = (payload.realm_access as { roles?: string[] } | undefined)?.roles ?? [];
  return realm.filter((r): r is CmsRole => r.startsWith('cms-'));
}
