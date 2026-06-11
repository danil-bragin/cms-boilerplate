/**
 * Structural diff of two Puck payloads. Compares root props and content blocks
 * (by id) → added / removed / changed, with per-prop changes. No external lib.
 */

export interface BlockChange {
  id: string;
  type: string;
  status: 'added' | 'removed' | 'changed';
  propChanges?: Array<{ key: string; from: unknown; to: unknown }>;
}

export interface PuckDiff {
  rootChanges: Array<{ key: string; from: unknown; to: unknown }>;
  blocks: BlockChange[];
}

interface Block {
  type: string;
  props: { id: string; [k: string]: unknown };
}

function blocksOf(data: unknown): Block[] {
  const content = (data as { content?: unknown }).content;
  return Array.isArray(content) ? (content as Block[]) : [];
}

function propDiff(a: Record<string, unknown>, b: Record<string, unknown>) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changes: Array<{ key: string; from: unknown; to: unknown }> = [];
  for (const key of keys) {
    if (key === 'id') continue;
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
      changes.push({ key, from: a[key], to: b[key] });
    }
  }
  return changes;
}

export function diffPuck(from: unknown, to: unknown): PuckDiff {
  const fromRoot = ((from as { root?: { props?: Record<string, unknown> } }).root?.props ?? {});
  const toRoot = ((to as { root?: { props?: Record<string, unknown> } }).root?.props ?? {});
  const rootChanges = propDiff(fromRoot, toRoot);

  const fromBlocks = new Map(blocksOf(from).map((b) => [b.props.id, b]));
  const toBlocks = new Map(blocksOf(to).map((b) => [b.props.id, b]));
  const blocks: BlockChange[] = [];

  for (const [id, b] of toBlocks) {
    if (!fromBlocks.has(id)) {
      blocks.push({ id, type: b.type, status: 'added' });
    } else {
      const changes = propDiff(fromBlocks.get(id)!.props, b.props);
      if (changes.length) blocks.push({ id, type: b.type, status: 'changed', propChanges: changes });
    }
  }
  for (const [id, b] of fromBlocks) {
    if (!toBlocks.has(id)) blocks.push({ id, type: b.type, status: 'removed' });
  }
  return { rootChanges, blocks };
}
