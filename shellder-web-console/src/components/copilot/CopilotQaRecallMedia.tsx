'use client';

import { Collapse, Space, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import {
  copilotFetchMediaObjectUrl,
  copilotOpenMediaInNewTab,
  extractQaRecallMediaBundleFromContent,
  type QaRecallMediaRef,
} from '@/lib/copilot';

const { Text } = Typography;

function isImageMime(mime: string): boolean {
  return /^image\//i.test(mime);
}

function isVideoMime(mime: string): boolean {
  return /^video\//i.test(mime);
}

function CopilotMediaThumb({
  token,
  item,
}: {
  token: string;
  item: QaRecallMediaRef;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isImageMime(item.mime) && !isVideoMime(item.mime)) return;
    let revoked: string | null = null;
    let cancelled = false;
    void copilotFetchMediaObjectUrl(token, item.code)
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
  }, [token, item.code, item.mime]);

  const open = () => copilotOpenMediaInNewTab(token, item.code);

  if (failed) {
    return (
      <button
        type="button"
        onClick={open}
        className="rounded border border-dashed border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
      >
        打开
      </button>
    );
  }

  if (!src) {
    return (
      <div className="h-16 w-24 animate-pulse rounded bg-slate-100" aria-hidden />
    );
  }

  if (isImageMime(item.mime)) {
    return (
      <button type="button" onClick={open} className="overflow-hidden rounded border border-slate-200">
        <img
          alt={item.title ?? item.code}
          src={src}
          className="block h-16 w-24 object-cover"
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      className="flex h-16 w-24 items-center justify-center rounded border border-slate-700 bg-slate-900 text-xs text-white"
    >
      视频
    </button>
  );
}

export function CopilotQaRecallMedia({
  token,
  content,
}: {
  token: string;
  content: Record<string, unknown>;
}) {
  const bundle = extractQaRecallMediaBundleFromContent(content);
  const media = bundle?.merged_media ?? [];
  if (!bundle || media.length === 0) return null;
  const previewItems = media.filter(
    (m) => isImageMime(m.mime) || isVideoMime(m.mime),
  );

  return (
    <Collapse
      size="small"
      className="mt-2 [&_.ant-collapse-header]:!px-2 [&_.ant-collapse-content-box]:!px-2"
      items={[
        {
          key: 'merged-media',
          label: (
            <Space size={6}>
              <span className="text-xs text-slate-600">多媒体内容</span>
              <Tag className="!m-0">{media.length} 个</Tag>
            </Space>
          ),
          children: (
            <div className="space-y-2">
              {previewItems.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {previewItems.map((item) => (
                    <div key={item.code} className="max-w-[6.5rem]">
                      <CopilotMediaThumb token={token} item={item} />
                      <Text
                        type="secondary"
                        ellipsis
                        className="!mt-1 !block !text-[10px]"
                        title={item.title ?? item.code}
                      >
                        {item.title ?? item.code}
                      </Text>
                    </div>
                  ))}
                </div>
              ) : (
                <Text type="secondary" className="text-xs">
                  无图片/视频预览，可在引用来源中查看文本片段。
                </Text>
              )}
              {media.length > previewItems.length ? (
                <ul className="space-y-1 text-xs text-slate-600">
                  {media
                    .filter((m) => !isImageMime(m.mime) && !isVideoMime(m.mime))
                    .map((m) => (
                      <li key={m.code}>
                        <button
                          type="button"
                          onClick={() => copilotOpenMediaInNewTab(token, m.code)}
                          className="text-blue-600 hover:underline"
                        >
                          {m.title ?? m.code}
                        </button>
                      </li>
                    ))}
                </ul>
              ) : null}
            </div>
          ),
        },
      ]}
    />
  );
}
