'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * Admin input primitives, styled with shadcn/Tailwind tokens. Replace raw JSON /
 * comma-string inputs with proper components.
 */

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
    <div className="mb-4 space-y-1.5">
      <Label className="text-foreground">{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Re-export the shadcn Input style for callers that need a bare input. */
export { Input };

/**
 * Chip editor for a string[]. Type + Enter (or comma) to add; ✕ to remove.
 * Invalid chips (per validate) render in destructive color.
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
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
      {value.map((item) => {
        const ok = !validate || validate(item);
        return (
          <Badge key={item} variant={ok ? 'default' : 'destructive'} className="gap-1">
            {item}
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v !== item))}
              className="rounded-sm hover:text-foreground"
              aria-label={`Remove ${item}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
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
        className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
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
  const options = locales.includes(value) ? locales : [value, ...locales].filter(Boolean);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((l) => (
          <SelectItem key={l} value={l}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
    <div className="flex flex-col gap-2">
      {options.map((opt) => (
        <label key={opt.value} className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={value.includes(opt.value)}
            onCheckedChange={(checked) =>
              onChange(checked ? [...value, opt.value] : value.filter((v) => v !== opt.value))
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
    <label className={cn('flex cursor-pointer items-center gap-2.5 text-sm')}>
      <Switch checked={checked} onCheckedChange={onChange} />
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

/** @deprecated kept for callers still passing inline style — prefer shadcn Input */
export const inputStyle = {} as const;
