import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as client from 'openid-client';
import { oidcConfig } from '@/lib/oidc';

export async function GET(req: Request): Promise<NextResponse> {
  const config = await oidcConfig();
  const url = new URL(req.url);
  const raw = url.searchParams.get('returnTo') ?? '/admin';
  // local paths only: '//' and '/\\' are protocol-relative escapes
  const returnTo = /^\/(?![/\\])/.test(raw) ? raw : '/admin';

  const verifier = client.randomPKCECodeVerifier();
  const challenge = await client.calculatePKCECodeChallenge(verifier);
  const state = client.randomState();

  const redirectUri = `${url.origin}/api/auth/callback`;
  const authUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: 'openid profile email',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });

  const jar = await cookies();
  jar.set('cms_oidc', JSON.stringify({ verifier, state, returnTo }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 300,
  });

  return NextResponse.redirect(authUrl);
}
