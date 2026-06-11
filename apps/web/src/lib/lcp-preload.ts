import 'server-only';

/**
 * Find the s3Key of the first above-the-fold (priority) Image in Puck content,
 * so the page can emit a <link rel="preload" as="image"> for the LCP candidate.
 * Raw <img> can't trigger Next's automatic priority preload, so we do it here.
 */
export function findPriorityImage(puckData: unknown): string | null {
  let found: string | null = null;
  const walk = (node: unknown): void => {
    if (found) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (obj.type === 'Image') {
      const props = obj.props as { priority?: boolean; media?: { s3Key?: string } } | undefined;
      if (props?.priority && props.media?.s3Key) {
        found = props.media.s3Key;
        return;
      }
    }
    for (const v of Object.values(obj)) {
      if (typeof v === 'object' && v !== null) walk(v);
    }
  };
  walk((puckData as { content?: unknown }).content);
  return found;
}
