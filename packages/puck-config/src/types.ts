import type { Slot } from '@puckeditor/core';

export const PUCK_SCHEMA_VERSION = 1;

export interface MediaRef {
  mediaId: string;
  s3Key: string;
  width?: number | null;
  height?: number | null;
  blurDataUrl?: string | null;
  alt?: string;
}

export interface SectionProps {
  maxWidth: '640px' | '960px' | '1280px' | 'none';
  paddingY: '0' | '24px' | '48px' | '96px';
  children: Slot;
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
}

export interface SearchProps {
  placeholder: string;
}

export interface PostListProps {
  heading: string;
  limit: number;
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
}

export interface RootProps {
  title: string;
  description: string;
  /** editor-chosen social/OG image; generated card is the fallback */
  ogImage?: MediaRef;
}
