import { describe, expect, it } from 'vitest';
import { diffPuck } from '../puck-diff';

const mk = (title: string, blocks: Array<{ id: string; type: string; [k: string]: unknown }>) => ({
  root: { props: { title } },
  content: blocks.map((b) => ({ type: b.type, props: { id: b.id, ...b } })),
  zones: {},
});

describe('diffPuck', () => {
  it('detects added, removed, changed blocks and root changes', () => {
    const from = mk('Old', [
      { id: 'a', type: 'Heading', text: 'Hi' },
      { id: 'b', type: 'Text', text: 'gone' },
    ]);
    const to = mk('New', [
      { id: 'a', type: 'Heading', text: 'Hello' },
      { id: 'c', type: 'Button', label: 'Click' },
    ]);
    const d = diffPuck(from, to);
    expect(d.rootChanges).toContainEqual({ key: 'title', from: 'Old', to: 'New' });
    const byId = Object.fromEntries(d.blocks.map((b) => [b.id, b]));
    expect(byId['a'].status).toBe('changed');
    expect(byId['a'].propChanges).toContainEqual({ key: 'text', from: 'Hi', to: 'Hello' });
    expect(byId['b'].status).toBe('removed');
    expect(byId['c'].status).toBe('added');
  });

  it('reports no diff for identical payloads', () => {
    const x = mk('Same', [{ id: 'a', type: 'Text', text: 'x' }]);
    const d = diffPuck(x, structuredClone(x));
    expect(d.rootChanges).toHaveLength(0);
    expect(d.blocks).toHaveLength(0);
  });
});
