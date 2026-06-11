'use client';

import type { MenuItem } from '@cms/contracts';
import { inputStyle } from './inputs';

/**
 * Structural menu editor — replaces the raw nested-JSON textarea. Each item has
 * a per-locale label map, an href, and one level of child links (the contract
 * caps nesting at one level). Builds the MenuItem[] directly; no JSON shown.
 */

type Child = { label: Record<string, string>; href: string };

const smallBtn: React.CSSProperties = {
  border: '1px solid #d0d0d8',
  background: '#fff',
  borderRadius: 5,
  padding: '3px 8px',
  fontSize: 12,
  cursor: 'pointer',
};

function LabelRow({
  locales,
  label,
  onChange,
}: {
  locales: string[];
  label: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {locales.map((loc) => (
        <span key={loc} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 11, color: '#999' }}>{loc}</span>
          <input
            style={{ ...inputStyle, width: 130, padding: '4px 6px' }}
            value={label[loc] ?? ''}
            placeholder="label"
            onChange={(e) => onChange({ ...label, [loc]: e.target.value })}
          />
        </span>
      ))}
    </div>
  );
}

export function MenuTreeEditor({
  locales,
  value,
  onChange,
}: {
  locales: string[];
  value: MenuItem[];
  onChange: (next: MenuItem[]) => void;
}) {
  const setItem = (i: number, patch: Partial<MenuItem>) =>
    onChange(value.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {value.length === 0 && <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>No items yet.</p>}
      {value.map((item, i) => (
        <div key={i} style={{ border: '1px solid #e2e2ea', borderRadius: 8, padding: 10, background: '#fafafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <strong style={{ fontSize: 12, color: '#666' }}>Item {i + 1}</strong>
            <span style={{ display: 'flex', gap: 4 }}>
              <button type="button" style={smallBtn} onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
              <button type="button" style={smallBtn} onClick={() => move(i, 1)} disabled={i === value.length - 1}>↓</button>
              <button type="button" style={{ ...smallBtn, color: '#c5221f' }} onClick={() => onChange(value.filter((_, idx) => idx !== i))}>
                Remove
              </button>
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <span style={{ fontSize: 11, color: '#999' }}>Labels</span>
              <LabelRow locales={locales} label={item.label} onChange={(label) => setItem(i, { label })} />
            </div>
            <div>
              <span style={{ fontSize: 11, color: '#999' }}>Link</span>
              <input
                style={{ ...inputStyle, width: 200, padding: '4px 6px' }}
                value={item.href}
                placeholder="/en/about"
                onChange={(e) => setItem(i, { href: e.target.value })}
              />
            </div>
          </div>

          {/* children */}
          <div style={{ marginTop: 8, paddingLeft: 14, borderLeft: '2px solid #e2e2ea' }}>
            {(item.children ?? []).map((child: Child, ci) => (
              <div key={ci} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6, flexWrap: 'wrap' }}>
                <LabelRow
                  locales={locales}
                  label={child.label}
                  onChange={(label) =>
                    setItem(i, { children: item.children!.map((c, idx) => (idx === ci ? { ...c, label } : c)) })
                  }
                />
                <input
                  style={{ ...inputStyle, width: 160, padding: '4px 6px' }}
                  value={child.href}
                  placeholder="/en/sub"
                  onChange={(e) =>
                    setItem(i, { children: item.children!.map((c, idx) => (idx === ci ? { ...c, href: e.target.value } : c)) })
                  }
                />
                <button
                  type="button"
                  style={{ ...smallBtn, color: '#c5221f' }}
                  onClick={() => setItem(i, { children: item.children!.filter((_, idx) => idx !== ci) })}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              style={smallBtn}
              onClick={() => setItem(i, { children: [...(item.children ?? []), { label: {}, href: '' }] })}
            >
              + child link
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        style={{ ...smallBtn, alignSelf: 'flex-start', padding: '6px 12px' }}
        onClick={() => onChange([...value, { label: {}, href: '', children: [] }])}
      >
        + Add item
      </button>
    </div>
  );
}
