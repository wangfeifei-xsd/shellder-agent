'use client';

import { ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import {
  CALL_STATUS_META,
  CALL_STATUS_OPTIONS,
  CallStats,
  OpenApiCallLogItem,
  OpenApiCallStatus,
  getCallLogStats,
  listOpenApiCallLogs,
} from '@/lib/openapi-management';

const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString('zh-CN') : '—';

export default function OpenApiCallLogsPage() {
  const { message } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();

  const [data, setData] = useState<OpenApiCallLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [stats, setStats] = useState<CallStats | null>(null);

  const [statusFilter, setStatusFilter] = useState<OpenApiCallStatus | undefined>();
  const [pathFilter, setPathFilter] = useState('');

  const activeTenantName = useMemo(
    () => tenants.find((t) => t.id === activeTenantId)?.name,
    [tenants, activeTenantId],
  );

  const load = useCallback(async () => {
    if (!activeTenantId) {
      setData([]);
      setTotal(0);
      setStats(null);
      return;
    }
    setLoading(true);
    try {
      const [logRes, statsRes] = await Promise.all([
        listOpenApiCallLogs({
          tenantId: activeTenantId,
          status: statusFilter,
          path: pathFilter || undefined,
          page,
          pageSize,
        }),
        getCallLogStats({ tenantId: activeTenantId }),
      ]);
      setData(logRes.items);
      setTotal(logRes.total);
      setStats(statsRes);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载调用日志失败');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, statusFilter, pathFilter, page, pageSize, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<OpenApiCallLogItem> = [
    {
      title: '应用',
      dataIndex: 'appName',
      width: 140,
    },
    {
      title: '方法',
      dataIndex: 'method',
      width: 70,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: '路径',
      dataIndex: 'path',
      ellipsis: true,
    },
    {
      title: '状态码',
      dataIndex: 'statusCode',
      width: 80,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (v: OpenApiCallStatus) => (
        <Tag color={CALL_STATUS_META[v].color}>{CALL_STATUS_META[v].label}</Tag>
      ),
    },
    {
      title: '耗时(ms)',
      dataIndex: 'durationMs',
      width: 90,
      render: (v: number | null) => v ?? '—',
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      width: 130,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: '错误信息',
      dataIndex: 'errorMessage',
      ellipsis: true,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 170,
      render: fmt,
    },
  ];

  return (
    <>
      <Typography.Title level={3} className="!mb-4">
        调用日志
      </Typography.Title>

      {!activeTenantId ? (
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          message="请先在顶栏选择「当前操作租户」"
          description="调用日志按租户隔离展示，需选定租户后查看该租户下的 OpenAPI 调用记录。"
        />
      ) : (
        <Alert
          type="info"
          showIcon
          className="mb-4"
          message={`当前租户：${activeTenantName ?? activeTenantId}`}
          description="仅展示当前操作租户下的调用记录与统计。"
        />
      )}

      {stats && (
        <Row gutter={16} className="mb-4">
          <Col span={4}>
            <Card size="small">
              <Statistic title="总调用" value={stats.total} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="成功" value={stats.success} valueStyle={{ color: '#3f8600' }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="失败" value={stats.failed} valueStyle={{ color: '#cf1322' }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="限流" value={stats.rateLimited} valueStyle={{ color: '#faad14' }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="成功率" value={stats.successRate} suffix="%" />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="错误率" value={stats.errorRate} suffix="%" valueStyle={{ color: '#cf1322' }} />
            </Card>
          </Col>
        </Row>
      )}

      <Space className="mb-4" wrap>
        <Select
          allowClear
          placeholder="调用状态"
          style={{ width: 140 }}
          options={CALL_STATUS_OPTIONS}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <Input.Search
          allowClear
          placeholder="搜索路径"
          style={{ width: 240 }}
          onSearch={setPathFilter}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void load()} disabled={!activeTenantId}>
          刷新
        </Button>
      </Space>

      <Table<OpenApiCallLogItem>
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
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />
    </>
  );
}
