import type { Slot } from '@puckeditor/core';

export const PUCK_SCHEMA_VERSION = 1;

export interface MediaRef {
  mediaId: string;
  s3Key: string;
  width?: number | null;
  height?: number | null;
  blurDataUrl?: string | null;
  /** small inlined data-URI used as the src for the above-the-fold LCP image,
   *  so it paints with the document instead of as a separate (gating) request */
  lcpInline?: string | null;
  alt?: string;
  focalX?: number | null;
  focalY?: number | null;
}

export interface SectionProps {
  maxWidth: '640px' | '960px' | '1280px' | 'none';
  paddingY: '0' | '24px' | '48px' | '96px';
  background: 'default' | 'muted' | 'dark';
  children: Slot;
}

export interface HeroProps {
  eyebrow: string;
  heading: string;
  subtext: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  image?: MediaRef;
  backgroundImage?: MediaRef;
}

export interface CardProps {
  image?: MediaRef;
  heading: string;
  text: string;
  href: string;
}

export interface StatItem {
  value: string;
  label: string;
}
export interface StatsProps {
  items: StatItem[];
}

export interface CTABannerProps {
  heading: string;
  subtext: string;
  buttonLabel: string;
  buttonHref: string;
}

export interface ColumnsProps {
  columns: '2' | '3' | '4';
  gap: '16px' | '32px';
  col1: Slot;
  col2: Slot;
  col3: Slot;
  col4: Slot;
}

export interface HeadingProps {
  text: string;
  level: '1' | '2' | '3' | '4';
}

export interface TextProps {
  text: string;
}

export interface ImageProps {
  media?: MediaRef;
  alt: string;
  rounded: boolean;
  /** LCP hint: above-the-fold images load eagerly with fetchpriority=high. */
  priority: boolean;
  /** crop to a fixed aspect ratio using the media focal point */
  ratio: 'auto' | '16:9' | '4:3' | '1:1';
}

export interface SearchProps {
  placeholder: string;
}

export interface PostListProps {
  heading: string;
  limit: number;
  paginated: boolean;
}

export interface ButtonProps {
  label: string;
  href: string;
  variant: 'primary' | 'secondary';
}

export interface Components {
  Section: SectionProps;
  Columns: ColumnsProps;
  Heading: HeadingProps;
  Text: TextProps;
  Image: ImageProps;
  Button: ButtonProps;
  Search: SearchProps;
  PostList: PostListProps;
  Hero: HeroProps;
  Card: CardProps;
  Stats: StatsProps;
  CTABanner: CTABannerProps;
}

export interface RootProps {
  title: string;
  description: string;
  /** editor-chosen social/OG image; generated card is the fallback */
  ogImage?: MediaRef;
  /** exclude from search engines + sitemap */
  noindex?: boolean;
}
