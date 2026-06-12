import type { Config, Fields } from '@puckeditor/core';
import type { ColumnsProps, SectionProps } from './types.js';
import type { Components, RootProps } from './types.js';
import { imageUrl, buildSrcSet, SIZES_HERO, SIZES_CARD, SIZES_CONTENT } from './image-url.js';
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
      render: ({ maxWidth, paddingY, background, children: Children }) => {
        const bg =
          background === 'dark'
            ? { background: '#0b1020', color: '#e7e9f2' }
            : background === 'muted'
              ? { background: '#f6f7fb' }
              : {};
        return (
          <section style={{ padding: `${paddingY} 16px`, ...bg }}>
            <div style={{ maxWidth: maxWidth === 'none' ? undefined : maxWidth, margin: '0 auto' }}>
              <Children />
            </div>
          </section>
        );
      },
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
            srcSet={buildSrcSet(media.s3Key, crop ? { ratio: crop, crop: focal } : {})}
            sizes={SIZES_CONTENT}
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
    Hero: {
      render: ({ eyebrow, heading, subtext, primaryLabel, primaryHref, secondaryLabel, secondaryHref, image, backgroundImage }) => {
        const bgUrl = backgroundImage?.s3Key ? imageUrl(backgroundImage.s3Key, { width: 1024 }) : null;
        return (
          <section
            style={{
              position: 'relative',
              padding: '96px 16px',
              color: '#fff',
              background: bgUrl ? `linear-gradient(180deg, rgba(8,10,25,0.72), rgba(8,10,25,0.92)), url(${bgUrl}) center / cover` : '#0b1020',
              overflow: 'hidden',
            }}
          >
            <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
              {eyebrow && (
                <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.12)', fontSize: 13, fontWeight: 600, letterSpacing: 0.3, marginBottom: 20 }}>
                  {eyebrow}
                </span>
              )}
              <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)', lineHeight: 1.08, fontWeight: 800, margin: '0 0 18px', letterSpacing: -1 }}>{heading}</h1>
              {subtext && <p style={{ fontSize: 'clamp(1.05rem, 2vw, 1.3rem)', lineHeight: 1.5, color: '#c2c7da', maxWidth: 680, margin: '0 auto 32px' }}>{subtext}</p>}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                {primaryLabel && (
                  <a href={primaryHref} style={{ padding: '13px 26px', borderRadius: 8, background: '#fff', color: '#0b1020', fontWeight: 600, textDecoration: 'none' }}>{primaryLabel}</a>
                )}
                {secondaryLabel && (
                  <a href={secondaryHref} style={{ padding: '13px 26px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.2)' }}>{secondaryLabel}</a>
                )}
              </div>
              {image?.s3Key && (
                <div style={{ marginTop: 56 }}>
                  <img
                    src={imageUrl(image.s3Key, { width: 768 })}
                    srcSet={buildSrcSet(image.s3Key)}
                    sizes={SIZES_HERO}
                    alt={image.alt || ''}
                    width={image.width ?? undefined}
                    height={image.height ?? undefined}
                    loading="eager"
                    fetchPriority="high"
                    decoding="sync"
                    style={{
                      width: '100%',
                      maxWidth: 1040,
                      height: 'auto',
                      borderRadius: 14,
                      boxShadow: '0 30px 60px rgba(0,0,0,0.4)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: image.blurDataUrl ? `url(${image.blurDataUrl}) center / cover` : undefined,
                    }}
                  />
                </div>
              )}
            </div>
          </section>
        );
      },
    },
    Card: {
      render: ({ image, heading, text, href }) => {
        const inner = (
          <>
            {image?.s3Key && (
              <img
                src={imageUrl(image.s3Key, { width: 768, height: Math.round((768 * 9) / 16), crop: { focalX: 0.5, focalY: 0.5 } })}
                srcSet={buildSrcSet(image.s3Key, { widths: [360, 480, 768], ratio: [16, 9], crop: { focalX: 0.5, focalY: 0.5 } })}
                sizes={SIZES_CARD}
                alt={image.alt || ''}
                loading="lazy"
                decoding="async"
                style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', display: 'block' }}
              />
            )}
            <div style={{ padding: 20 }}>
              {heading && <h3 style={{ margin: '0 0 8px', fontSize: '1.2rem' }}>{heading}</h3>}
              {text && <p style={{ margin: 0, color: '#5b6072', lineHeight: 1.55 }}>{text}</p>}
            </div>
          </>
        );
        const style = {
          display: 'block',
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid #e6e8f0',
          background: '#fff',
          textDecoration: 'none',
          color: 'inherit',
          height: '100%',
        } as const;
        return href ? <a href={href} style={style}>{inner}</a> : <div style={style}>{inner}</div>;
      },
    },
    Stats: {
      render: ({ items }) => (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(Math.max((items ?? []).length, 1), 4)}, 1fr)`, gap: 24, textAlign: 'center' }}>
          {(items ?? []).map((s, i) => (
            <div key={i}>
              <div style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, letterSpacing: -1, color: '#6366f1' }}>{s.value}</div>
              <div style={{ color: '#5b6072', fontSize: 14, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      ),
    },
    CTABanner: {
      render: ({ heading, subtext, buttonLabel, buttonHref }) => (
        <div style={{ borderRadius: 18, padding: 'clamp(32px, 6vw, 56px)', textAlign: 'center', background: 'linear-gradient(135deg, #6366f1, #0ea5e9)', color: '#fff' }}>
          <h2 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 800, margin: '0 0 12px', letterSpacing: -0.5 }}>{heading}</h2>
          {subtext && <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.9)', margin: '0 auto 26px', maxWidth: 560 }}>{subtext}</p>}
          {buttonLabel && (
            <a href={buttonHref} style={{ display: 'inline-block', padding: '13px 30px', borderRadius: 8, background: '#fff', color: '#1a1a2e', fontWeight: 700, textDecoration: 'none' }}>{buttonLabel}</a>
          )}
        </div>
      ),
    },
  },
};
