import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/session';

export async function GET(req: Request): Promise<NextResponse> {
  await clearSession();
  const issuer = process.env.KEYCLOAK_ISSUER;
  const url = new URL(req.url);
  if (issuer) {
    const end = new URL(`${issuer}/protocol/openid-connect/logout`);
    end.searchParams.set('client_id', process.env.KEYCLOAK_WEB_CLIENT_ID ?? 'cms-web');
    end.searchParams.set('post_logout_redirect_uri', url.origin);
    return NextResponse.redirect(end);
  }
  return NextResponse.redirect(url.origin);
}
