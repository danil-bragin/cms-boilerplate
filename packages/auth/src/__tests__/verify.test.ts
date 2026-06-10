import { beforeAll, describe, expect, it } from 'vitest';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JSONWebKeySet } from 'jose';
import { createVerifier, extractRoles } from '../verify.js';
import { canEdit, canPublish, puckPermissionsFor } from '../roles.js';

const ISSUER = 'http://localhost:8080/realms/cms';
const AUDIENCE = 'cms-api';

let privateKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

async function token(overrides: Record<string, unknown> = {}, opts: { issuer?: string; audience?: string; expSeconds?: number } = {}) {
  return new SignJWT({
    email: 'editor@cms.local',
    name: 'CMS Editor',
    realm_access: { roles: ['cms-editor', 'default-roles-cms', 'offline_access'] },
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject('user-123')
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + (opts.expSeconds ?? 300))
    .sign(privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey as CryptoKey;
  const jwk = await exportJWK(pair.publicKey);
  const keySet: JSONWebKeySet = { keys: [{ ...jwk, alg: 'RS256', use: 'sig' }] };
  jwks = createLocalJWKSet(keySet);
});

describe('createVerifier', () => {
  it('returns claims for a valid token', async () => {
    const verify = createVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks });
    const ctx = await verify(await token());
    expect(ctx).toEqual({
      sub: 'user-123',
      email: 'editor@cms.local',
      name: 'CMS Editor',
      roles: ['cms-editor'],
    });
  });

  it('rejects wrong issuer', async () => {
    const verify = createVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks });
    await expect(verify(await token({}, { issuer: 'http://evil' }))).rejects.toThrow();
  });

  it('rejects wrong audience', async () => {
    const verify = createVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks });
    await expect(verify(await token({}, { audience: 'other-api' }))).rejects.toThrow();
  });

  it('rejects expired token', async () => {
    const verify = createVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks });
    await expect(verify(await token({}, { expSeconds: -60 }))).rejects.toThrow();
  });
});

describe('extractRoles', () => {
  it('filters realm roles to cms-*', () => {
    expect(
      extractRoles({ realm_access: { roles: ['cms-admin', 'uma_authorization', 'cms-viewer'] } }),
    ).toEqual(['cms-admin', 'cms-viewer']);
  });

  it('handles missing realm_access', () => {
    expect(extractRoles({})).toEqual([]);
  });
});

describe('roles', () => {
  it('admin and editor can edit/publish, viewer cannot', () => {
    expect(canEdit(['cms-admin'])).toBe(true);
    expect(canEdit(['cms-editor'])).toBe(true);
    expect(canEdit(['cms-viewer'])).toBe(false);
    expect(canPublish(['cms-viewer'])).toBe(false);
    expect(canPublish(['cms-editor'])).toBe(true);
  });

  it('puck permissions: viewer is fully read-only', () => {
    expect(puckPermissionsFor(['cms-viewer'])).toEqual({
      edit: false,
      insert: false,
      delete: false,
      drag: false,
      duplicate: false,
    });
    expect(puckPermissionsFor(['cms-editor']).edit).toBe(true);
  });
});
