'use client';

import { useMemo, useRef, useState } from 'react';
import { Puck, type Data, type Permissions } from '@puckeditor/core';
import '@puckeditor/core/puck.css';
import { createEditorConfig } from '@cms/puck-config/editor';
import { configureImages } from '@cms/puck-config';
import type { PuckPermissions } from '@cms/auth';
import { mediaField } from './media-field';
import { publishVersion, saveDraft, unpublish } from '@/app/admin/actions';

// Editor canvas runs in the browser: images go through the authed proxy route,
// imgproxy signing keys never reach the client bundle.
configureImages({ mode: 'proxy', basePath: '/api/media' });

const AUTOSAVE_DEBOUNCE_MS = 1500;

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'conflict' }
  | { kind: 'error'; message: string };

export function EditorClient(props: {
  pageLocaleId: string;
  siteId: string;
  pagePath: string;
  pageName: string;
  locale: string;
  initialData: unknown;
  initialVersionNo: number;
  initialVersionId: string;
  initialStatus: 'draft' | 'published' | 'archived';
  permissions: PuckPermissions;
}) {
  const config = useMemo(() => createEditorConfig({ mediaField: mediaField(props.siteId) }), [props.siteId]);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [versionNo, setVersionNo] = useState(props.initialVersionNo);
  const [versionId, setVersionId] = useState(props.initialVersionId);
  const [status, setStatus] = useState<string>(props.initialStatus);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestData = useRef<Data | null>(null);
  const versionNoRef = useRef(props.initialVersionNo);

  const canEdit = props.permissions.edit;

  function scheduleSave(data: Data) {
    latestData.current = data;
    if (!canEdit) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_DEBOUNCE_MS);
  }

  async function flush(): Promise<boolean> {
    if (!latestData.current) return true;
    setSaveState({ kind: 'saving' });
    const result = await saveDraft(props.pageLocaleId, latestData.current, versionNoRef.current);
    if (result.ok && result.data) {
      versionNoRef.current = result.data.versionNo;
      setVersionNo(result.data.versionNo);
      setVersionId(result.data.id);
      setStatus(result.data.status);
      setSaveState({ kind: 'saved', at: Date.now() });
      return true;
    }
    if (result.error?.status === 409) {
      setSaveState({ kind: 'conflict' });
    } else {
      setSaveState({ kind: 'error', message: result.error?.message ?? 'save failed' });
    }
    return false;
  }

  async function onPublish() {
    if (timer.current) clearTimeout(timer.current);
    const saved = await flush();
    if (!saved && latestData.current) return;
    const result = await publishVersion(props.pageLocaleId, versionId);
    if (result.ok) {
      setStatus('published');
      setSaveState({ kind: 'saved', at: Date.now() });
    } else {
      setSaveState({ kind: 'error', message: result.error?.message ?? 'publish failed' });
    }
  }

  async function onUnpublish() {
    const result = await unpublish(props.pageLocaleId);
    if (result.ok) setStatus('archived');
  }

  const saveLabel = {
    idle: '',
    saving: 'Saving…',
    saved: 'Saved',
    conflict: 'Conflict: newer version exists — reload the page',
    error: saveState.kind === 'error' ? `Error: ${saveState.message}` : '',
  }[saveState.kind];

  return (
    <div style={{ height: 'calc(100vh - 41px)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '6px 12px',
          borderBottom: '1px solid #ddd',
          fontSize: 14,
        }}
      >
        <strong>{props.pageName}</strong>
        <code>{props.pagePath}</code>
        <span style={{ padding: '1px 8px', borderRadius: 10, background: '#eee' }}>
          {props.locale} · v{versionNo} · {status}
        </span>
        <span style={{ color: saveState.kind === 'conflict' || saveState.kind === 'error' ? '#c5221f' : '#666' }}>
          {saveLabel}
        </span>
        <span style={{ flex: 1 }} />
        <a href={`/preview/${versionId}`} target="_blank" rel="noreferrer">
          Preview
        </a>
        {canEdit && (
          <>
            <button onClick={() => void onUnpublish()} style={{ padding: '4px 12px' }}>
              Unpublish
            </button>
            <button
              onClick={() => void onPublish()}
              style={{ padding: '4px 14px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4 }}
            >
              Publish
            </button>
          </>
        )}
      </div>
      <Puck
        key={props.pageLocaleId}
        config={config}
        data={props.initialData as Partial<Data>}
        permissions={props.permissions as Partial<Permissions>}
        onChange={(data) => scheduleSave(data as Data)}
        iframe={{ enabled: false }}
      />
    </div>
  );
}
