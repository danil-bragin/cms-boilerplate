import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { createVerifier, type AuthContext, type CmsRole, type VerifyAccessToken } from '@cms/auth';
import { users } from '@cms/db';
import { CONFIG, type AppConfig } from '../config/config.js';
import { DB, type Db } from '../db/db.module.js';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: CmsRole[]) => SetMetadata(ROLES_KEY, roles);

export const AUTH_VERIFIER = Symbol('AUTH_VERIFIER');

export function createAuthVerifier(cfg: AppConfig): VerifyAccessToken {
  return createVerifier({ issuer: cfg.KEYCLOAK_ISSUER, audience: cfg.KEYCLOAK_API_AUDIENCE });
}

export interface AuthedRequest extends Request {
  auth?: AuthContext;
}

@Injectable()
export class AuthGuard implements CanActivate {
  /** Subs already mirrored into the users table this process lifetime. */
  private readonly seenSubs = new Set<string>();

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AUTH_VERIFIER) private readonly verify: VerifyAccessToken,
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ code: 'missing_token', message: 'Bearer token required' });
    }

    let auth: AuthContext;
    try {
      auth = await this.verify(header.slice('Bearer '.length));
    } catch {
      throw new UnauthorizedException({ code: 'invalid_token', message: 'Token verification failed' });
    }
    req.auth = auth;

    await this.mirrorUser(auth);

    const required = this.reflector.getAllAndOverride<CmsRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required?.length) {
      const ok = auth.roles.some((r) => required.includes(r) || r === 'cms-admin');
      if (!ok) {
        throw new ForbiddenException({ code: 'forbidden', message: 'Insufficient role' });
      }
    }
    return true;
  }

  private async mirrorUser(auth: AuthContext): Promise<void> {
    if (this.seenSubs.has(auth.sub)) return;
    await this.db
      .insert(users)
      .values({ id: auth.sub, email: auth.email, displayName: auth.name })
      .onConflictDoUpdate({
        target: users.id,
        set: { email: auth.email, displayName: auth.name },
      });
    this.seenSubs.add(auth.sub);
    if (this.seenSubs.size > 10_000) this.seenSubs.clear();
  }
}
