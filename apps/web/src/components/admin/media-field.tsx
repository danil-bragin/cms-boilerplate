'use client';

import { useEffect, useState } from 'react';
import type { CustomField } from '@puckeditor/core';
import type { MediaRef } from '@cms/puck-config';
import type { MediaDto } from '@cms/contracts';
import { confirmUpload, listMedia, presignUpload } from '@/app/admin/actions';

export function mediaField(siteId: string): CustomField<MediaRef | undefined> {
  return {
    type: 'custom',
    label: 'Image',
    render: ({ value, onChange }) => (
      <MediaPicker siteId={siteId} value={value} onChange={onChange} />
    ),
  };
}

function MediaPicker({
  siteId,
  value,
  onChange,
}: {
  siteId: string;
  value: MediaRef | undefined;
  onChange: (value: MediaRef | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      {value?.s3Key ? (
        <div style={{ marginBottom: 8 }}>
          <img
            src={`/api/media/${value.s3Key}?w=300`}
            alt={value.alt ?? ''}
            style={{ maxWidth: '100%', borderRadius: 4 }}
          />
          <button onClick={() => onChange(undefined)} style={{ marginTop: 4 }}>
            Remove
          </button>
        </div>
      ) : (
        <p style={{ color: '#888', fontSize: 13 }}>No image selected</p>
      )}
      <button onClick={() => setOpen(true)}>Choose image…</button>
      {open && (
        <MediaLibrary
          siteId={siteId}
          onSelect={(m) => {
            onChange(m);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function MediaLibrary({
  siteId,
  onSelect,
  onClose,
}: {
  siteId: string;
  onSelect: (media: MediaRef) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<MediaDto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const result = await listMedia(siteId, 'ready');
    if (result.ok && result.data) setItems(result.data as MediaDto[]);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const presign = await presignUpload(siteId, file.name, file.type, file.size);
      if (!presign.ok || !presign.data) throw new Error(presign.error?.message ?? 'presign failed');

      const put = await fetch(presign.data.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`upload failed: ${put.status}`);

      const confirm = await confirmUpload(presign.data.mediaId);
      if (!confirm.ok) throw new Error(confirm.error?.message ?? 'confirm failed');

      // poll until the worker marks it ready
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const result = await listMedia(siteId, 'ready');
        if (result.ok && result.data) {
          const ready = (result.data as MediaDto[]).find((m) => m.id === presign.data!.mediaId);
          if (ready) {
            setItems(result.data as MediaDto[]);
            return;
          }
        }
      }
      setError('processing is taking long — check the library later');
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 8, padding: 16, width: 640, maxHeight: '80vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <strong>Media library</strong>
          <button onClick={onClose}>Close</button>
        </div>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          {uploading && <span> Uploading…</span>}
        </label>
        {error && <p style={{ color: '#c5221f' }}>{error}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {items.map((m) => (
            <button
              key={m.id}
              onClick={() =>
                onSelect({
                  mediaId: m.id,
                  s3Key: m.s3Key,
                  width: m.width,
                  height: m.height,
                  blurDataUrl: m.blurDataUrl,
                  alt: '',
                })
              }
              style={{ border: '1px solid #ddd', borderRadius: 4, padding: 4, cursor: 'pointer', background: '#fff' }}
            >
              <img
                src={`/api/media/${m.s3Key}?w=150`}
                alt=""
                style={{ width: '100%', height: 90, objectFit: 'cover' }}
              />
            </button>
          ))}
          {items.length === 0 && <p style={{ gridColumn: '1/-1', color: '#888' }}>No media yet — upload one.</p>}
        </div>
      </div>
    </div>
  );
}
