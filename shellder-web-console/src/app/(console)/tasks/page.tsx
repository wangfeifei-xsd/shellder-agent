'use client';

import { ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  DatePicker,
  Drawer,
  Empty,
  Progress,
  Select,
  Space,
  Steps,
  Table,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import {
  CAPABILITY_TYPE_META,
  CAPABILITY_TYPE_OPTIONS,
  CapabilityType,
  LOG_LEVEL_META,
  LOG_TYPE_META,
  STEP_STATUS_META,
  TASK_STATUS_META,
  TASK_STATUS_OPTIONS,
  TASK_TYPE_META,
  TASK_TYPE_OPTIONS,
  TaskDetail,
  TaskItem,
  TaskLogItem,
  TaskProgress,
  TaskStatus,
  TaskStepItem,
  TaskType,
  getTask,
  getTaskLogs,
  getTaskProgress,
  listTasks,
} from '@/lib/task';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

export default function TaskListPage() {
  const { message } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();

  const [data, setData] = useState<TaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<TaskStatus | undefined>();
  const [typeFilter, setTypeFilter] = useState<TaskType | undefined>();
  const [capFilter, setCapFilter] = useState<CapabilityType | undefined>();
  const [startTime, setStartTime] = useState<string | undefined>();
  const [endTime, setEndTime] = useState<string | undefined>();

  const [detail, setDetail] = useState<TaskDetail | undefined>();
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
      const res = await listTasks({
        tenantId: activeTenantId,
        status: statusFilter,
        type: typeFilter,
        capabilityType: capFilter,
        startTime,
        endTime,
        page,
        pageSize,
      });
      setData(res.items);
      setTotal(res.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载任务列表失败');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, statusFilter, typeFilter, capFilter, startTime, endTime, page, pageSize, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (row: TaskItem) => {
    setDetailLoading(true);
    try {
      setDetail(await getTask(row.id));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载任务详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const columns: ColumnsType<TaskItem> = [
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
      render: (v: string | null, row) => (
        <a onClick={() => openDetail(row)}>{v || `任务 ${row.id.slice(0, 8)}`}</a>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 80,
      render: (t: TaskType) => (
        <Tag color={TASK_TYPE_META[t].color}>{TASK_TYPE_META[t].label}</Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: TaskStatus) => (
        <Tag color={TASK_STATUS_META[s].color}>{TASK_STATUS_META[s].label}</Tag>
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
      title: '当前节点',
      dataIndex: 'currentNode',
      ellipsis: true,
      width: 150,
      render: (v: string | null) => v || '—',
    },
    {
      title: '重试',
      width: 70,
      render: (_: unknown, row) => `${row.retryCount}/${row.maxRetries}`,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: string) => fmt(v),
    },
    {
      title: '操作',
      width: 160,
      render: (_: unknown, row) => (
        <Space size="small">
          <a onClick={() => openDetail(row)}>详情</a>
          <Link href={`/tasks/tracking?taskId=${row.id}`}>跟踪</Link>
          <Link href={`/tasks/logs?taskId=${row.id}`}>日志</Link>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">
          任务列表
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
          description="任务按租户隔离，需选定租户后查看。"
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
              options={TASK_STATUS_OPTIONS}
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v); setPage(1); }}
            />
            <Select
              allowClear
              placeholder="类型"
              style={{ width: 120 }}
              options={TASK_TYPE_OPTIONS}
              value={typeFilter}
              onChange={(v) => { setTypeFilter(v); setPage(1); }}
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

          <Table<TaskItem>
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
            locale={{ emptyText: <Empty description="该租户暂无任务" /> }}
          />
        </>
      )}

      <Drawer
        title="任务详情"
        width={720}
        open={!!detail}
        loading={detailLoading}
        onClose={() => setDetail(undefined)}
        destroyOnClose
      >
        {detail && <TaskDetailView detail={detail} />}
      </Drawer>
    </>
  );
}

// ── 任务详情组件 ──────────────────────────────────────────

function TaskDetailView({ detail }: { detail: TaskDetail }) {
  return (
    <>
      <Typography.Title level={5}>基本信息</Typography.Title>
      <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
        <div>
          <Typography.Text type="secondary">ID：</Typography.Text>
          <Typography.Text copyable={{ text: detail.id }}>{detail.id.slice(0, 12)}...</Typography.Text>
        </div>
        <div>
          <Typography.Text type="secondary">状态：</Typography.Text>
          <Tag color={TASK_STATUS_META[detail.status].color}>
            {TASK_STATUS_META[detail.status].label}
          </Tag>
        </div>
        <div>
          <Typography.Text type="secondary">类型：</Typography.Text>
          <Tag color={TASK_TYPE_META[detail.type].color}>
            {TASK_TYPE_META[detail.type].label}
          </Tag>
        </div>
        <div>
          <Typography.Text type="secondary">能力类型：</Typography.Text>
          {detail.capabilityType ? (
            <Tag color={CAPABILITY_TYPE_META[detail.capabilityType].color}>
              {CAPABILITY_TYPE_META[detail.capabilityType].label}
            </Tag>
          ) : '—'}
        </div>
        <div>
          <Typography.Text type="secondary">重试：</Typography.Text>
          {detail.retryCount} / {detail.maxRetries}
        </div>
        <div>
          <Typography.Text type="secondary">超时：</Typography.Text>
          {(detail.timeoutMs / 1000).toFixed(0)}s
        </div>
        <div>
          <Typography.Text type="secondary">当前节点：</Typography.Text>
          {detail.currentNode || '—'}
        </div>
        <div>
          <Typography.Text type="secondary">创建时间：</Typography.Text>
          {fmt(detail.createdAt)}
        </div>
        <div>
          <Typography.Text type="secondary">开始时间：</Typography.Text>
          {fmt(detail.startedAt)}
        </div>
        <div>
          <Typography.Text type="secondary">完成时间：</Typography.Text>
          {fmt(detail.completedAt)}
        </div>
      </div>

      {detail.failReason && (
        <Alert className="mb-4" type="error" showIcon message="失败原因" description={detail.failReason} />
      )}

      {detail.input && (
        <>
          <Typography.Title level={5}>入参</Typography.Title>
          <pre className="mb-4 rounded bg-gray-50 p-3 text-xs overflow-auto max-h-48">
            {JSON.stringify(detail.input, null, 2)}
          </pre>
        </>
      )}

      {detail.output && (
        <>
          <Typography.Title level={5}>出参</Typography.Title>
          <pre className="mb-4 rounded bg-gray-50 p-3 text-xs overflow-auto max-h-48">
            {JSON.stringify(detail.output, null, 2)}
          </pre>
        </>
      )}

      {detail.steps.length > 0 && (
        <>
          <Typography.Title level={5}>步骤明细（{detail.steps.length} 步）</Typography.Title>
          <Steps
            direction="vertical"
            size="small"
            current={detail.steps.findIndex((s) => s.status === 'running')}
            items={detail.steps.map((step) => ({
              title: (
                <Space>
                  {step.name}
                  <Tag color={STEP_STATUS_META[step.status].color}>
                    {STEP_STATUS_META[step.status].label}
                  </Tag>
                  {step.toolName && <Tag>{step.toolName}</Tag>}
                </Space>
              ),
              description: (
                <div className="text-xs text-gray-500">
                  {step.description && <div>{step.description}</div>}
                  {step.durationMs != null && <div>耗时: {step.durationMs}ms</div>}
                  {step.failReason && (
                    <div className="text-red-500">失败: {step.failReason}</div>
                  )}
                </div>
              ),
              status:
                step.status === 'completed'
                  ? 'finish'
                  : step.status === 'running'
                    ? 'process'
                    : step.status === 'failed'
                      ? 'error'
                      : 'wait',
            }))}
          />
        </>
      )}
    </>
  );
}
