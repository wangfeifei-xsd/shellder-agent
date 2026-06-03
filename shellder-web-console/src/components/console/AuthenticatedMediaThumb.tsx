'use client';

import { Typography } from 'antd';
import { useEffect, useState } from 'react';
import { fetchMediaObjectUrl } from '@/lib/knowledge-proxy';

const { Text } = Typography;

interface Props {
  tenantId: string;
  code: string;
  mime: string;
  onPreview?: () => void;
}

export function AuthenticatedMediaThumb({ tenantId, code, mime, onPreview }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    void fetchMediaObjectUrl(tenantId, code)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        revoked = url;
        setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [tenantId, code]);

  if (failed) return <Text type="secondary">—</Text>;
  if (!src) {
    return (
      <div
        style={{
          width: 72,
          height: 48,
          background: '#f5f5f5',
          borderRadius: 4,
        }}
      />
    );
  }

  if (/^image\//i.test(mime)) {
    return (
      <button
        type="button"
        onClick={onPreview}
        style={{
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          background: 'transparent',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <img alt="" src={src} style={{ width: 72, height: 48, objectFit: 'cover', display: 'block' }} />
      </button>
    );
  }

  if (/^video\//i.test(mime)) {
    return (
      <button
        type="button"
        onClick={onPreview}
        style={{
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          background: '#111',
          borderRadius: 4,
          width: 72,
          height: 48,
          color: '#fff',
          fontSize: 11,
        }}
      >
        视频
      </button>
    );
  }

  return <Text type="secondary">—</Text>;
}
