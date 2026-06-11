import { describe, expect, it } from 'vitest';
import { isValidHostname, isValidLocale } from '../validators';

describe('admin input validators', () => {
  it('validates hostnames', () => {
    expect(isValidHostname('example.com')).toBe(true);
    expect(isValidHostname('sub.example.co.uk')).toBe(true);
    expect(isValidHostname('localhost')).toBe(true);
    expect(isValidHostname('Bad_Host')).toBe(false);
    expect(isValidHostname('has space')).toBe(false);
    expect(isValidHostname('a'.repeat(254))).toBe(false);
  });

  it('validates locale codes', () => {
    expect(isValidLocale('en')).toBe(true);
    expect(isValidLocale('en-US')).toBe(true);
    expect(isValidLocale('de')).toBe(true);
    expect(isValidLocale('english')).toBe(false);
    expect(isValidLocale('EN')).toBe(false);
    expect(isValidLocale('en_US')).toBe(false);
  });
});
