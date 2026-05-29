'use client';

import { ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  DatePicker,
  Drawer,
  Empty,
  Select,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import {
  CAPABILITY_TYPE_META,
  CAPABILITY_TYPE_OPTIONS,
  CapabilityType,
  MESSAGE_TYPE_META,
  MessageItem,
  SESSION_STATUS_META,
  SESSION_STATUS_OPTIONS,
  SessionDetail,
  SessionItem,
  SessionStatus,
  getSession,
  listSessions,
} from '@/lib/session';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

export default function SessionListPage() {
  const { message } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();

  const [data, setData] = useState<SessionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<SessionStatus | undefined>();
  const [capFilter, setCapFilter] = useState<CapabilityType | undefined>();
  const [startTime, setStartTime] = useState<string | undefined>();
  const [endTime, setEndTime] = useState<string | undefined>();

  const [detail, setDetail] = useState<SessionDetail | undefined>();
  const [detailLoading, setDetailLoading] = useState(false);

  const activeTenantName = tenants.find((t) => t.id === activeTenantId)?.name;

  const load = useCallback(async () => {
    if (!activeTenantId) {
      setData([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    try {
      const res = await listSessions({
        tenantId: activeTenantId,
        status: statusFilter,
        capabilityType: capFilter,
        startTime,
        endTime,
        page,
        pageSize,
      });
      setData(res.items);
      setTotal(res.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载会话列表失败');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, statusFilter, capFilter, startTime, endTime, page, pageSize, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (row: SessionItem) => {
    setDetailLoading(true);
    try {
      setDetail(await getSession(row.id));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载会话详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const columns: ColumnsType<SessionItem> = [
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
      render: (v: string | null, row) => (
        <a onClick={() => openDetail(row)}>{v || `会话 ${row.id.slice(0, 8)}`}</a>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: SessionStatus) => (
        <Tag color={SESSION_STATUS_META[s].color}>{SESSION_STATUS_META[s].label}</Tag>
      ),
    },
    {
      title: '能力类型',
      dataIndex: 'capabilityType',
      width: 100,
      render: (c: CapabilityType | null) =>
        c ? (
          <Tag color={CAPABILITY_TYPE_META[c].color}>{CAPABILITY_TYPE_META[c].label}</Tag>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: '触发任务',
      dataIndex: 'hasTask',
      width: 90,
      render: (b: boolean) =>
        b ? <Tag color="blue">是</Tag> : <Typography.Text type="secondary">否</Typography.Text>,
    },
    {
      title: '人工确认',
      dataIndex: 'hasConfirmation',
      width: 90,
      render: (b: boolean) =>
        b ? <Tag color="orange">是</Tag> : <Typography.Text type="secondary">否</Typography.Text>,
    },
    {
      title: '最近消息',
      dataIndex: 'lastMessageAt',
      width: 170,
      render: (v: string | null) => fmt(v),
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
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">
          会话管理
        </Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} disabled={!activeTenantId}>
          刷新
        </Button>
      </div>

      {!activeTenantId ? (
        <Alert
          type="warning"
          showIcon
          message="请先在顶栏选择「当前操作租户」"
          description="会话按租户隔离，需选定租户后查看。"
        />
      ) : (
        <>
          <Alert
            className="mb-4"
            type="info"
            showIcon
            message={`当前租户：${activeTenantName ?? activeTenantId}`}
            description="本页展示会话列表与基本筛选；会话详情 / 调试台见阶段 16。"
          />
          <Space className="mb-4" wrap>
            <Select
              allowClear
              placeholder="状态"
              style={{ width: 120 }}
              options={SESSION_STATUS_OPTIONS}
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v); setPage(1); }}
            />
            <Select
              allowClear
              placeholder="能力类型"
              style={{ width: 120 }}
              options={CAPABILITY_TYPE_OPTIONS}
              value={capFilter}
              onChange={(v) => { setCapFilter(v); setPage(1); }}
            />
            <DatePicker.RangePicker
              showTime
              onChange={(_, dateStrings) => {
                setStartTime(dateStrings[0] || undefined);
                setEndTime(dateStrings[1] || undefined);
                setPage(1);
              }}
            />
          </Space>

          <Table<SessionItem>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p, ps) => { setPage(p); setPageSize(ps); },
            }}
            locale={{ emptyText: <Empty description="该租户暂无会话" /> }}
          />
        </>
      )}

      <Drawer
        title="会话详情"
        width={680}
        open={!!detail}
        loading={detailLoading}
        onClose={() => setDetail(undefined)}
        destroyOnClose
      >
        {detail && <SessionDetailView detail={detail} />}
      </Drawer>
    </>
  );
}

// ── 会话详情（简版，16 增强） ──────────────────────────────

function SessionDetailView({ detail }: { detail: SessionDetail }) {
  return (
    <>
      <Typography.Title level={5}>基本信息</Typography.Title>
      <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
        <div>
          <Typography.Text type="secondary">ID：</Typography.Text>
          {detail.id}
        </div>
        <div>
          <Typography.Text type="secondary">状态：</Typography.Text>
          <Tag color={SESSION_STATUS_META[detail.status].color}>
            {SESSION_STATUS_META[detail.status].label}
          </Tag>
        </div>
        <div>
          <Typography.Text type="secondary">能力类型：</Typography.Text>
          {detail.capabilityType ? (
            <Tag color={CAPABILITY_TYPE_META[detail.capabilityType].color}>
              {CAPABILITY_TYPE_META[detail.capabilityType].label}
            </Tag>
          ) : (
            '—'
          )}
        </div>
        <div>
          <Typography.Text type="secondary">触发任务：</Typography.Text>
          {detail.hasTask ? '是' : '否'}
        </div>
        <div>
          <Typography.Text type="secondary">人工确认：</Typography.Text>
          {detail.hasConfirmation ? '是' : '否'}
        </div>
        <div>
          <Typography.Text type="secondary">创建时间：</Typography.Text>
          {fmt(detail.createdAt)}
        </div>
      </div>

      {detail.summary && (
        <>
          <Typography.Title level={5}>摘要</Typography.Title>
          <Typography.Paragraph className="mb-4">{detail.summary}</Typography.Paragraph>
        </>
      )}

      <Typography.Title level={5}>消息时间线（{detail.messages.length} 条）</Typography.Title>
      {detail.messages.length === 0 ? (
        <Empty description="暂无消息" />
      ) : (
        <Timeline
          items={detail.messages.map((m) => ({
            color: messageColor(m),
            children: <MessageBubble msg={m} />,
          }))}
        />
      )}
    </>
  );
}

function messageColor(m: MessageItem) {
  switch (m.type) {
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
  const text = typeof content.text === 'string' ? content.text : JSON.stringify(content, null, 2);
  return (
    <div className="text-sm">
      <Space size="small" className="mb-1">
        <Tag color={MESSAGE_TYPE_META[msg.type].color}>{MESSAGE_TYPE_META[msg.type].label}</Tag>
        <Typography.Text type="secondary" className="text-xs">
          {fmt(msg.createdAt)}
        </Typography.Text>
      </Space>
      <div className="whitespace-pre-wrap break-all rounded bg-gray-50 px-3 py-2 text-xs">
        {text}
      </div>
    </div>
  );
}
