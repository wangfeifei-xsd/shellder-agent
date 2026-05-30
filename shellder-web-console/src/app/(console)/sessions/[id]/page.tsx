'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Breadcrumb,
  Button,
  Card,
  Descriptions,
  Empty,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  BugOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import {
  CAPABILITY_TYPE_META,
  CapabilityType,
  MESSAGE_TYPE_META,
  MessageItem,
  MessageType,
  SESSION_STATUS_META,
  SessionDetail,
  SessionTaskItem,
  getSession,
} from '@/lib/session';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

const MESSAGE_TYPE_OPTIONS = (
  Object.entries(MESSAGE_TYPE_META) as [MessageType, { label: string }][]
).map(([value, m]) => ({ value, label: m.label }));

const TASK_STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: '待执行', color: 'default' },
  running: { label: '执行中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
  cancelled: { label: '已取消', color: 'warning' },
  timeout: { label: '超时', color: 'error' },
  pending_confirm: { label: '待确认', color: 'orange' },
};

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { message } = App.useApp();
  const sessionId = params.id as string;

  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [msgTypeFilter, setMsgTypeFilter] = useState<MessageType | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await getSession(sessionId));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载会话详情失败');
    } finally {
      setLoading(false);
    }
  }, [sessionId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  if (!detail) {
    return <Empty description="会话不存在或无权限" />;
  }

  const filteredMessages = msgTypeFilter
    ? detail.messages.filter((m) => m.type === msgTypeFilter)
    : detail.messages;

  const taskColumns: ColumnsType<SessionTaskItem> = [
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
      render: (v: string | null, row) => (
        <Link href={`/tasks?id=${row.id}`}>{v || row.id.slice(0, 8)}</Link>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: string) => {
        const meta = TASK_STATUS_META[s] ?? { label: s, color: 'default' };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '能力类型',
      dataIndex: 'capabilityType',
      width: 100,
      render: (c: CapabilityType | null) =>
        c ? <Tag color={CAPABILITY_TYPE_META[c].color}>{CAPABILITY_TYPE_META[c].label}</Tag> : '—',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: string) => fmt(v),
    },
  ];

  return (
    <>
      <Breadcrumb
        className="mb-4"
        items={[
          { title: <Link href="/sessions">会话管理</Link> },
          { title: '会话详情' },
        ]}
      />

      <div className="mb-4 flex items-center justify-between">
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/sessions')}>
            返回列表
          </Button>
          <Typography.Title level={3} className="!mb-0">
            {detail.title || `会话 ${detail.id.slice(0, 8)}`}
          </Typography.Title>
        </Space>
        <Space>
          <Button
            icon={<BugOutlined />}
            onClick={() => router.push(`/sessions/debug?sessionId=${detail.id}`)}
          >
            在调试台打开
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            刷新
          </Button>
        </Space>
      </div>

      {/* 基本信息 */}
      <Card className="mb-4" title="基本信息" size="small">
        <Descriptions column={3} size="small">
          <Descriptions.Item label="会话 ID">
            <Typography.Text copyable={{ text: detail.id }}>
              {detail.id.slice(0, 12)}...
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={SESSION_STATUS_META[detail.status].color}>
              {SESSION_STATUS_META[detail.status].label}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="能力类型">
            {detail.capabilityType ? (
              <Tag color={CAPABILITY_TYPE_META[detail.capabilityType].color}>
                {CAPABILITY_TYPE_META[detail.capabilityType].label}
              </Tag>
            ) : (
              '—'
            )}
          </Descriptions.Item>
          <Descriptions.Item label="触发任务">
            {detail.hasTask ? <Tag color="blue">是</Tag> : '否'}
          </Descriptions.Item>
          <Descriptions.Item label="人工确认">
            {detail.hasConfirmation ? <Tag color="orange">是</Tag> : '否'}
          </Descriptions.Item>
          <Descriptions.Item label="最近消息">
            {fmt(detail.lastMessageAt)}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">{fmt(detail.createdAt)}</Descriptions.Item>
          <Descriptions.Item label="用户 ID">
            <Typography.Text copyable={{ text: detail.userId }}>
              {detail.userId.slice(0, 12)}...
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="租户 ID">
            <Typography.Text copyable={{ text: detail.tenantId }}>
              {detail.tenantId.slice(0, 12)}...
            </Typography.Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 摘要 */}
      {detail.summary && (
        <Card className="mb-4" title="会话上下文摘要" size="small">
          <Typography.Paragraph className="!mb-0">{detail.summary}</Typography.Paragraph>
        </Card>
      )}

      {/* 关联任务 */}
      {detail.tasks && detail.tasks.length > 0 && (
        <Card className="mb-4" title={`关联任务（${detail.tasks.length}）`} size="small">
          <Table<SessionTaskItem>
            rowKey="id"
            columns={taskColumns}
            dataSource={detail.tasks}
            pagination={false}
            size="small"
          />
        </Card>
      )}

      {/* 消息时间线 */}
      <Card
        title={`消息时间线（${filteredMessages.length} / ${detail.messages.length} 条）`}
        size="small"
        extra={
          <Select
            allowClear
            placeholder="筛选消息类型"
            style={{ width: 140 }}
            options={MESSAGE_TYPE_OPTIONS}
            value={msgTypeFilter}
            onChange={setMsgTypeFilter}
          />
        }
      >
        {filteredMessages.length === 0 ? (
          <Empty description="暂无消息" />
        ) : (
          <Timeline
            items={filteredMessages.map((m) => ({
              color: messageColor(m.type),
              children: <MessageBubble msg={m} />,
            }))}
          />
        )}
      </Card>
    </>
  );
}

function messageColor(type: MessageType) {
  switch (type) {
    case 'user':
      return 'blue';
    case 'system':
      return 'green';
    case 'tool':
      return 'orange';
    case 'confirmation':
      return 'red';
    default:
      return 'gray';
  }
}

function MessageBubble({ msg }: { msg: MessageItem }) {
  const content = msg.content as Record<string, unknown>;
  const contentType = content.type as string | undefined;

  let title = MESSAGE_TYPE_META[msg.type].label;
  if (contentType === 'routing_result') title = '路由结果';
  else if (contentType === 'confirm_required') title = '确认请求';
  else if (contentType === 'policy_denied') title = '策略拒绝';

  return (
    <div className="text-sm">
      <Space size="small" className="mb-1">
        <Tag color={MESSAGE_TYPE_META[msg.type].color}>{title}</Tag>
        <Typography.Text type="secondary" className="text-xs">
          #{msg.seq} · {fmt(msg.createdAt)}
        </Typography.Text>
      </Space>

      {contentType === 'routing_result' ? (
        <RoutingResultView content={content} />
      ) : contentType === 'confirm_required' ? (
        <ConfirmRequiredView content={content} />
      ) : msg.type === 'tool' ? (
        <ToolMessageView content={content} />
      ) : (
        <div className="whitespace-pre-wrap break-all rounded bg-gray-50 px-3 py-2 text-xs">
          {typeof content.text === 'string' ? content.text : JSON.stringify(content, null, 2)}
        </div>
      )}
    </div>
  );
}

function RoutingResultView({ content }: { content: Record<string, unknown> }) {
  return (
    <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs">
      <div className="mb-1">
        <strong>能力类型：</strong>
        {content.capabilityType ? (
          <Tag color={CAPABILITY_TYPE_META[content.capabilityType as CapabilityType]?.color}>
            {CAPABILITY_TYPE_META[content.capabilityType as CapabilityType]?.label ?? content.capabilityType}
          </Tag>
        ) : (
          '—'
        )}
      </div>
      {content.capabilityName ? (
        <div className="mb-1">
          <strong>能力名称：</strong>{String(content.capabilityName)}
        </div>
      ) : null}
      {content.reason ? (
        <div className="mb-1">
          <strong>路由原因：</strong>{String(content.reason)}
        </div>
      ) : null}
      {content.needConfirmation ? (
        <Tag color="orange" className="mt-1">需人工确认</Tag>
      ) : null}
    </div>
  );
}

function ConfirmRequiredView({ content }: { content: Record<string, unknown> }) {
  return (
    <div className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-xs">
      <div className="mb-1">
        <strong>确认原因：</strong>{String(content.reason ?? '—')}
      </div>
      {content.capabilityType ? (
        <div>
          <strong>能力类型：</strong>{String(content.capabilityType)}
        </div>
      ) : null}
    </div>
  );
}

function ToolMessageView({ content }: { content: Record<string, unknown> }) {
  return (
    <div className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-xs">
      {content.toolName ? (
        <div className="mb-1">
          <strong>工具：</strong>
          <Tag>{String(content.toolName)}</Tag>
          {content.durationMs ? (
            <Typography.Text type="secondary" className="ml-2">
              耗时 {String(content.durationMs)}ms
            </Typography.Text>
          ) : null}
        </div>
      ) : null}
      {content.input !== undefined && (
        <div className="mb-1">
          <strong>入参：</strong>
          <pre className="mt-1 max-h-32 overflow-auto rounded bg-white p-2">
            {typeof content.input === 'string'
              ? content.input
              : JSON.stringify(content.input, null, 2)}
          </pre>
        </div>
      )}
      {content.output !== undefined && (
        <div className="mb-1">
          <strong>出参：</strong>
          <pre className="mt-1 max-h-32 overflow-auto rounded bg-white p-2">
            {typeof content.output === 'string'
              ? content.output
              : JSON.stringify(content.output, null, 2)}
          </pre>
        </div>
      )}
      {content.status ? (
        <Tag
          color={
            content.status === 'success' ? 'green' : content.status === 'denied' ? 'red' : 'orange'
          }
        >
          {String(content.status)}
        </Tag>
      ) : null}
      {!content.toolName ? (
        <pre className="max-h-32 overflow-auto rounded bg-white p-2">
          {JSON.stringify(content, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
