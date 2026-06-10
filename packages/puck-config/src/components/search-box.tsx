'use client';

import { useEffect, useRef, useState } from 'react';

interface Result {
  url: string;
  title: string;
  snippet: string;
}

/** Public site search backed by /api/search (pg full-text). Client island. */
export function SearchBox({ placeholder }: { placeholder: string }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      const locale = window.location.pathname.split('/')[1] ?? '';
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&locale=${locale}`);
      if (res.ok) {
        const data = (await res.json()) as { results: Result[] };
        setResults(data.results);
        setOpen(true);
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  return (
    <div style={{ position: 'relative', maxWidth: 480 }}>
      <input
        type="search"
        value={q}
        placeholder={placeholder}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #ccc', fontSize: 16 }}
      />
      {open && results.length > 0 && (
        <ul
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: 8,
            margin: '4px 0 0',
            padding: 0,
            listStyle: 'none',
            boxShadow: '0 4px 16px rgba(0,0,0,.1)',
            zIndex: 50,
          }}
        >
          {results.map((r) => (
            <li key={r.url} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <a href={r.url} style={{ display: 'block', padding: '10px 14px', textDecoration: 'none', color: 'inherit' }}>
                <strong>{r.title}</strong>
                <div
                  style={{ fontSize: 13, color: '#666' }}
                  dangerouslySetInnerHTML={{ __html: r.snippet }}
                />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
