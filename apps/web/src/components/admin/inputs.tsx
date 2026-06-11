'use client';

import { useState, type ReactNode } from 'react';

/**
 * Reusable admin input primitives — replace raw JSON / comma-string inputs with
 * proper components. Shared visual language: labeled Field wrapper, chip-based
 * TagInput, validated UrlListInput, LocaleSelect, CheckboxGroup.
 */

const colors = {
  border: '#d0d0d8',
  chip: '#eef1f8',
  chipBad: '#fde8e8',
  accent: '#1a1a2e',
  hint: '#888',
  error: '#c5221f',
};

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#333' }}>
        {label}
      </span>
      {children}
      {hint && !error && <span style={{ display: 'block', fontSize: 12, color: colors.hint, marginTop: 3 }}>{hint}</span>}
      {error && <span style={{ display: 'block', fontSize: 12, color: colors.error, marginTop: 3 }}>{error}</span>}
    </label>
  );
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 9px',
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  fontSize: 14,
  boxSizing: 'border-box',
};

/**
 * Chip editor for a string[]. Type + Enter (or comma) to add; ✕ to remove.
 * Optional per-item validate(): invalid chips render red and aren't added.
 */
export function TagInput({
  value,
  onChange,
  placeholder,
  validate,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  validate?: (item: string) => boolean;
}) {
  const [draft, setDraft] = useState('');

  const commit = (raw: string) => {
    const item = raw.trim();
    if (!item || value.includes(item)) return;
    if (validate && !validate(item)) return;
    onChange([...value, item]);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        padding: 6,
        border: `1px solid ${colors.border}`,
        borderRadius: 6,
        minHeight: 38,
        alignItems: 'center',
      }}
    >
      {value.map((item) => {
        const ok = !validate || validate(item);
        return (
          <span
            key={item}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: ok ? colors.chip : colors.chipBad,
              color: ok ? colors.accent : colors.error,
              borderRadius: 4,
              padding: '2px 6px',
              fontSize: 13,
            }}
          >
            {item}
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v !== item))}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }}
              aria-label={`Remove ${item}`}
            >
              ✕
            </button>
          </span>
        );
      })}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit(draft);
            setDraft('');
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => {
          if (draft.trim()) {
            commit(draft);
            setDraft('');
          }
        }}
        placeholder={value.length ? '' : placeholder}
        style={{ flex: 1, minWidth: 120, border: 'none', outline: 'none', fontSize: 14, padding: '2px 0' }}
      />
    </div>
  );
}

const isUrl = (s: string) => {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

/** TagInput preset that validates each entry is an http(s) URL. */
export function UrlListInput(props: { value: string[]; onChange: (n: string[]) => void; placeholder?: string }) {
  return <TagInput {...props} validate={isUrl} placeholder={props.placeholder ?? 'https://… (Enter to add)'} />;
}

export function LocaleSelect({
  locales,
  value,
  onChange,
}: {
  locales: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
      {!locales.includes(value) && <option value={value}>{value || '—'}</option>}
      {locales.map((l) => (
        <option key={l} value={l}>
          {l}
        </option>
      ))}
    </select>
  );
}

export function CheckboxGroup({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {options.map((opt) => (
        <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#333' }}>
          <input
            type="checkbox"
            checked={value.includes(opt.value)}
            onChange={(e) =>
              onChange(e.target.checked ? [...value, opt.value] : value.filter((v) => v !== opt.value))
            }
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#333', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function isValidHostname(s: string): boolean {
  return /^[a-z0-9.-]+$/.test(s) && s.length <= 253;
}

export function isValidLocale(s: string): boolean {
  return /^[a-z]{2}(-[A-Z]{2})?$/.test(s);
}
