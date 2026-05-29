'use client';

import { BugOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  DatePicker,
  Empty,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import {
  CAPABILITY_TYPE_META,
  CAPABILITY_TYPE_OPTIONS,
  CapabilityType,
  SESSION_STATUS_META,
  SESSION_STATUS_OPTIONS,
  SessionItem,
  SessionStatus,
  listSessions,
} from '@/lib/session';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

export default function SessionListPage() {
  const router = useRouter();
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

  const columns: ColumnsType<SessionItem> = [
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
      render: (v: string | null, row) => (
        <Link href={`/sessions/${row.id}`}>{v || `会话 ${row.id.slice(0, 8)}`}</Link>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: SessionStatus) => (
        <Tag color={SESSION_STATUS_META[s]?.color ?? 'default'}>
          {SESSION_STATUS_META[s]?.label ?? s}
        </Tag>
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
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, row) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => router.push(`/sessions/${row.id}`)}
          >
            详情
          </Button>
          <Button
            type="link"
            size="small"
            icon={<BugOutlined />}
            onClick={() => router.push(`/sessions/debug?sessionId=${row.id}`)}
          >
            调试
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">
          会话管理
        </Typography.Title>
        <Space>
          <Button
            type="primary"
            icon={<BugOutlined />}
            onClick={() => router.push('/sessions/debug')}
          >
            调试台
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} disabled={!activeTenantId}>
            刷新
          </Button>
        </Space>
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
    </>
  );
}
