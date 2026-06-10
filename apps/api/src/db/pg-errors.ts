/** Postgres unique_violation (23505) detection through the drizzle/postgres-js error chain. */
export function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let i = 0; i < 5 && current; i++) {
    if ((current as { code?: string }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
