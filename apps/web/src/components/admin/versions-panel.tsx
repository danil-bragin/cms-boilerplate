'use client';

import { useEffect, useState } from 'react';
import type { ScheduleDto, VersionListItem } from '@cms/contracts';
import {
  cancelSchedule,
  createPreviewLink,
  listSchedules,
  listVersions,
  publishOldVersion,
  restoreVersion,
  schedulePublish,
} from '@/app/admin/actions';

/** Version history + scheduled publishes drawer for the editor. */
export function VersionsPanel({
  pageLocaleId,
  currentVersionId,
  onClose,
  onRestored,
}: {
  pageLocaleId: string;
  currentVersionId: string;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [versions, setVersions] = useState<VersionListItem[]>([]);
  const [schedules, setSchedules] = useState<ScheduleDto[]>([]);
  const [scheduleAt, setScheduleAt] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const [v, s] = await Promise.all([listVersions(pageLocaleId), listSchedules(pageLocaleId)]);
    if (v.ok && v.data) setVersions(v.data);
    if (s.ok && s.data) setSchedules(s.data.filter((x) => x.status === 'pending'));
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageLocaleId]);

  async function act(key: string, fn: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    setBusy(key);
    setMessage(null);
    const result = await fn();
    setMessage(result.ok ? 'Done' : result.error?.message ?? 'Failed');
    setBusy(null);
    await refresh();
    if (result.ok && key.startsWith('restore')) onRestored();
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 380,
        background: '#fff',
        borderLeft: '1px solid #ddd',
        boxShadow: '-4px 0 12px rgba(0,0,0,.08)',
        padding: 16,
        overflow: 'auto',
        zIndex: 500,
        fontSize: 14,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong>Versions & scheduling</strong>
        <button onClick={onClose}>Close</button>
      </div>
      {message && <p style={{ color: '#137333' }}>{message}</p>}

      <h4 style={{ margin: '12px 0 6px' }}>Schedule current version</h4>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="datetime-local"
          value={scheduleAt}
          onChange={(e) => setScheduleAt(e.target.value)}
          style={{ flex: 1, padding: 4 }}
        />
        <button
          disabled={!scheduleAt || busy !== null}
          onClick={() =>
            act('schedule', () =>
              schedulePublish(pageLocaleId, currentVersionId, new Date(scheduleAt).toISOString()),
            )
          }
        >
          Schedule
        </button>
      </div>
      {schedules.map((s) => (
        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span>⏰ {new Date(s.publishAt).toLocaleString()}</span>
          <button disabled={busy !== null} onClick={() => act('cancel', () => cancelSchedule(s.id))}>
            Cancel
          </button>
        </div>
      ))}

      <h4 style={{ margin: '18px 0 6px' }}>History</h4>
      {versions.map((v) => (
        <div
          key={v.id}
          style={{
            border: '1px solid #eee',
            borderRadius: 6,
            padding: 8,
            marginBottom: 6,
            background: v.id === currentVersionId ? '#f0f4ff' : '#fff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>v{v.versionNo}</strong>
            <span style={{ color: '#777' }}>{v.status}</span>
          </div>
          <div style={{ color: '#777', fontSize: 12 }}>
            {new Date(v.createdAt).toLocaleString()} · {v.createdBy}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <button
              disabled={busy !== null}
              onClick={() =>
                act(`share:${v.id}`, async () => {
                  const link = await createPreviewLink(v.id);
                  await navigator.clipboard.writeText(window.location.origin + link.data);
                  return { ok: true };
                })
              }
            >
              Copy preview link
            </button>
            {v.id !== currentVersionId && (
              <>
                <button
                  disabled={busy !== null}
                  onClick={() => act(`restore:${v.id}`, () => restoreVersion(pageLocaleId, v.id))}
                  title="Copies this version's content into a new draft"
                >
                  Restore as draft
                </button>
                <button
                  disabled={busy !== null}
                  onClick={() => act(`publish:${v.id}`, () => publishOldVersion(pageLocaleId, v.id))}
                  title="Publish this exact version (rollback)"
                >
                  Publish this
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
