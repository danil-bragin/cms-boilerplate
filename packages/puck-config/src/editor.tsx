'use client';

import type { Config, CustomField } from '@puckeditor/core';
import type { Components, MediaRef, RootProps } from './types.js';
import { renderConfig } from './render.js';

export interface EditorConfigOptions {
  /** Host app supplies the media-picker UI for the Image component. */
  mediaField: CustomField<MediaRef | undefined>;
}

export function createEditorConfig(
  opts: EditorConfigOptions,
): Config<{ components: Components; root: RootProps }> {
  return {
    root: {
      ...renderConfig.root,
      fields: {
        title: { type: 'text', label: 'Title (SEO)' },
        description: { type: 'textarea', label: 'Description (SEO)' },
        ogImage: { ...opts.mediaField, label: 'Social image (og:image)' },
      },
      defaultProps: { title: '', description: '' },
    },
    categories: {
      layout: { components: ['Section', 'Columns'], title: 'Layout' },
      content: { components: ['Heading', 'Text', 'Image', 'Button'], title: 'Content' },
    },
    components: {
      Section: {
        ...renderConfig.components.Section,
        fields: {
          maxWidth: {
            type: 'select',
            label: 'Max width',
            options: [
              { label: '640px', value: '640px' },
              { label: '960px', value: '960px' },
              { label: '1280px', value: '1280px' },
              { label: 'Full', value: 'none' },
            ],
          },
          paddingY: {
            type: 'select',
            label: 'Vertical padding',
            options: [
              { label: 'None', value: '0' },
              { label: 'S', value: '24px' },
              { label: 'M', value: '48px' },
              { label: 'L', value: '96px' },
            ],
          },
          children: { type: 'slot' },
        },
        defaultProps: { maxWidth: '960px', paddingY: '48px', children: [] },
      },
      Columns: {
        ...renderConfig.components.Columns,
        fields: {
          columns: {
            type: 'select',
            label: 'Columns',
            options: [
              { label: '2', value: '2' },
              { label: '3', value: '3' },
              { label: '4', value: '4' },
            ],
          },
          gap: {
            type: 'select',
            label: 'Gap',
            options: [
              { label: 'S', value: '16px' },
              { label: 'M', value: '32px' },
            ],
          },
          col1: { type: 'slot' },
          col2: { type: 'slot' },
          col3: { type: 'slot' },
          col4: { type: 'slot' },
        },
        defaultProps: { columns: '2', gap: '16px', col1: [], col2: [], col3: [], col4: [] },
        resolveFields: (data, { fields }) => {
          const count = Number(data.props.columns);
          const visible = { ...fields };
          if (count < 4) delete (visible as Record<string, unknown>).col4;
          if (count < 3) delete (visible as Record<string, unknown>).col3;
          return visible;
        },
      },
      Heading: {
        ...renderConfig.components.Heading,
        fields: {
          text: { type: 'text', label: 'Text' },
          level: {
            type: 'select',
            label: 'Level',
            options: [
              { label: 'H1', value: '1' },
              { label: 'H2', value: '2' },
              { label: 'H3', value: '3' },
              { label: 'H4', value: '4' },
            ],
          },
        },
        defaultProps: { text: 'Heading', level: '2' },
      },
      Text: {
        ...renderConfig.components.Text,
        fields: {
          text: {
            type: 'richtext',
            label: 'Text',
            contentEditable: true,
            options: { heading: { levels: [2, 3, 4] } },
          },
        },
        defaultProps: { text: '<p>Text block</p>' },
      },
      Image: {
        ...renderConfig.components.Image,
        fields: {
          media: opts.mediaField,
          alt: { type: 'text', label: 'Alt text' },
          rounded: { type: 'radio', label: 'Rounded', options: [
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ] },
          priority: { type: 'radio', label: 'Above the fold (LCP priority)', options: [
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ] },
        },
        defaultProps: { alt: '', rounded: false, priority: false },
      },
      Search: {
        ...renderConfig.components.Search,
        fields: { placeholder: { type: 'text', label: 'Placeholder' } },
        defaultProps: { placeholder: 'Search…' },
      },
      PostList: {
        ...renderConfig.components.PostList,
        fields: {
          heading: { type: 'text', label: 'Heading' },
          limit: { type: 'number', label: 'Posts to show', min: 1, max: 50 },
        },
        defaultProps: { heading: 'Latest posts', limit: 10 },
      },
      Button: {
        ...renderConfig.components.Button,
        fields: {
          label: { type: 'text', label: 'Label' },
          href: { type: 'text', label: 'Link' },
          variant: {
            type: 'radio',
            label: 'Variant',
            options: [
              { label: 'Primary', value: 'primary' },
              { label: 'Secondary', value: 'secondary' },
            ],
          },
        },
        defaultProps: { label: 'Button', href: '#', variant: 'primary' },
      },
    },
  };
}
