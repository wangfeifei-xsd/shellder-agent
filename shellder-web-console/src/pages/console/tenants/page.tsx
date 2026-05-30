'use client';

import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import {
  CAPABILITY_LABEL,
  CAPABILITY_OPTIONS,
  Tenant,
  TenantCapability,
  TenantStatus,
  listTenants,
  updateTenantStatus,
} from '@/lib/tenant';

export default function TenantListPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();

  const [data, setData] = useState<Tenant[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<TenantStatus | undefined>();
  const [capability, setCapability] = useState<TenantCapability | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTenants({ keyword, status, capability, page, pageSize });
      setData(res.items);
      setTotal(res.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载租户列表失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, status, capability, page, pageSize, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleStatus = async (tenant: Tenant) => {
    const next: TenantStatus = tenant.status === 'enabled' ? 'disabled' : 'enabled';
    try {
      await updateTenantStatus(tenant.id, next);
      message.success(next === 'enabled' ? '已启用' : '已禁用');
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  const columns: ColumnsType<Tenant> = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (name: string, row) => <Link to={`/tenants/${row.id}`}>{name}</Link>,
    },
    { title: '编码', dataIndex: 'code' },
    {
      title: '状态',
      dataIndex: 'status',
      render: (s: TenantStatus) =>
        s === 'enabled' ? <Tag color="green">启用</Tag> : <Tag color="red">禁用</Tag>,
    },
    {
      title: '管理员',
      dataIndex: 'adminUserId',
      render: (v: string | null) => v || <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: '开通能力',
      dataIndex: 'capabilities',
      render: (caps: TenantCapability[]) =>
        caps?.length ? (
          <Space size={4} wrap>
            {caps.map((c) => (
              <Tag key={c}>{CAPABILITY_LABEL[c]}</Tag>
            ))}
          </Space>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      render: (_, row) => (
        <Space size="small">
          <Link to={`/tenants/${row.id}`}>详情</Link>
          <Link to={`/tenants/${row.id}/edit`}>编辑</Link>
          <Popconfirm
            title={row.status === 'enabled' ? '确认禁用该租户？' : '确认启用该租户？'}
            onConfirm={() => toggleStatus(row)}
          >
            <a>{row.status === 'enabled' ? '禁用' : '启用'}</a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">
          租户列表
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/tenants/new')}>
          新建租户
        </Button>
      </div>

      <Space className="mb-4" wrap>
        <Input.Search
          allowClear
          placeholder="搜索名称或编码"
          style={{ width: 240 }}
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
        />
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 120 }}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: 'enabled', label: '启用' },
            { value: 'disabled', label: '禁用' },
          ]}
        />
        <Select
          allowClear
          placeholder="开通能力"
          style={{ width: 140 }}
          value={capability}
          onChange={(v) => {
            setCapability(v);
            setPage(1);
          }}
          options={CAPABILITY_OPTIONS}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
      </Space>

      <Table<Tenant>
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
