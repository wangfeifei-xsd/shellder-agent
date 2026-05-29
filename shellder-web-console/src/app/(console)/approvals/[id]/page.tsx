'use client';

import { ArrowLeftOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Input,
  Modal,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  APPROVAL_STATUS_META,
  ApprovalItem,
  ApprovalStatus,
  RISK_LEVEL_META,
  getApproval,
  reviewApproval,
} from '@/lib/approval';

const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString('zh-CN') : '—';

export default function ApprovalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { message, modal } = App.useApp();

  const [data, setData] = useState<ApprovalItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [opinion, setOpinion] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getApproval(id);
      setData(res);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载审批详情失败');
    } finally {
      setLoading(false);
    }
  }, [id, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleReview = (action: 'approve' | 'reject') => {
    const title = action === 'approve' ? '确认执行该动作？' : '确认驳回该动作？';
    const content =
      action === 'approve'
        ? '确认后 Tool 将实际执行，请确认操作风险。'
        : '驳回后 Tool 将不再执行，会话将标记为失败。';

    modal.confirm({
      title,
      content: (
        <div>
          <Typography.Text type="secondary">{content}</Typography.Text>
          <Input.TextArea
            className="mt-3"
            rows={3}
            placeholder="审批意见（可选）"
            value={opinion}
            onChange={(e) => setOpinion(e.target.value)}
          />
        </div>
      ),
      okText: action === 'approve' ? '确认执行' : '驳回',
      okButtonProps: {
        danger: action === 'reject',
      },
      onOk: async () => {
        setSubmitting(true);
        try {
          await reviewApproval(id, {
            action,
            opinion: opinion || undefined,
          });
          message.success(action === 'approve' ? '已确认执行' : '已驳回');
          setOpinion('');
          void load();
        } catch (err) {
          message.error(
            err instanceof Error ? err.message : '操作失败',
          );
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!data) {
    return <Alert type="error" message="审批记录不存在" showIcon />;
  }

  const isPending = data.status === 'pending';

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => router.push('/approvals')}
          >
            返回
          </Button>
          <Typography.Title level={3} className="!mb-0">
            审批详情
          </Typography.Title>
          <Tag color={APPROVAL_STATUS_META[data.status].color}>
            {APPROVAL_STATUS_META[data.status].label}
          </Tag>
        </Space>
        {isPending && (
          <Space>
            <Button
              type="primary"
              icon={<CheckOutlined />}
              loading={submitting}
              onClick={() => handleReview('approve')}
            >
              确认执行
            </Button>
            <Button
              danger
              icon={<CloseOutlined />}
              loading={submitting}
              onClick={() => handleReview('reject')}
            >
              驳回
            </Button>
          </Space>
        )}
      </div>

      <Card title="操作信息" className="mb-4">
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="动作类型">
            {data.actionType}
          </Descriptions.Item>
          <Descriptions.Item label="风险等级">
            <Tag color={RISK_LEVEL_META[data.riskLevel].color}>
              {RISK_LEVEL_META[data.riskLevel].label}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="动作摘要" span={2}>
            {data.actionSummary ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label="影响范围" span={2}>
            {data.impactScope ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label="发起人">
            {data.initiatorName ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {fmt(data.createdAt)}
          </Descriptions.Item>
          <Descriptions.Item label="关联会话">
            {data.sessionId ? (
              <Link href={`/sessions`}>
                <Typography.Text copyable={{ text: data.sessionId }}>
                  {data.sessionId.slice(0, 8)}...
                </Typography.Text>
              </Link>
            ) : (
              '—'
            )}
          </Descriptions.Item>
          <Descriptions.Item label="超时时间">
            {fmt(data.expiredAt)}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {data.requestContext &&
        Object.keys(data.requestContext).length > 0 && (
          <Card title="原始请求上下文" className="mb-4">
            <pre className="max-h-64 overflow-auto rounded bg-gray-50 p-3 text-xs">
              {JSON.stringify(data.requestContext, null, 2)}
            </pre>
          </Card>
        )}

      {data.toolIds && data.toolIds.length > 0 && (
        <Card title="待执行 Tool" className="mb-4">
          <Space wrap>
            {data.toolIds.map((tid) => (
              <Tag key={tid} color="blue">
                {tid.slice(0, 8)}...
              </Tag>
            ))}
          </Space>
        </Card>
      )}

      {data.status !== 'pending' && (
        <Card title="审批结果">
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="审批结果">
              <Tag color={APPROVAL_STATUS_META[data.status].color}>
                {APPROVAL_STATUS_META[data.status].label}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="审批人">
              {data.reviewerName ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="审批时间">
              {fmt(data.reviewedAt)}
            </Descriptions.Item>
            <Descriptions.Item label="审批意见">
              {data.opinion ?? '—'}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}
    </>
  );
}
