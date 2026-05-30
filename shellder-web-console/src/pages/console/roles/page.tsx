'use client';

import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Checkbox,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import { CapabilityKey, PermissionCatalog, fetchCatalog } from '@/lib/auth';
import {
  CreateRoleInput,
  Role,
  RolePolicy,
  UpdateRoleInput,
  createRole,
  deleteRole,
  listRoles,
  updateRole,
} from '@/lib/role';

interface RoleFormValues {
  code: string;
  name: string;
  description?: string;
  menus: string[];
  modules: string[];
  toolScopes: string[];
  capabilities: string[];
  canApproveHighRisk: boolean;
}

export default function RoleListPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<RoleFormValues>();

  const [data, setData] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [catalog, setCatalog] = useState<PermissionCatalog>({
    menus: [],
    modules: [],
    capabilities: [],
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Role | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listRoles({ keyword, pageSize: 100 });
      setData(res.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载角色列表失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, message]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetchCatalog().then(setCatalog).catch(() => undefined);
  }, []);

  const openCreate = () => {
    setEditing(undefined);
    form.resetFields();
    form.setFieldsValue({
      menus: [],
      modules: [],
      toolScopes: [],
      capabilities: [],
      canApproveHighRisk: false,
    });
    setDrawerOpen(true);
  };

  const openEdit = (role: Role) => {
    setEditing(role);
    form.setFieldsValue({
      code: role.code,
      name: role.name,
      description: role.description ?? undefined,
      menus: role.menus,
      modules: role.modules,
      toolScopes: role.toolScopes,
      capabilities: role.policy.capabilities,
      canApproveHighRisk: role.policy.canApproveHighRisk,
    });
    setDrawerOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      const policy: Partial<RolePolicy> = {
        capabilities: values.capabilities as CapabilityKey[],
        canApproveHighRisk: values.canApproveHighRisk,
      };
      if (editing) {
        const payload: UpdateRoleInput = {
          name: values.name,
          description: values.description,
          menus: values.menus,
          modules: values.modules,
          toolScopes: values.toolScopes,
          policy,
        };
        await updateRole(editing.id, payload);
      } else {
        const payload: CreateRoleInput = {
          code: values.code,
          name: values.name,
          description: values.description,
          menus: values.menus,
          modules: values.modules,
          toolScopes: values.toolScopes,
          policy,
        };
        await createRole(payload);
      }
      setDrawerOpen(false);
      message.success('保存成功');
      void load();
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (role: Role) => {
    try {
      await deleteRole(role.id);
      message.success('已删除');
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const columns: ColumnsType<Role> = [
    {
      title: '角色名称',
      dataIndex: 'name',
      render: (v: string, row) => (
        <Space>
          <a onClick={() => openEdit(row)}>{v}</a>
          {row.isSystem ? <Tag color="gold">内置</Tag> : null}
        </Space>
      ),
    },
    { title: '编码', dataIndex: 'code' },
    {
      title: '菜单权限',
      dataIndex: 'menus',
      render: (menus: string[]) =>
        menus.includes('*') ? (
          <Tag color="gold">全部</Tag>
        ) : (
          <Typography.Text>{menus.length} 项</Typography.Text>
        ),
    },
    {
      title: '能力权限',
      dataIndex: ['policy', 'capabilities'],
      render: (caps: string[]) => <Typography.Text>{caps?.length ?? 0} 项</Typography.Text>,
    },
    {
      title: '用户数',
      dataIndex: 'userCount',
      render: (v?: number) => v ?? 0,
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_, row) => (
        <Space size="small">
          <a onClick={() => openEdit(row)}>编辑</a>
          {!row.isSystem && (
            <Popconfirm title="确认删除该角色？" onConfirm={() => handleDelete(row)}>
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
          角色管理
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建角色
        </Button>
      </div>

      <Space className="mb-4" wrap>
        <Input.Search
          allowClear
          placeholder="搜索名称或编码"
          style={{ width: 240 }}
          onSearch={setKeyword}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
      </Space>

      <Table<Role>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data}
        pagination={false}
      />

      <Drawer
        title={editing ? '编辑角色' : '新建角色'}
        width={560}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" loading={submitting} onClick={handleSubmit}>
              保存
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="角色编码"
            name="code"
            rules={[{ required: true, message: '请输入角色编码' }]}
          >
            <Input disabled={!!editing} placeholder="字母数字、下划线、连字符" />
          </Form.Item>
          <Form.Item
            label="角色名称"
            name="name"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Form.Item label="菜单权限" name="menus" tooltip="控制侧栏菜单与对应路由访问">
            <Checkbox.Group className="grid grid-cols-2 gap-1">
              {catalog.menus.map((m) => (
                <Checkbox key={m.key} value={m.key}>
                  {m.label}
                </Checkbox>
              ))}
            </Checkbox.Group>
          </Form.Item>

          <Form.Item label="模块权限" name="modules" tooltip="控制模块级写/维护操作">
            <Select
              mode="multiple"
              allowClear
              placeholder="选择模块权限"
              options={catalog.modules.map((m) => ({ value: m.key, label: m.label }))}
            />
          </Form.Item>

          <Form.Item
            label="Tool 权限范围"
            name="toolScopes"
            tooltip="工具注册模块（阶段 07）就绪前为自由标签；* 表示全部"
          >
            <Select mode="tags" allowClear placeholder="输入工具范围标识，回车添加" />
          </Form.Item>

          <Form.Item label="能力访问权限" name="capabilities" tooltip="四类业务能力：问答/查询/操作/流程">
            <Checkbox.Group>
              {catalog.capabilities.map((c) => (
                <Checkbox key={c.key} value={c.key}>
                  {c.label}
                </Checkbox>
              ))}
            </Checkbox.Group>
          </Form.Item>

          <Form.Item
            label="高风险动作审批权限"
            name="canApproveHighRisk"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}
