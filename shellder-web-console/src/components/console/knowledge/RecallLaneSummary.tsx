'use client';

import { Space, Tag, Typography } from 'antd';
import type { DialogueRecallLaneStatus } from '@/lib/knowledge-proxy';

const { Text } = Typography;

const LABELS: Record<string, string> = {
  ok: '正常',
  skipped_no_chunks: '无 wiki 切片',
  skipped_no_terms: '无 BM25 词项',
  no_hits: 'BM25 无命中',
  skipped_no_api_key: '缺 embedding 密钥',
  error_embedding: '嵌入请求失败',
  skipped_empty_query: '已跳过（空问句）',
};

function laneTagColor(status: string): string {
  if (status === 'ok') return 'success';
  if (status === 'no_hits') return 'default';
  if (status.startsWith('skipped')) return 'warning';
  if (status === 'error_embedding') return 'error';
  return 'default';
}

export function RecallLaneSummary({
  title,
  lane,
  showEmbeddingModel,
}: {
  title: string;
  lane: DialogueRecallLaneStatus;
  showEmbeddingModel?: boolean;
}) {
  const label = LABELS[lane.status] ?? lane.status;
  return (
    <div>
      <Space size={8} wrap align="center">
        <Text strong>{title}</Text>
        <Tag color={laneTagColor(lane.status)}>
          {label}（{lane.status}）
        </Tag>
        <Text type="secondary">
          候选 {lane.candidate_count}
          {showEmbeddingModel && lane.embedding_model ? ` · 模型 ${lane.embedding_model}` : null}
        </Text>
      </Space>
      {lane.detail ? (
        <div style={{ marginTop: 4 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {lane.detail}
          </Text>
        </div>
      ) : null}
    </div>
  );
}
