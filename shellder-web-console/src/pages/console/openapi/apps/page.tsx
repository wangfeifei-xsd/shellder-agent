'use client';

import {
  CopyOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import { useTenantSelectOptions } from '@/lib/tenant-select';
import {
  EllipsisCell,
  renderCompactTags,
  renderOptionalText,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import {
  APP_STATUS_META,
  APP_STATUS_OPTIONS,
  CAPABILITY_OPTIONS,
  CapabilityType,
  OpenApiAppCreated,
  OpenApiAppItem,
  OpenApiAppStatus,
  createOpenApiApp,
  deleteOpenApiApp,
  listOpenApiApps,
} from '@/lib/openapi-management';
const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString('zh-CN') : '—';

export default function OpenApiAppsPage() {
  const { message, modal } = App.useApp();
  const { activeTenantId } = useActiveTenant();
  const { selectOptions, defaultTenantId, catalogLoading } = useTenantSelectOptions();

  const [data, setData] = useState<OpenApiAppItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<OpenApiAppStatus | undefined>();

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    if (!activeTenantId) {
      setData([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    try {
      const res = await listOpenApiApps({
        keyword: keyword || undefined,
        status: statusFilter,
        tenantId: activeTenantId,
        page,
        pageSize,
      });
      setData(res.items);
      setTotal(res.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载应用列表失败');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, keyword, statusFilter, page, pageSize, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreateModal = () => {
    if (selectOptions.length === 0) {
      message.warning('暂无可用租户，请联系管理员分配租户权限');
      return;
    }
    form.resetFields();
    form.setFieldsValue({ tenantId: defaultTenantId });
    setCreateOpen(true);
  };

  const handleCreate = async (values: {
    name: string;
    description?: string;
    tenantId: string;
    allowedCapabilities: CapabilityType[];
  }) => {
    setCreating(true);
    try {
      const result: OpenApiAppCreated = await createOpenApiApp({
        name: values.name,
        description: values.description,
        allowedCapabilities: values.allowedCapabilities,
        allowedTenantIds: [values.tenantId],
      });
      setCreateOpen(false);
      form.resetFields();
      void load();

      modal.success({
        title: '应用创建成功',
        width: 560,
        content: (
          <div className="mt-2">
            <p className="mb-2 text-orange-600 font-medium">
              请立即保存以下凭证，关闭后无法再次查看 Client Secret。
            </p>
            <div className="bg-gray-50 rounded p-3 font-mono text-sm space-y-1">
              <div>
                <span className="text-gray-500">Client ID: </span>
                <span>{result.clientId}</span>
              </div>
              <div>
                <span className="text-gray-500">Client Secret: </span>
                <span>{result.clientSecret}</span>
              </div>
            </div>
          </div>
        ),
      });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteOpenApiApp(id);
      message.success('删除成功');
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const columns: ColumnsType<OpenApiAppItem> = [
    withNowrap<OpenApiAppItem>({
      title: '应用名称',
      dataIndex: 'name',
      width: 180,
      render: (v: string, row) => (
        <EllipsisCell tooltip={v}>
          <Link to={`/openapi/apps/${row.id}`}>{v}</Link>
        </EllipsisCell>
      ),
    }),
    withNowrap<OpenApiAppItem>({
      title: '描述',
      dataIndex: 'description',
      ellipsis: true,
      render: (v: string | null) => renderOptionalText(v),
    }),
    withNowrap<OpenApiAppItem>({
      title: 'Client ID',
      dataIndex: 'clientId',
      width: 220,
      render: (v: string) => (
        <EllipsisCell tooltip={v}>
          <Typography.Text copyable={{ text: v }} className="font-mono text-xs">
            {v}
          </Typography.Text>
        </EllipsisCell>
      ),
    }),
    withNowrap<OpenApiAppItem>({
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: OpenApiAppStatus) => (
        <Tag color={APP_STATUS_META[v].color}>{APP_STATUS_META[v].label}</Tag>
      ),
    }),
    withNowrap<OpenApiAppItem>({
      title: '归属租户',
      dataIndex: 'allowedTenantIds',
      width: 100,
      render: (v: string[]) => (v.length === 1 ? '1 个' : `${v.length} 个`),
    }),
    withNowrap<OpenApiAppItem>({
      title: '能力范围',
      dataIndex: 'allowedCapabilities',
      width: 200,
      render: (v: CapabilityType[]) =>
        renderCompactTags(
          v.map((c) => {
            const opt = CAPABILITY_OPTIONS.find((o) => o.value === c);
            return { key: c, label: <Tag>{opt?.label ?? c}</Tag> };
          }),
        ),
    }),
    withNowrap<OpenApiAppItem>({
      title: '最近调用',
      dataIndex: 'lastCalledAt',
      width: 170,
      render: fmt,
    }),
    withNowrap<OpenApiAppItem>({
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, row) => (
        <Space size="small">
          <Link to={`/openapi/apps/${row.id}`}>详情</Link>
          <Popconfirm title="确认删除此应用？" onConfirm={() => handleDelete(row.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    }),
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">
          应用接入
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          创建应用
        </Button>
      </div>

      <Space className="mb-4" wrap>
        <Select
          allowClear
          placeholder="应用状态"
          style={{ width: 140 }}
          options={APP_STATUS_OPTIONS}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <Input.Search
          allowClear
          placeholder="搜索名称/Client ID"
          style={{ width: 240 }}
          onSearch={setKeyword}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
      </Space>

      <Table<OpenApiAppItem>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data}
        {...tableEllipsisLayout}
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

      <Modal
        title="创建接入应用"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={creating}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="name"
            label="应用名称"
            rules={[{ required: true, message: '请输入应用名称' }]}
          >
            <Input placeholder="如：ERP 系统接入" maxLength={128} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="可选" maxLength={512} />
          </Form.Item>
          <Form.Item
            name="tenantId"
            label="归属租户"
            rules={[{ required: true, message: '请选择归属租户' }]}
            extra="创建后不可变更归属租户"
          >
            <Select
              showSearch
              placeholder="选择租户"
              loading={catalogLoading}
              optionFilterProp="label"
              options={selectOptions}
            />
          </Form.Item>
          <Form.Item
            name="allowedCapabilities"
            label="允许访问的能力类型"
            rules={[{ required: true, message: '请选择至少一种能力类型' }]}
          >
            <Select
              mode="multiple"
              placeholder="选择能力类型"
              options={CAPABILITY_OPTIONS}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
