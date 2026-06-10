import 'server-only';
import * as client from 'openid-client';
import { extractRoles } from '@cms/auth';
import { decodeJwt } from 'jose';
import type { Session } from './session';

let configPromise: Promise<client.Configuration> | undefined;

export function oidcConfig(): Promise<client.Configuration> {
  if (!configPromise) {
    const issuer = process.env.KEYCLOAK_ISSUER;
    const clientId = process.env.KEYCLOAK_WEB_CLIENT_ID ?? 'cms-web';
    if (!issuer) throw new Error('KEYCLOAK_ISSUER is not set');
    configPromise = client.discovery(new URL(issuer), clientId, undefined, undefined, {
      execute: issuer.startsWith('http://') ? [client.allowInsecureRequests] : [],
    });
  }
  return configPromise;
}

export function sessionFromTokens(tokens: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}): Session {
  const claims = decodeJwt(tokens.access_token);
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? '',
    expiresAt: Date.now() + (tokens.expires_in ?? 60) * 1000,
    email: typeof claims.email === 'string' ? claims.email : '',
    name: typeof claims.name === 'string' ? claims.name : '',
    roles: extractRoles(claims),
  };
}

export async function refreshSession(session: Session): Promise<Session> {
  if (!session.refreshToken) throw new Error('no refresh token');
  const config = await oidcConfig();
  const tokens = await client.refreshTokenGrant(config, session.refreshToken);
  return sessionFromTokens(tokens);
}
