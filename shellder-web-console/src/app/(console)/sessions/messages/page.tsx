'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  App,
  Breadcrumb,
  Button,
  Empty,
  Select,
  Space,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import {
  MESSAGE_TYPE_META,
  MessageItem,
  MessageType,
  SESSION_STATUS_META,
  SessionItem,
  getSession,
  listSessionMessages,
  listSessions,
} from '@/lib/session';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

const MESSAGE_TYPE_OPTIONS = (
  Object.entries(MESSAGE_TYPE_META) as [MessageType, { label: string }][]
).map(([value, m]) => ({ value, label: m.label }));

export default function MessageRecordsPage() {
  const { message } = App.useApp();
  const { activeTenantId } = useActiveTenant();

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>();
  const [messageTypeFilter, setMessageTypeFilter] = useState<MessageType | undefined>();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeTenantId) {
      setSessions([]);
      return;
    }
    listSessions({ tenantId: activeTenantId, pageSize: 100 })
      .then((res) => setSessions(res.items))
      .catch(() => {});
  }, [activeTenantId]);

  const load = useCallback(async () => {
    if (!selectedSessionId) {
      setMessages([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    try {
      const res = await listSessionMessages(selectedSessionId, {
        type: messageTypeFilter,
        page,
        pageSize: 50,
      });
      setMessages(res.items);
      setTotal(res.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载消息记录失败');
    } finally {
      setLoading(false);
    }
  }, [selectedSessionId, messageTypeFilter, page, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const sessionOptions = sessions.map((s) => ({
    value: s.id,
    label: `${s.title ?? s.id.slice(0, 8)} (${SESSION_STATUS_META[s.status]?.label ?? s.status})`,
  }));

  return (
    <>
      <Breadcrumb
        className="mb-4"
        items={[
          { title: <Link href="/sessions">会话管理</Link> },
          { title: '消息记录' },
        ]}
      />

      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">
          消息记录
        </Typography.Title>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => void load()}
          disabled={!selectedSessionId}
        >
          刷新
        </Button>
      </div>

      {!activeTenantId ? (
        <Alert
          type="warning"
          showIcon
          message="请先在顶栏选择「当前操作租户」"
        />
      ) : (
        <>
          <Space className="mb-4" wrap>
            <Select
              showSearch
              placeholder="选择会话"
              style={{ width: 320 }}
              options={sessionOptions}
              value={selectedSessionId}
              onChange={(v) => {
                setSelectedSessionId(v);
                setPage(1);
              }}
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
            <Select
              allowClear
              placeholder="消息类型"
              style={{ width: 120 }}
              options={MESSAGE_TYPE_OPTIONS}
              value={messageTypeFilter}
              onChange={(v) => {
                setMessageTypeFilter(v);
                setPage(1);
              }}
            />
          </Space>

          {!selectedSessionId ? (
            <Alert type="info" showIcon message="请选择一个会话查看消息记录" />
          ) : messages.length === 0 && !loading ? (
            <Empty description="暂无消息" />
          ) : (
            <>
              <Typography.Text type="secondary" className="mb-3 block">
                共 {total} 条消息
                {total > 50 && `，当前第 ${page} 页`}
              </Typography.Text>
              <Timeline
                pending={loading ? '加载中...' : undefined}
                items={messages.map((m) => ({
                  color: messageColor(m.type),
                  children: <MessageTimelineItem msg={m} />,
                }))}
              />
              {total > 50 && (
                <div className="mt-4 text-center">
                  <Space>
                    <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                      上一页
                    </Button>
                    <Typography.Text>
                      第 {page} / {Math.ceil(total / 50)} 页
                    </Typography.Text>
                    <Button
                      disabled={page >= Math.ceil(total / 50)}
                      onClick={() => setPage(page + 1)}
                    >
                      下一页
                    </Button>
                  </Space>
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

function messageColor(type: MessageType) {
  switch (type) {
    case 'user': return 'blue';
    case 'system': return 'green';
    case 'tool': return 'orange';
    case 'confirmation': return 'red';
    default: return 'gray';
  }
}

function MessageTimelineItem({ msg }: { msg: MessageItem }) {
  const content = msg.content as Record<string, unknown>;
  const contentType = content.type as string | undefined;

  let title = MESSAGE_TYPE_META[msg.type].label;
  if (contentType === 'routing_result') title = '路由结果';
  else if (contentType === 'confirm_required') title = '确认请求';
  else if (contentType === 'policy_denied') title = '策略拒绝';

  const text = typeof content.text === 'string' ? content.text : null;

  return (
    <div className="text-sm">
      <Space size="small" className="mb-1">
        <Tag color={MESSAGE_TYPE_META[msg.type].color}>{title}</Tag>
        <Typography.Text type="secondary" className="text-xs">
          #{msg.seq} · {fmt(msg.createdAt)}
        </Typography.Text>
      </Space>

      {msg.type === 'tool' && content.toolName ? (
        <div className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-xs">
          <div>
            <strong>工具：</strong>
            <Tag>{String(content.toolName)}</Tag>
            {content.durationMs && (
              <Typography.Text type="secondary">耗时 {content.durationMs}ms</Typography.Text>
            )}
          </div>
          {content.status && (
            <Tag
              className="mt-1"
              color={
                content.status === 'success' ? 'green' : content.status === 'denied' ? 'red' : 'orange'
              }
            >
              {String(content.status)}
            </Tag>
          )}
        </div>
      ) : (
        <div className="whitespace-pre-wrap break-all rounded bg-gray-50 px-3 py-2 text-xs">
          {text ?? JSON.stringify(content, null, 2)}
        </div>
      )}
    </div>
  );
}
