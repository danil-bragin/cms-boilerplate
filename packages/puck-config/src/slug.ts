/**
 * Stable, URL-safe heading slug for passage anchors (deep-linkable sections that
 * AI/RAG can address and users can jump to). Unicode-safe so non-Latin headings
 * (e.g. German/Russian) still produce meaningful ids.
 */
export function slugify(text: string): string {
  return text
    .replace(/<[^>]*>/g, '') // strip any markup
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-') // non-alphanumeric → hyphen
    .replace(/^-+|-+$/g, '') // trim hyphens
    .slice(0, 80);
}
