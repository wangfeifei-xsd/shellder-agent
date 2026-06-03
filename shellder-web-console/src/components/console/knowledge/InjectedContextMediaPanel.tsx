'use client';

import { App, Collapse, Space, Spin, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import { AuthenticatedMediaThumb } from '@/components/console/AuthenticatedMediaThumb';
import type { MediaRef, MediaResolvedItem, MediaResolveFromTextResponse } from '@/lib/knowledge-proxy';
import { knowledgeProxyErrorMessage, openMediaInNewTab, resolveMediaFromText } from '@/lib/knowledge-proxy';

const { Paragraph, Text, Link } = Typography;

export type RecallInjectedBundle = {
  injected_context: string;
  merged_media: MediaRef[];
};

function formatBytes(n: number): string {
  if (n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function isImageMime(m: string): boolean {
  return /^image\//i.test(m);
}

function isVideoMime(m: string): boolean {
  return /^video\//i.test(m);
}

export function InjectedContextMediaPanel({
  tenantId,
  recall,
  variant = 'recall',
}: {
  tenantId: string;
  recall: RecallInjectedBundle | null;
  /** recall：仅召回核对；qa：知识型测试（召回 + 平台 LLM） */
  variant?: 'recall' | 'qa';
}) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState<MediaResolveFromTextResponse | null>(null);

  useEffect(() => {
    if (!recall) {
      setResolved(null);
      return;
    }
    const extra = (recall.merged_media ?? []).map((m) => m.code);
    const text = recall.injected_context ?? '';
    if (!text.trim() && extra.length === 0) {
      setResolved(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void resolveMediaFromText(tenantId, { text, codes: extra })
      .then((data) => {
        if (!cancelled) setResolved(data);
      })
      .catch((err) => {
        if (!cancelled) {
          message.error(knowledgeProxyErrorMessage(err));
          setResolved(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, recall, message]);

  const count = resolved?.codes.length ?? 0;
  const hintText =
    variant === 'qa' ? (
      <>
        以 <Text code>merged_media</Text> 的 code 为主调用{' '}
        <Text code>POST /api/v1/knowledge/media/resolve-from-text</Text>（可附带{' '}
        <Text code>injected_context</Text> 解析正文内媒体标签）。图片/视频在下方通过平台代理 GET
        二进制加载。知识型测试：<Text code>injected_context</Text> 已拼入平台 LLM 的 user 消息；媒体不在
        prompt 内，仅在此展示。
      </>
    ) : (
      <>
        以 <Text code>merged_media</Text> 的 code 为主调用{' '}
        <Text code>POST /api/v1/knowledge/media/resolve-from-text</Text>（可附带{' '}
        <Text code>injected_context</Text> 解析正文内媒体标签）。图片/视频在下方通过平台代理 GET
        二进制加载。本页为「仅召回」：<Text code>injected_context</Text> 仅供人工核对，不请求模型。
      </>
    );

  if (!recall) return null;
  const previewItems = (resolved?.items ?? []).filter(
    (i) => i.registered && (isImageMime(i.mime) || isVideoMime(i.mime)),
  );

  const columns: ColumnsType<MediaResolvedItem> = [
    { title: 'code', dataIndex: 'code', key: 'code', ellipsis: true, width: 200 },
    {
      title: '已登记',
      dataIndex: 'registered',
      key: 'registered',
      width: 88,
      render: (v: boolean) => (v ? <Tag color="success">是</Tag> : <Tag color="warning">否</Tag>),
    },
    { title: 'MIME', dataIndex: 'mime', key: 'mime', width: 140, ellipsis: true },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (n: number) => formatBytes(n),
    },
    {
      title: '资源',
      key: 'open',
      width: 96,
      render: (_, row) =>
        row.registered ? (
          <Link onClick={() => void openMediaInNewTab(tenantId, row.code)}>打开</Link>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
  ];

  return (
    <Collapse
      style={{ marginTop: 12 }}
      items={[
        {
          key: 'injected-media',
          label: (
            <Space>
              <span>merged_media（登记校验 + 内联预览）</span>
              {loading ? <Spin size="small" /> : <Tag>{count} 个</Tag>}
            </Space>
          ),
          children: (
            <>
              <Paragraph type="secondary" style={{ marginBottom: 8, fontSize: 12 }}>
                {hintText}
              </Paragraph>
              {count === 0 && !loading ? (
                <Text type="secondary">无合并媒体或未解析到可登记项。</Text>
              ) : (
                <Table
                  size="small"
                  rowKey="code"
                  pagination={false}
                  loading={loading}
                  dataSource={resolved?.items ?? []}
                  columns={columns}
                />
              )}
              {!loading && previewItems.length > 0 ? (
                <>
                  <Paragraph strong style={{ marginTop: 16, marginBottom: 8 }}>
                    媒体预览
                  </Paragraph>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 16,
                      alignItems: 'flex-start',
                    }}
                  >
                    {previewItems.map((item) => (
                      <div key={item.code} style={{ maxWidth: 280 }}>
                        <AuthenticatedMediaThumb
                          tenantId={tenantId}
                          code={item.code}
                          mime={item.mime}
                        />
                        <Text
                          type="secondary"
                          ellipsis
                          copyable={{ text: item.code }}
                          style={{ fontSize: 11, display: 'block', marginTop: 4, maxWidth: 280 }}
                        >
                          {item.code}
                        </Text>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </>
          ),
        },
      ]}
    />
  );
}
