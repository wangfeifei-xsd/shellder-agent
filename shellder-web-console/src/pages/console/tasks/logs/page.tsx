'use client';

import { ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Empty,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useSearchParams } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import {
  LOG_LEVEL_META,
  LOG_TYPE_META,
  LOG_TYPE_OPTIONS,
  TaskLogItem,
  TaskLogLevel,
  TaskLogType,
  getTaskLogs,
} from '@/lib/task';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

export default function TaskLogsPage() {
  const { message } = App.useApp();
  const [searchParams] = useSearchParams();
  const initialTaskId = searchParams.get('taskId') ?? '';

  const [taskId, setTaskId] = useState(initialTaskId);
  const [inputValue, setInputValue] = useState(initialTaskId);
  const [data, setData] = useState<TaskLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);

  const [typeFilter, setTypeFilter] = useState<TaskLogType | undefined>();

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const res = await getTaskLogs(taskId, { type: typeFilter, page, pageSize });
      setData(res.items);
      setTotal(res.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载执行日志失败');
    } finally {
      setLoading(false);
    }
  }, [taskId, typeFilter, page, pageSize, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSearch = () => {
    setTaskId(inputValue.trim());
    setPage(1);
  };

  const columns: ColumnsType<TaskLogItem> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: string) => fmt(v),
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 100,
      render: (t: TaskLogType) => (
        <Tag color={LOG_TYPE_META[t]?.color ?? 'default'}>
          {LOG_TYPE_META[t]?.label ?? t}
        </Tag>
      ),
    },
    {
      title: '级别',
      dataIndex: 'level',
      width: 80,
      render: (l: TaskLogLevel) => (
        <Tag color={LOG_LEVEL_META[l].color}>{LOG_LEVEL_META[l].label}</Tag>
      ),
    },
    {
      title: '消息',
      dataIndex: 'message',
      ellipsis: true,
    },
    {
      title: '步骤',
      dataIndex: 'stepId',
      width: 120,
      render: (v: string | null) =>
        v ? (
          <Typography.Text copyable={{ text: v }} className="text-xs">
            {v.slice(0, 8)}...
          </Typography.Text>
        ) : (
          '—'
        ),
    },
    {
      title: '详情',
      width: 80,
      render: (_: unknown, row) =>
        row.detail ? (
          <Typography.Link
            onClick={() => {
              import('antd').then(({ Modal }) => {
                Modal.info({
                  title: '日志详情',
                  width: 640,
                  content: (
                    <pre className="max-h-96 overflow-auto text-xs">
                      {JSON.stringify(row.detail, null, 2)}
                    </pre>
                  ),
                });
              });
            }}
          >
            查看
          </Typography.Link>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">
          执行日志
        </Typography.Title>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => void load()}
          disabled={!taskId}
        >
          刷新
        </Button>
      </div>

      <Space className="mb-4">
        <Input
          placeholder="输入任务 ID"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 360 }}
        />
        <Button type="primary" onClick={handleSearch}>
          查询
        </Button>
        <Select
          allowClear
          placeholder="日志类型"
          style={{ width: 140 }}
          options={LOG_TYPE_OPTIONS}
          value={typeFilter}
          onChange={(v) => { setTypeFilter(v); setPage(1); }}
        />
      </Space>

      {!taskId ? (
        <Alert type="info" showIcon message="请输入任务 ID 或从任务列表点击「日志」查看执行记录。" />
      ) : (
        <Table<TaskLogItem>
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
          locale={{ emptyText: <Empty description="暂无日志" /> }}
        />
      )}
    </>
  );
}
