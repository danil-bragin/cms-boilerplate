'use client';

import { useEffect, useState } from 'react';
import { diffPuck, type PuckDiff } from '@/lib/puck-diff';
import { getVersion } from '@/app/admin/actions';

const short = (v: unknown) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 80 ? s.slice(0, 77) + '…' : s;
};

export function VersionDiff({
  fromVersionId,
  toVersionId,
  onClose,
}: {
  fromVersionId: string;
  toVersionId: string;
  onClose: () => void;
}) {
  const [diff, setDiff] = useState<PuckDiff | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([getVersion(fromVersionId), getVersion(toVersionId)]).then(([a, b]) => {
      if (a.ok && b.ok && a.data && b.data) {
        setDiff(diffPuck(a.data.puckData, b.data.puckData));
      } else {
        setError('Failed to load versions');
      }
    });
  }, [fromVersionId, toVersionId]);

  const color = { added: '#137333', removed: '#c5221f', changed: '#b06000' } as const;

  return (
    <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 12, marginTop: 8, fontSize: 13 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>Diff vs current</strong>
        <button onClick={onClose}>Close</button>
      </div>
      {error && <p style={{ color: '#c5221f' }}>{error}</p>}
      {diff && (
        <>
          {diff.rootChanges.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <strong style={{ color: '#b06000' }}>Page settings</strong>
              {diff.rootChanges.map((c) => (
                <div key={c.key} style={{ paddingLeft: 8 }}>
                  {c.key}: <span style={{ color: '#c5221f' }}>{short(c.from)}</span> →{' '}
                  <span style={{ color: '#137333' }}>{short(c.to)}</span>
                </div>
              ))}
            </div>
          )}
          {diff.blocks.length === 0 && diff.rootChanges.length === 0 && (
            <p style={{ color: '#888' }}>No differences.</p>
          )}
          {diff.blocks.map((b) => (
            <div key={b.id} style={{ marginBottom: 6 }}>
              <span style={{ color: color[b.status], fontWeight: 600 }}>
                {b.status === 'added' ? '+ ' : b.status === 'removed' ? '− ' : '~ '}
                {b.type}
              </span>
              {b.propChanges?.map((c) => (
                <div key={c.key} style={{ paddingLeft: 16 }}>
                  {c.key}: <span style={{ color: '#c5221f' }}>{short(c.from)}</span> →{' '}
                  <span style={{ color: '#137333' }}>{short(c.to)}</span>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
