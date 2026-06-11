import type { Config, Fields } from '@puckeditor/core';
import type { ColumnsProps, SectionProps } from './types.js';
import type { Components, RootProps } from './types.js';
import { imageUrl } from './image-url.js';
import { SearchBox } from './components/search-box.js';
import { PostListServer } from './post-list.js';

/**
 * RSC-safe config: render functions only, no hooks, no client code.
 * The editor config spreads these and adds field definitions on top.
 */
export const renderConfig: Config<{ components: Components; root: RootProps }> = {
  root: {
    render: ({ children }) => <main>{children}</main>,
  },
  components: {
    Section: {
      // slot declarations are required for <Render> to materialize slot props
      fields: { children: { type: 'slot' } } as Fields<SectionProps>,
      render: ({ maxWidth, paddingY, children: Children }) => (
        <section style={{ padding: `${paddingY} 16px` }}>
          <div style={{ maxWidth: maxWidth === 'none' ? undefined : maxWidth, margin: '0 auto' }}>
            <Children />
          </div>
        </section>
      ),
    },
    Columns: {
      fields: {
        col1: { type: 'slot' },
        col2: { type: 'slot' },
        col3: { type: 'slot' },
        col4: { type: 'slot' },
      } as Fields<ColumnsProps>,
      render: ({ columns, gap, col1: C1, col2: C2, col3: C3, col4: C4 }) => {
        const count = Number(columns);
        const slots = [C1, C2, C3, C4].slice(0, count);
        return (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, 1fr)`, gap }}>
            {slots.map((Col, i) => (
              <div key={i}>
                <Col />
              </div>
            ))}
          </div>
        );
      },
    },
    Heading: {
      render: ({ text, level }) => {
        const Tag = `h${level}` as const;
        return <Tag>{text}</Tag>;
      },
    },
    Text: {
      // richtext field stores sanitized-at-edit HTML from trusted editors
      render: ({ text }) =>
        /<[a-z][\s\S]*>/i.test(text) ? (
          <div style={{ lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: text }} />
        ) : (
          <p style={{ lineHeight: 1.6 }}>{text}</p>
        ),
    },
    Image: {
      render: ({ media, alt, rounded, priority, ratio }) => {
        if (!media?.s3Key) {
          return (
            <div style={{ background: '#eee', padding: 48, textAlign: 'center', color: '#888' }}>
              No image selected
            </div>
          );
        }
        const ratios: Record<string, [number, number] | null> = {
          auto: null,
          '16:9': [16, 9],
          '4:3': [4, 3],
          '1:1': [1, 1],
        };
        const crop = ratios[ratio ?? 'auto'];
        const focal =
          crop
            ? { focalX: (media.focalX ?? 50) / 100, focalY: (media.focalY ?? 50) / 100 }
            : undefined;
        const aspect = crop
          ? `${crop[0]} / ${crop[1]}`
          : media.width && media.height
            ? `${media.width} / ${media.height}`
            : undefined;
        const heightFor = (w: number) => (crop ? Math.round((w * crop[1]) / crop[0]) : undefined);
        return (
          <img
            src={imageUrl(media.s3Key, { width: 1280, height: heightFor(1280), crop: focal })}
            srcSet={[640, 1280, 1920]
              .map((w) => `${imageUrl(media.s3Key, { width: w, height: heightFor(w), crop: focal })} ${w}w`)
              .join(', ')}
            sizes="(max-width: 768px) 100vw, 1280px"
            alt={alt || media.alt || ''}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
            decoding="async"
            style={{
              width: '100%',
              height: 'auto',
              aspectRatio: aspect,
              objectFit: crop ? 'cover' : undefined,
              borderRadius: rounded ? 8 : 0,
              background: media.blurDataUrl ? `url(${media.blurDataUrl}) center / cover` : undefined,
            }}
          />
        );
      },
    },
    Search: {
      render: ({ placeholder }) => <SearchBox placeholder={placeholder || 'Search…'} />,
    },
    PostList: {
      render: ({ heading, limit, paginated, puck }) => {
        // editor canvas runs client-side where the resolver isn't available
        if (typeof window !== 'undefined') {
          return (
            <section style={{ border: '1px dashed #bbb', borderRadius: 8, padding: 16, color: '#777' }}>
              {heading || 'Post list'} — latest {limit} posts (renders on the site)
            </section>
          );
        }
        const meta = (puck?.metadata ?? {}) as { siteId?: string; locale?: string };
        if (!meta.siteId || !meta.locale) return <></>;
        return (
          <PostListServer
            siteId={meta.siteId}
            locale={meta.locale}
            limit={limit}
            heading={heading}
            paginated={paginated}
          />
        );
      },
    },
    Button: {
      render: ({ label, href, variant }) => (
        <a
          href={href}
          style={{
            display: 'inline-block',
            padding: '10px 20px',
            borderRadius: 6,
            textDecoration: 'none',
            background: variant === 'primary' ? '#1a1a2e' : 'transparent',
            color: variant === 'primary' ? '#fff' : '#1a1a2e',
            border: '1px solid #1a1a2e',
          }}
        >
          {label}
        </a>
      ),
    },
  },
};
