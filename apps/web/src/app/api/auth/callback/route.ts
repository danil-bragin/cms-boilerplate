import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as client from 'openid-client';
import { oidcConfig, sessionFromTokens } from '@/lib/oidc';
import { sealSession } from '@/lib/session';

export async function GET(req: Request): Promise<NextResponse> {
  const jar = await cookies();
  const stash = jar.get('cms_oidc')?.value;
  if (!stash) {
    return NextResponse.redirect(new URL('/api/auth/login', req.url));
  }
  const { verifier, state, returnTo } = JSON.parse(stash) as {
    verifier: string;
    state: string;
    returnTo: string;
  };
  jar.delete('cms_oidc');

  const config = await oidcConfig();
  const tokens = await client.authorizationCodeGrant(config, new URL(req.url), {
    pkceCodeVerifier: verifier,
    expectedState: state,
  });

  await sealSession(sessionFromTokens(tokens));
  return NextResponse.redirect(new URL(returnTo.startsWith('/') ? returnTo : '/admin', req.url));
}
