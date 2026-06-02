'use client';

import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ellipsisTextColumn,
  renderEllipsisLink,
  renderOptionalText,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import {
  Capability,
  CAPABILITY_TYPE_META,
  CAPABILITY_TYPE_OPTIONS,
  CapabilityStatus,
  CapabilityType,
  CreateCapabilityInput,
  UpdateCapabilityInput,
  createCapability,
  deleteCapability,
  listCapabilities,
  updateCapability,
  updateCapabilityStatus,
} from '@/lib/capability';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

interface CapFormValues {
  type: CapabilityType;
  name: string;
  description?: string;
  applicableSystem?: string;
  dependentToolsText?: string;
  permissionRequirementsText?: string;
  priority: number;
}

export default function CapabilitiesPage() {
  const { message, modal } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();
  const [form] = Form.useForm<CapFormValues>();

  const [data, setData] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<CapabilityType | undefined>();
  const [statusFilter, setStatusFilter] = useState<CapabilityStatus | undefined>();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Capability | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const activeTenantName = useMemo(
    () => tenants.find((t) => t.id === activeTenantId)?.name,
    [tenants, activeTenantId],
  );

  const load = useCallback(async () => {
    if (!activeTenantId) { setData([]); return; }
    setLoading(true);
    try {
      const res = await listCapabilities({
        tenantId: activeTenantId,
        keyword: keyword || undefined,
        type: typeFilter,
        status: statusFilter,
        pageSize: 100,
      });
      setData(res.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载能力列表失败');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, keyword, typeFilter, statusFilter, message]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditing(undefined);
    form.resetFields();
    form.setFieldsValue({ type: 'qa', priority: 100 });
    setDrawerOpen(true);
  };

  const openEdit = (cap: Capability) => {
    setEditing(cap);
    form.resetFields();
    form.setFieldsValue({
      type: cap.type,
      name: cap.name,
      description: cap.description ?? undefined,
      applicableSystem: cap.applicableSystem ?? undefined,
      dependentToolsText: cap.dependentTools?.length
        ? JSON.stringify(cap.dependentTools)
        : undefined,
      permissionRequirementsText: cap.permissionRequirements?.length
        ? JSON.stringify(cap.permissionRequirements)
        : undefined,
      priority: cap.priority,
    });
    setDrawerOpen(true);
  };

  const handleSubmit = async () => {
    if (!activeTenantId) { message.warning('请先选择租户'); return; }
    const v = await form.validateFields();
    let dependentTools: string[] = [];
    let permissionRequirements: string[] = [];
    try {
      if (v.dependentToolsText?.trim()) dependentTools = JSON.parse(v.dependentToolsText);
    } catch { message.error('依赖工具格式非法（应为 JSON 字符串数组）'); return; }
    try {
      if (v.permissionRequirementsText?.trim()) permissionRequirements = JSON.parse(v.permissionRequirementsText);
    } catch { message.error('权限要求格式非法（应为 JSON 字符串数组）'); return; }

    setSubmitting(true);
    try {
      if (editing) {
        const payload: UpdateCapabilityInput = {
          type: v.type,
          name: v.name,
          description: v.description,
          applicableSystem: v.applicableSystem,
          dependentTools,
          permissionRequirements,
          priority: v.priority,
        };
        await updateCapability(editing.id, payload);
      } else {
        const payload: CreateCapabilityInput = {
          tenantId: activeTenantId,
          type: v.type,
          name: v.name,
          description: v.description,
          applicableSystem: v.applicableSystem,
          dependentTools,
          permissionRequirements,
          priority: v.priority,
        };
        await createCapability(payload);
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

  const handleToggleStatus = async (cap: Capability, enabled: boolean) => {
    try {
      await updateCapabilityStatus(cap.id, enabled ? 'enabled' : 'disabled');
      message.success(enabled ? '已启用' : '已停用');
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '状态更新失败');
    }
  };

  const handleDelete = (cap: Capability) => {
    modal.confirm({
      title: `确认删除能力「${cap.name}」？`,
      content: '删除后关联路由规则将级联删除。',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteCapability(cap.id);
          message.success('已删除');
          void load();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  const columns: ColumnsType<Capability> = [
    withNowrap<Capability>({
      title: '能力名称',
      dataIndex: 'name',
      width: 180,
      render: (v: string, row) => renderEllipsisLink(v, () => openEdit(row)),
    }),
    withNowrap<Capability>({
      title: '类型',
      dataIndex: 'type',
      width: 100,
      render: (t: CapabilityType) => (
        <Tag color={CAPABILITY_TYPE_META[t].color}>{CAPABILITY_TYPE_META[t].label}</Tag>
      ),
    }),
    withNowrap<Capability>({
      title: '适用系统',
      dataIndex: 'applicableSystem',
      width: 140,
      ellipsis: true,
      render: (v: string | null) => renderOptionalText(v),
    }),
    ellipsisTextColumn<Capability>('优先级', 'priority', 80),
    withNowrap<Capability>({
      title: '路由规则数',
      dataIndex: 'routingRules',
      width: 100,
      render: (r: { id: string }[] | undefined) => r?.length ?? 0,
    }),
    withNowrap<Capability>({
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: CapabilityStatus, row) => (
        <Switch
          checked={s === 'enabled'}
          checkedChildren="启用"
          unCheckedChildren="停用"
          onChange={(c) => handleToggleStatus(row, c)}
        />
      ),
    }),
    withNowrap<Capability>({
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      render: fmt,
    }),
    withNowrap<Capability>({
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, row) => (
        <Space size="small">
          <a onClick={() => openEdit(row)}>编辑</a>
          <a className="text-red-500" onClick={() => handleDelete(row)}>
            删除
          </a>
        </Space>
      ),
    }),
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">能力目录</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={!activeTenantId}>新建能力</Button>
      </div>

      {!activeTenantId ? (
        <Alert type="warning" showIcon message="请先在顶栏选择「当前操作租户」" description="能力按租户隔离，需选定租户后查看与维护。" />
      ) : (
        <>
          <Alert className="mb-4" type="info" showIcon message={`当前租户：${activeTenantName ?? activeTenantId}`} description="维护平台四类能力清单（问答/查询/操作/流程），含描述、适用系统、依赖工具、权限要求。" />
          <Space className="mb-4" wrap>
            <Input.Search allowClear placeholder="搜索名称/描述" style={{ width: 240 }} onSearch={setKeyword} />
            <Select allowClear placeholder="类型" style={{ width: 120 }} options={CAPABILITY_TYPE_OPTIONS} value={typeFilter} onChange={setTypeFilter} />
            <Select allowClear placeholder="状态" style={{ width: 120 }} options={[{ value: 'enabled', label: '启用' }, { value: 'disabled', label: '停用' }]} value={statusFilter} onChange={setStatusFilter} />
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          </Space>
          <Table<Capability>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data}
            pagination={false}
            locale={{ emptyText: <Empty description="该租户暂无能力配置" /> }}
            {...tableEllipsisLayout}
          />
        </>
      )}

      <Drawer
        title={editing ? '编辑能力' : '新建能力'}
        width={560}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" loading={submitting} onClick={handleSubmit}>保存</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item label="能力名称" name="name" rules={[{ required: true, message: '请输入能力名称' }]}>
            <Input placeholder="如：通用问答 / 数据查询" />
          </Form.Item>
          <Form.Item label="能力类型" name="type" rules={[{ required: true }]}>
            <Select options={CAPABILITY_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="能力用途说明" />
          </Form.Item>
          <Form.Item label="适用系统" name="applicableSystem">
            <Input placeholder="如：全平台 / 数据分析 / 业务系统" />
          </Form.Item>
          <Form.Item label="路由优先级" name="priority" rules={[{ required: true }]} tooltip="数值越小越优先">
            <InputNumber min={1} max={10000} className="w-full" />
          </Form.Item>
          <Form.Item label="依赖工具 ID（JSON 数组，可选）" name="dependentToolsText" tooltip='如 ["tool-id-1", "tool-id-2"]'>
            <Input.TextArea rows={2} className="font-mono text-xs" placeholder='["tool-id-1"]' />
          </Form.Item>
          <Form.Item label="权限要求（JSON 数组，可选）" name="permissionRequirementsText" tooltip='如 ["order:read"]'>
            <Input.TextArea rows={2} className="font-mono text-xs" placeholder='["order:read"]' />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}
