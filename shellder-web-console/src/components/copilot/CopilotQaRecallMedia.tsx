'use client';

import { Collapse, Space, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import {
  copilotBuildMediaUrl,
  copilotOpenMediaInNewTab,
  copilotResolveMediaFromText,
  extractQaRecallMediaBundleFromContent,
  type CopilotMediaResolvedItem,
} from '@/lib/copilot';

const { Text } = Typography;

function isImageMime(mime: string): boolean {
  return /^image\//i.test(mime);
}

function isVideoMime(mime: string): boolean {
  return /^video\//i.test(mime);
}

function CopilotMediaPreview({
  token,
  item,
}: {
  token: string;
  item: CopilotMediaResolvedItem;
}) {
  const src = copilotBuildMediaUrl(token, item.code);
  const open = () => copilotOpenMediaInNewTab(token, item.code);

  if (isImageMime(item.mime)) {
    return (
      <button type="button" onClick={open} className="overflow-hidden rounded border border-slate-200">
        <img
          alt={item.title ?? item.code}
          src={src}
          className="block h-24 w-36 object-cover"
          loading="lazy"
        />
      </button>
    );
  }

  if (isVideoMime(item.mime)) {
    return (
      <video
        src={src}
        controls
        className="block max-h-40 max-w-full rounded border border-slate-200"
        preload="metadata"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      className="text-xs text-blue-600 hover:underline"
    >
      {item.title ?? item.code}
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
  const bundle = useMemo(
    () => extractQaRecallMediaBundleFromContent(content),
    [content],
  );
  const mediaCodes = useMemo(
    () => (bundle?.merged_media ?? []).map((m) => m.code).join(','),
    [bundle],
  );
  const injectedContext = bundle?.injected_context ?? '';
  const mediaCount = bundle?.merged_media.length ?? 0;
  const [loading, setLoading] = useState(false);
  const [resolvedItems, setResolvedItems] = useState<CopilotMediaResolvedItem[]>([]);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const resolveKey = useMemo(() => {
    if (!mediaCodes) return '';
    return `${mediaCodes}|${injectedContext.length}`;
  }, [mediaCodes, injectedContext]);

  useEffect(() => {
    if (!resolveKey) {
      setResolvedItems([]);
      setResolveError(null);
      setLoading(false);
      return;
    }
    const codes = mediaCodes.split(',').filter(Boolean);
    let cancelled = false;
    setLoading(true);
    setResolveError(null);
    void copilotResolveMediaFromText(token, {
      text: injectedContext,
      codes,
    })
      .then((res) => {
        if (!cancelled) setResolvedItems(res.items ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setResolvedItems([]);
          setResolveError(err instanceof Error ? err.message : '解析媒体失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, resolveKey, mediaCodes, injectedContext]);

  const previewItems = useMemo(
    () =>
      resolvedItems.filter(
        (item) => item.registered && (isImageMime(item.mime) || isVideoMime(item.mime)),
      ),
    [resolvedItems],
  );

  if (!bundle || mediaCount === 0) return null;

  return (
    <Collapse
      size="small"
      defaultActiveKey={['merged-media']}
      className="mt-2 [&_.ant-collapse-header]:!px-2 [&_.ant-collapse-content-box]:!px-2"
      items={[
        {
          key: 'merged-media',
          label: (
            <Space size={6}>
              <span className="text-xs text-slate-600">多媒体内容</span>
              <Tag className="!m-0">{mediaCount} 个</Tag>
            </Space>
          ),
          children: (
            <div className="space-y-2">
              {resolveError ? (
                <Text type="danger" className="text-xs">
                  {resolveError}
                </Text>
              ) : null}
              {previewItems.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {previewItems.map((item) => (
                    <div key={item.code} className="max-w-[9.5rem]">
                      <CopilotMediaPreview token={token} item={item} />
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
              ) : loading ? (
                <Text type="secondary" className="text-xs">
                  正在解析媒体…
                </Text>
              ) : (
                <Text type="secondary" className="text-xs">
                  媒体未登记或无可预览项，可在引用来源中查看文本片段。
                </Text>
              )}
            </div>
          ),
        },
      ]}
    />
  );
}
