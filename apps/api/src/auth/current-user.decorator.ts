import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthContext } from '@cms/auth';
import type { AuthedRequest } from './auth.guard.js';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.auth) throw new Error('CurrentUser used on an unauthenticated route');
  return req.auth;
});
