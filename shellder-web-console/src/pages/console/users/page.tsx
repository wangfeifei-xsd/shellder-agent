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
import { useCallback, useEffect, useState } from 'react';
import UserFormDrawer from '@/components/console/UserFormDrawer';
import { MeTenant, UserStatus } from '@/lib/auth';
import { Role, listRoles } from '@/lib/role';
import { listTenants } from '@/lib/tenant';
import {
  PlatformUser,
  deleteUser,
  listUsers,
  updateUserStatus,
} from '@/lib/user';

export default function UserListPage() {
  const { message } = App.useApp();

  const [data, setData] = useState<PlatformUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<UserStatus | undefined>();

  const [roles, setRoles] = useState<Role[]>([]);
  const [tenants, setTenants] = useState<MeTenant[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformUser | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listUsers({ keyword, status, page, pageSize });
      setData(res.items);
      setTotal(res.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, status, page, pageSize, message]);

  const loadRefs = useCallback(async () => {
    try {
      const [roleRes, tenantRes] = await Promise.all([
        listRoles({ pageSize: 100 }),
        listTenants({ status: 'enabled', pageSize: 100 }),
      ]);
      setRoles(roleRes.items);
      setTenants(
        tenantRes.items.map((t) => ({
          id: t.id,
          code: t.code,
          name: t.name,
          status: t.status,
        })),
      );
    } catch {
      // 角色/租户下拉加载失败不阻塞列表
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  const toggleStatus = async (user: PlatformUser) => {
    const next: UserStatus = user.status === 'enabled' ? 'disabled' : 'enabled';
    try {
      await updateUserStatus(user.id, next);
      message.success(next === 'enabled' ? '已启用' : '已禁用');
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleDelete = async (user: PlatformUser) => {
    try {
      await deleteUser(user.id);
      message.success('已删除');
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const openCreate = () => {
    setEditing(undefined);
    setDrawerOpen(true);
  };

  const openEdit = (user: PlatformUser) => {
    setEditing(user);
    setDrawerOpen(true);
  };

  const columns: ColumnsType<PlatformUser> = [
    {
      title: '用户名',
      dataIndex: 'username',
      render: (v: string, row) => (
        <Space>
          <a onClick={() => openEdit(row)}>{v}</a>
          {row.isSystem ? <Tag color="gold">内置</Tag> : null}
        </Space>
      ),
    },
    {
      title: '显示名',
      dataIndex: 'displayName',
      render: (v: string | null) => v || <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (s: UserStatus) =>
        s === 'enabled' ? <Tag color="green">启用</Tag> : <Tag color="red">禁用</Tag>,
    },
    {
      title: '角色',
      dataIndex: 'roles',
      render: (rs: PlatformUser['roles']) =>
        rs.length ? (
          <Space size={4} wrap>
            {rs.map((r) => (
              <Tag key={r.id}>{r.name}</Tag>
            ))}
          </Space>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: '绑定租户',
      dataIndex: 'tenants',
      render: (ts: PlatformUser['tenants']) =>
        ts.length ? (
          <Space size={4} wrap>
            {ts.map((t) => (
              <Tag key={t.id} color="blue">
                {t.name}
              </Tag>
            ))}
          </Space>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_, row) => (
        <Space size="small">
          <a onClick={() => openEdit(row)}>编辑</a>
          <Popconfirm
            title={row.status === 'enabled' ? '确认禁用该用户？' : '确认启用该用户？'}
            onConfirm={() => toggleStatus(row)}
            disabled={row.isSystem && row.status === 'enabled'}
          >
            <a className={row.isSystem && row.status === 'enabled' ? 'pointer-events-none text-gray-300' : ''}>
              {row.status === 'enabled' ? '禁用' : '启用'}
            </a>
          </Popconfirm>
          {!row.isSystem && (
            <Popconfirm title="确认删除该用户？" onConfirm={() => handleDelete(row)}>
              <a className="text-red-500">删除</a>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">
          用户管理
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建用户
        </Button>
      </div>

      <Space className="mb-4" wrap>
        <Input.Search
          allowClear
          placeholder="搜索用户名或显示名"
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
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
      </Space>

      <Table<PlatformUser>
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

      <UserFormDrawer
        open={drawerOpen}
        editing={editing}
        roles={roles}
        tenants={tenants}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => {
          setDrawerOpen(false);
          message.success('保存成功');
          void load();
        }}
      />
    </>
  );
}
