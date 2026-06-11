/** Pure input validators (no component deps — safe to unit-test in isolation). */
export function isValidHostname(s: string): boolean {
  return /^[a-z0-9.-]+$/.test(s) && s.length <= 253;
}

export function isValidLocale(s: string): boolean {
  return /^[a-z]{2}(-[A-Z]{2})?$/.test(s);
}
