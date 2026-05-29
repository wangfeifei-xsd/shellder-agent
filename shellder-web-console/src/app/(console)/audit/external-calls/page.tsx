'use client';

import { ReloadOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Descriptions,
  Drawer,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import {
  AuditStatus,
  ExternalCallAudit,
  listExternalCallAudits,
  statusMeta,
} from '@/lib/audit';

const fmt = (s: string) => new Date(s).toLocaleString('zh-CN');

export default function ExternalCallAuditPage() {
  const { message } = App.useApp();

  const [data, setData] = useState<ExternalCallAudit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<AuditStatus | undefined>();
  const [detail, setDetail] = useState<ExternalCallAudit | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listExternalCallAudits({ keyword, status, page, pageSize });
      setData(res.items);
      setTotal(res.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载外部接口审计失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, status, page, pageSize, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<ExternalCallAudit> = [
    {
      title: '目标系统',
      dataIndex: 'target',
      ellipsis: true,
      render: (v: string, row) => <a onClick={() => setDetail(row)}>{v}</a>,
    },
    {
      title: '方法',
      dataIndex: 'method',
      width: 100,
      render: (v: string | null) => v || '—',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: AuditStatus) => {
        const meta = statusMeta(s);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '状态码',
      dataIndex: 'statusCode',
      width: 90,
      render: (v: number | null) => (v == null ? '—' : v),
    },
    {
      title: '耗时',
      dataIndex: 'durationMs',
      width: 100,
      render: (v: number | null) => (v == null ? '—' : `${v} ms`),
    },
    {
      title: '失败原因',
      dataIndex: 'errorMessage',
      ellipsis: true,
      render: (v: string | null) => v || <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (v: string) => fmt(v),
    },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">
          外部接口审计
        </Typography.Title>
      </div>

      <Space className="mb-4" wrap>
        <Input.Search
          allowClear
          placeholder="按目标系统搜索"
          style={{ width: 280 }}
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
        />
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 140 }}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: 'success', label: '成功' },
            { value: 'failed', label: '失败' },
            { value: 'pending', label: '进行中' },
          ]}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
      </Space>

      <Table<ExternalCallAudit>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data}
        locale={{ emptyText: '暂无外部接口审计（06 连接器 / 13 业务能力起写入）' }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      <Drawer
        title="外部接口调用详情"
        width={520}
        open={!!detail}
        onClose={() => setDetail(undefined)}
        destroyOnClose
      >
        {detail && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="目标系统">{detail.target}</Descriptions.Item>
            <Descriptions.Item label="方法">{detail.method || '—'}</Descriptions.Item>
            <Descriptions.Item label="连接器 ID">{detail.connectorId || '—'}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusMeta(detail.status).color}>{statusMeta(detail.status).label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="状态码">
              {detail.statusCode == null ? '—' : detail.statusCode}
            </Descriptions.Item>
            <Descriptions.Item label="耗时">
              {detail.durationMs == null ? '—' : `${detail.durationMs} ms`}
            </Descriptions.Item>
            <Descriptions.Item label="会话 ID">{detail.sessionId || '—'}</Descriptions.Item>
            <Descriptions.Item label="任务 ID">{detail.taskId || '—'}</Descriptions.Item>
            <Descriptions.Item label="租户 ID">{detail.tenantId || '—'}</Descriptions.Item>
            <Descriptions.Item label="请求摘要">{detail.requestSummary || '—'}</Descriptions.Item>
            <Descriptions.Item label="失败原因">{detail.errorMessage || '—'}</Descriptions.Item>
            <Descriptions.Item label="时间">{fmt(detail.createdAt)}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </>
  );
}
