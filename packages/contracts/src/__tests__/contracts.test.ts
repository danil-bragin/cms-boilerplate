import { describe, expect, it } from 'vitest';
import { puckDataSchema } from '../puck-data.js';
import { createPageBody, saveDraftBody, pathSchema } from '../pages.js';
import { presignBody } from '../media.js';

describe('puckDataSchema', () => {
  it('accepts a minimal valid payload', () => {
    const data = {
      root: { props: { title: 'Home' } },
      content: [{ type: 'Heading', props: { id: 'Heading-1', text: 'hi' } }],
      zones: {},
    };
    expect(puckDataSchema.parse(data)).toMatchObject(data);
  });

  it('accepts payload without zones (slot-based)', () => {
    expect(() => puckDataSchema.parse({ root: {}, content: [] })).not.toThrow();
  });

  it('rejects content items without type', () => {
    expect(() =>
      puckDataSchema.parse({ root: {}, content: [{ props: { id: 'x' } }] }),
    ).toThrow();
  });

  it('rejects non-array content', () => {
    expect(() => puckDataSchema.parse({ root: {}, content: 'nope' })).toThrow();
  });
});

describe('pathSchema', () => {
  it.each(['/', '/about', '/a/b/c', '/foo-bar'])('accepts %s', (p) => {
    expect(pathSchema.parse(p)).toBe(p);
  });

  it.each(['about', '/about/', '/About', '/a b', '//x', ''])('rejects %s', (p) => {
    expect(() => pathSchema.parse(p)).toThrow();
  });
});

describe('createPageBody', () => {
  it('requires valid path and non-empty name', () => {
    expect(() => createPageBody.parse({ path: 'x', name: 'X' })).toThrow();
    expect(() => createPageBody.parse({ path: '/x', name: '' })).toThrow();
    expect(createPageBody.parse({ path: '/x', name: 'X' })).toBeTruthy();
  });
});

describe('saveDraftBody', () => {
  it('accepts optional baseVersionNo', () => {
    const ok = saveDraftBody.parse({ puckData: { root: {}, content: [] } });
    expect(ok.baseVersionNo).toBeUndefined();
    const withBase = saveDraftBody.parse({
      puckData: { root: {}, content: [] },
      baseVersionNo: 3,
    });
    expect(withBase.baseVersionNo).toBe(3);
  });
});

describe('presignBody', () => {
  const base = { filename: 'a.png', size: 100 };

  it('accepts allowed image mimes', () => {
    expect(presignBody.parse({ ...base, mime: 'image/png' }).mime).toBe('image/png');
  });

  it('rejects disallowed mime', () => {
    expect(() => presignBody.parse({ ...base, mime: 'application/zip' })).toThrow();
  });

  it('rejects oversize', () => {
    expect(() =>
      presignBody.parse({ ...base, mime: 'image/png', size: 26 * 1024 * 1024 }),
    ).toThrow();
  });
});
