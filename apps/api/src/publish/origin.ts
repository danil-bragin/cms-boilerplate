/** Public origin for a site row: scheme + primary domain. Mirrors the web helper. */
export function siteOrigin(site: { domains: string[] }): string {
  const scheme = process.env.SITE_URL_SCHEME ?? 'https';
  const domain = site.domains[0] ?? 'localhost';
  const port = process.env.SITE_URL_PORT ? `:${process.env.SITE_URL_PORT}` : '';
  return `${scheme}://${domain}${port}`;
}
