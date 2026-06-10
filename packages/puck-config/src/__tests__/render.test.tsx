// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { Render } from '@puckeditor/core/rsc';
import { renderConfig } from '../render.js';
import { configureImages, imageUrl } from '../image-url.js';

const data = {
  root: { props: { title: 'Test page' } },
  content: [
    { type: 'Heading', props: { id: 'h1', text: 'Hello World', level: '1' } },
    { type: 'Text', props: { id: 't1', text: 'Some body text' } },
    {
      type: 'Section',
      props: {
        id: 's1',
        maxWidth: '960px',
        children: [{ type: 'Button', props: { id: 'b1', label: 'Click', href: '/x', variant: 'primary' } }],
      },
    },
  ],
};

describe('renderConfig', () => {
  it('renders heading, text and nested slot content', () => {
    const html = renderToString(createElement(Render, { config: renderConfig, data }));
    expect(html).toContain('Hello World');
    expect(html).toContain('<h1');
    expect(html).toContain('Some body text');
    expect(html).toContain('Click');
    expect(html).toContain('href="/x"');
  });
});

describe('imageUrl', () => {
  it('builds signed imgproxy URL matching known-good signature', () => {
    configureImages({
      mode: 'imgproxy',
      baseUrl: 'http://localhost:8081',
      bucket: 'cms-media',
      // imgproxy docs example key/salt
      key: '943b421c9eb07c830af81030552c86009268de4e532ba2ee2eab8247c6da0881',
      salt: '520f986b998545b4785e0defbc4f3c1203f22de2374a3d53cb7a7fe9fea309c5',
    });
    const url = imageUrl('sites/a/media/b/cat.png', { width: 300 });
    expect(url).toMatch(/^http:\/\/localhost:8081\/[A-Za-z0-9_-]+\/rs:fit:300:0\/plain\/s3:\/\/cms-media\/sites\/a\/media\/b\/cat\.png$/);
    // signature must be stable
    expect(imageUrl('sites/a/media/b/cat.png', { width: 300 })).toBe(url);
  });

  it('proxy mode builds an app-relative URL', () => {
    configureImages({ mode: 'proxy', basePath: '/api/media' });
    expect(imageUrl('sites/a/b.png', { width: 300 })).toBe('/api/media/sites/a/b.png?w=300');
  });
});
