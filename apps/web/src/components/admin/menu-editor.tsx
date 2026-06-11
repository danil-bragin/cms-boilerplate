'use client';

import type { MenuItem } from '@cms/contracts';
import { Input } from '@/components/ui/input';

/**
 * Structural menu editor — replaces the raw nested-JSON textarea. Each item has
 * a per-locale label map, an href, and one level of child links (the contract
 * caps nesting at one level). Builds the MenuItem[] directly; no JSON shown.
 */

type Child = { label: Record<string, string>; href: string };

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
    <div className="flex flex-wrap gap-1.5">
      {locales.map((loc) => (
        <span key={loc} className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">{loc}</span>
          <Input
            className="h-8 w-32 text-sm"
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
    <div className="flex flex-col gap-2.5">
      {value.length === 0 && <p className="text-sm text-muted-foreground">No items yet.</p>}
      {value.map((item, i) => (
        <div key={i} className="rounded-lg border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <strong className="text-xs text-muted-foreground">Item {i + 1}</strong>
            <span className="flex gap-1">
              <button type="button" className="rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-accent disabled:opacity-40" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
              <button type="button" className="rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-accent disabled:opacity-40" onClick={() => move(i, 1)} disabled={i === value.length - 1}>↓</button>
              <button type="button" className="rounded-md border border-input bg-background px-2 py-1 text-xs text-destructive hover:bg-accent" onClick={() => onChange(value.filter((_, idx) => idx !== i))}>
                Remove
              </button>
            </span>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-[200px] flex-1">
              <span className="text-[11px] text-muted-foreground">Labels</span>
              <LabelRow locales={locales} label={item.label} onChange={(label) => setItem(i, { label })} />
            </div>
            <div>
              <span className="text-[11px] text-muted-foreground">Link</span>
              <Input
                className="h-8 w-52 text-sm"
                value={item.href}
                placeholder="/en/about"
                onChange={(e) => setItem(i, { href: e.target.value })}
              />
            </div>
          </div>

          {/* children */}
          <div className="mt-2 border-l-2 border-border pl-3.5">
            {(item.children ?? []).map((child: Child, ci) => (
              <div key={ci} className="mb-1.5 flex flex-wrap items-start gap-2">
                <LabelRow
                  locales={locales}
                  label={child.label}
                  onChange={(label) =>
                    setItem(i, { children: item.children!.map((c, idx) => (idx === ci ? { ...c, label } : c)) })
                  }
                />
                <Input
                  className="h-8 w-40 text-sm"
                  value={child.href}
                  placeholder="/en/sub"
                  onChange={(e) =>
                    setItem(i, { children: item.children!.map((c, idx) => (idx === ci ? { ...c, href: e.target.value } : c)) })
                  }
                />
                <button
                  type="button"
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs text-destructive hover:bg-accent"
                  onClick={() => setItem(i, { children: item.children!.filter((_, idx) => idx !== ci) })}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-accent disabled:opacity-40"
              onClick={() => setItem(i, { children: [...(item.children ?? []), { label: {}, href: '' }] })}
            >
              + child link
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="self-start rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent"
        onClick={() => onChange([...value, { label: {}, href: '', children: [] }])}
      >
        + Add item
      </button>
    </div>
  );
}
