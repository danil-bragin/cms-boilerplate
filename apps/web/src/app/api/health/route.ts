import { NextResponse } from 'next/server';

/** Liveness/readiness probe target — must never trigger a page render or DB hit. */
export function GET(): NextResponse {
  return NextResponse.json({ ok: true });
}
