'use client';

import { useParams, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import {
  ellipsisTextColumn,
  renderOptionalText,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import {
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  APP_STATUS_META,
  APP_STATUS_OPTIONS,
  CALL_STATUS_META,
  CAPABILITY_META,
  CAPABILITY_OPTIONS,
  CallStats,
  CapabilityType,
  OpenApiAppItem,
  OpenApiCallLogItem,
  OpenApiCallStatus,
  deleteOpenApiApp,
  getOpenApiApp,
  getOpenApiAppCallLogs,
  getOpenApiAppStats,
  resetOpenApiAppSecret,
  updateOpenApiApp,
} from '@/lib/openapi-management';
import { useTenantSelectOptions } from '@/lib/tenant-select';

const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString('zh-CN') : '—';

export default function OpenApiAppDetailPage() {
  const id = useParams().id!;
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { items: tenantItems } = useTenantSelectOptions();

  const [app, setApp] = useState<OpenApiAppItem | null>(null);
  const [stats, setStats] = useState<CallStats | null>(null);
  const [logs, setLogs] = useState<OpenApiCallLogItem[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [appData, statsData, logData] = await Promise.all([
        getOpenApiApp(id),
        getOpenApiAppStats(id),
        getOpenApiAppCallLogs(id, { page: logPage, pageSize: 10 }),
      ]);
      setApp(appData);
      setStats(statsData);
      setLogs(logData.items);
      setLogTotal(logData.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [id, logPage, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleEdit = async (values: any) => {
    setSaving(true);
    try {
      await updateOpenApiApp(id, values);
      message.success('更新成功');
      setEditOpen(false);
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新失败');
    } finally {
      setSaving(false);
    }
  };

  const handleResetSecret = async () => {
    try {
      const result = await resetOpenApiAppSecret(id);
      modal.success({
        title: 'Secret 已重置',
        width: 500,
        content: (
          <div className="mt-2">
            <p className="mb-2 text-orange-600 font-medium">
              请立即保存新的 Client Secret，关闭后无法再次查看。
            </p>
            <div className="bg-gray-50 rounded p-3 font-mono text-sm">
              <span className="text-gray-500">Client Secret: </span>
              <span>{result.clientSecret}</span>
            </div>
          </div>
        ),
      });
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '重置失败');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteOpenApiApp(id);
      message.success('删除成功');
      navigate('/openapi/apps');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const logColumns: ColumnsType<OpenApiCallLogItem> = [
    withNowrap<OpenApiCallLogItem>({ title: '方法', dataIndex: 'method', width: 70 }),
    ellipsisTextColumn<OpenApiCallLogItem>('路径', 'path', 240),
    withNowrap<OpenApiCallLogItem>({ title: '状态码', dataIndex: 'statusCode', width: 80 }),
    withNowrap<OpenApiCallLogItem>({
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (v: OpenApiCallStatus) => (
        <Tag color={CALL_STATUS_META[v].color}>{CALL_STATUS_META[v].label}</Tag>
      ),
    }),
    withNowrap<OpenApiCallLogItem>({
      title: '耗时(ms)',
      dataIndex: 'durationMs',
      width: 90,
      render: (v: number | null) => (v == null ? '—' : v),
    }),
    withNowrap<OpenApiCallLogItem>({
      title: 'IP',
      dataIndex: 'ip',
      width: 130,
      render: (v: string | null) => renderOptionalText(v),
    }),
    withNowrap<OpenApiCallLogItem>({
      title: '时间',
      dataIndex: 'createdAt',
      width: 170,
      render: fmt,
    }),
  ];

  if (!app) {
    return loading ? <Typography.Text>加载中...</Typography.Text> : null;
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">
          应用详情：{app.name}
        </Typography.Title>
        <Space>
          <Button onClick={() => {
            form.setFieldsValue({
              name: app.name,
              description: app.description,
              status: app.status,
              allowedTenantIds: app.allowedTenantIds,
              allowedCapabilities: app.allowedCapabilities,
            });
            setEditOpen(true);
          }}>
            编辑
          </Button>
          <Popconfirm title="确认重置 Client Secret？" onConfirm={handleResetSecret}>
            <Button danger>重置 Secret</Button>
          </Popconfirm>
          <Popconfirm title="确认删除此应用？" onConfirm={handleDelete}>
            <Button danger>删除</Button>
          </Popconfirm>
        </Space>
      </div>

      <Card className="mb-4">
        <Descriptions column={2}>
          <Descriptions.Item label="应用名称">{app.name}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={APP_STATUS_META[app.status].color}>
              {APP_STATUS_META[app.status].label}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Client ID">
            <Typography.Text copyable className="font-mono text-sm">
              {app.clientId}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="最近调用">{fmt(app.lastCalledAt)}</Descriptions.Item>
          <Descriptions.Item label="描述" span={2}>
            {app.description ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label="归属租户" span={2}>
            {app.allowedTenantIds.map((tid) => {
              const t = tenantItems.find((x) => x.id === tid);
              return <Tag key={tid}>{t ? `${t.name}（${t.code}）` : tid}</Tag>;
            })}
          </Descriptions.Item>
          <Descriptions.Item label="能力范围" span={2}>
            {app.allowedCapabilities.map((c) => (
              <Tag key={c} color={CAPABILITY_META[c]?.color}>
                {CAPABILITY_META[c]?.label ?? c}
              </Tag>
            ))}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">{fmt(app.createdAt)}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{fmt(app.updatedAt)}</Descriptions.Item>
        </Descriptions>
      </Card>

      {stats && (
        <Row gutter={16} className="mb-4">
          <Col span={4}>
            <Card>
              <Statistic title="总调用次数" value={stats.total} />
            </Card>
          </Col>
          <Col span={4}>
            <Card>
              <Statistic title="成功" value={stats.success} valueStyle={{ color: '#3f8600' }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card>
              <Statistic title="失败" value={stats.failed} valueStyle={{ color: '#cf1322' }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card>
              <Statistic title="限流" value={stats.rateLimited} valueStyle={{ color: '#faad14' }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card>
              <Statistic title="成功率" value={stats.successRate} suffix="%" />
            </Card>
          </Col>
          <Col span={4}>
            <Card>
              <Statistic title="错误率" value={stats.errorRate} suffix="%" valueStyle={{ color: '#cf1322' }} />
            </Card>
          </Col>
        </Row>
      )}

      <Card title="调用日志">
        <Table<OpenApiCallLogItem>
          rowKey="id"
          loading={loading}
          columns={logColumns}
          dataSource={logs}
          size="small"
          {...tableEllipsisLayout}
          pagination={{
            current: logPage,
            pageSize: 10,
            total: logTotal,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p) => setLogPage(p),
          }}
        />
      </Card>

      <Modal
        title="编辑应用"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleEdit}>
          <Form.Item name="name" label="应用名称" rules={[{ required: true }]}>
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} maxLength={512} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={APP_STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item label="归属租户">
            <div>
              {app.allowedTenantIds.map((tid) => {
                const t = tenantItems.find((x) => x.id === tid);
                return (
                  <Tag key={tid}>{t ? `${t.name}（${t.code}）` : tid}</Tag>
                );
              })}
            </div>
            <div className="mt-1 text-xs text-gray-500">创建后不可变更归属租户</div>
          </Form.Item>
          <Form.Item name="allowedCapabilities" label="能力范围" rules={[{ required: true }]}>
            <Select mode="multiple" options={CAPABILITY_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
