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
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import {
  Capability,
  CAPABILITY_TYPE_META,
  CapabilityType,
  CreateRoutingRuleInput,
  RoutingRule,
  RoutingRuleStatus,
  UpdateRoutingRuleInput,
  createRoutingRule,
  deleteRoutingRule,
  listCapabilities,
  listRoutingRules,
  updateRoutingRule,
  updateRoutingRuleStatus,
} from '@/lib/capability';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

interface RuleFormValues {
  capabilityId: string;
  name: string;
  description?: string;
  keywordsText?: string;
  patternsText?: string;
  intentsText?: string;
  toolIdsText?: string;
  priority: number;
  needConfirmation: boolean;
}

export default function RoutingRulesPage() {
  const { message, modal } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();
  const [form] = Form.useForm<RuleFormValues>();

  const [data, setData] = useState<RoutingRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [capFilter, setCapFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<RoutingRuleStatus | undefined>();

  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<RoutingRule | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const activeTenantName = useMemo(
    () => tenants.find((t) => t.id === activeTenantId)?.name,
    [tenants, activeTenantId],
  );

  const load = useCallback(async () => {
    if (!activeTenantId) { setData([]); return; }
    setLoading(true);
    try {
      const res = await listRoutingRules({
        tenantId: activeTenantId,
        capabilityId: capFilter,
        status: statusFilter,
        keyword: keyword || undefined,
        pageSize: 100,
      });
      setData(res.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载路由规则失败');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, keyword, capFilter, statusFilter, message]);

  const loadCapabilities = useCallback(async () => {
    if (!activeTenantId) return;
    try {
      const res = await listCapabilities({ tenantId: activeTenantId, pageSize: 200 });
      setCapabilities(res.items);
    } catch { setCapabilities([]); }
  }, [activeTenantId]);

  useEffect(() => { void load(); void loadCapabilities(); }, [load, loadCapabilities]);

  const capOptions = useMemo(() => capabilities.map((c) => ({ value: c.id, label: `${c.name}（${CAPABILITY_TYPE_META[c.type].label}）` })), [capabilities]);

  const openCreate = () => {
    setEditing(undefined);
    form.resetFields();
    form.setFieldsValue({ priority: 100, needConfirmation: false });
    setDrawerOpen(true);
  };

  const openEdit = (rule: RoutingRule) => {
    setEditing(rule);
    form.resetFields();
    form.setFieldsValue({
      capabilityId: rule.capabilityId,
      name: rule.name,
      description: rule.description ?? undefined,
      keywordsText: rule.conditions.keywords?.length ? JSON.stringify(rule.conditions.keywords) : undefined,
      patternsText: rule.conditions.patterns?.length ? JSON.stringify(rule.conditions.patterns) : undefined,
      intentsText: rule.conditions.intents?.length ? JSON.stringify(rule.conditions.intents) : undefined,
      toolIdsText: rule.toolIds?.length ? JSON.stringify(rule.toolIds) : undefined,
      priority: rule.priority,
      needConfirmation: rule.needConfirmation,
    });
    setDrawerOpen(true);
  };

  const handleSubmit = async () => {
    if (!activeTenantId) { message.warning('请先选择租户'); return; }
    const v = await form.validateFields();

    let keywords: string[] = [];
    let patterns: string[] = [];
    let intents: string[] = [];
    let toolIds: string[] = [];
    try { if (v.keywordsText?.trim()) keywords = JSON.parse(v.keywordsText); } catch { message.error('关键词格式非法'); return; }
    try { if (v.patternsText?.trim()) patterns = JSON.parse(v.patternsText); } catch { message.error('正则模式格式非法'); return; }
    try { if (v.intentsText?.trim()) intents = JSON.parse(v.intentsText); } catch { message.error('意图标签格式非法'); return; }
    try { if (v.toolIdsText?.trim()) toolIds = JSON.parse(v.toolIdsText); } catch { message.error('工具 ID 格式非法'); return; }

    const conditions = { keywords, patterns, intents };

    setSubmitting(true);
    try {
      if (editing) {
        const payload: UpdateRoutingRuleInput = {
          capabilityId: v.capabilityId,
          name: v.name,
          description: v.description,
          conditions,
          toolIds,
          priority: v.priority,
          needConfirmation: v.needConfirmation,
        };
        await updateRoutingRule(editing.id, payload);
      } else {
        const payload: CreateRoutingRuleInput = {
          tenantId: activeTenantId,
          capabilityId: v.capabilityId,
          name: v.name,
          description: v.description,
          conditions,
          toolIds,
          priority: v.priority,
          needConfirmation: v.needConfirmation,
        };
        await createRoutingRule(payload);
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

  const handleToggleStatus = async (rule: RoutingRule, enabled: boolean) => {
    try {
      await updateRoutingRuleStatus(rule.id, enabled ? 'enabled' : 'disabled');
      message.success(enabled ? '已启用' : '已停用');
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '状态更新失败');
    }
  };

  const handleDelete = (rule: RoutingRule) => {
    modal.confirm({
      title: `确认删除路由规则「${rule.name}」？`,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteRoutingRule(rule.id);
          message.success('已删除');
          void load();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  const columns: ColumnsType<RoutingRule> = [
    { title: '规则名称', dataIndex: 'name', render: (v: string, row) => <a onClick={() => openEdit(row)}>{v}</a> },
    {
      title: '关联能力', dataIndex: 'capability', width: 160,
      render: (c: RoutingRule['capability']) => c ? <Tag color={CAPABILITY_TYPE_META[c.type].color}>{c.name}</Tag> : '—',
    },
    { title: '优先级', dataIndex: 'priority', width: 80 },
    {
      title: '需确认', dataIndex: 'needConfirmation', width: 80,
      render: (b: boolean) => b ? <Tag color="orange">是</Tag> : <Typography.Text type="secondary">否</Typography.Text>,
    },
    {
      title: '关键词数', key: 'keywords', width: 90,
      render: (_, row) => row.conditions?.keywords?.length ?? 0,
    },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (s: RoutingRuleStatus, row) => (
        <Switch checked={s === 'enabled'} checkedChildren="启用" unCheckedChildren="停用" onChange={(c) => handleToggleStatus(row, c)} />
      ),
    },
    { title: '创建时间', dataIndex: 'createdAt', width: 170, render: fmt },
    {
      title: '操作', key: 'actions', width: 120,
      render: (_, row) => (
        <Space size="small">
          <a onClick={() => openEdit(row)}>编辑</a>
          <a className="text-red-500" onClick={() => handleDelete(row)}>删除</a>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">路由规则</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={!activeTenantId}>新建规则</Button>
      </div>

      {!activeTenantId ? (
        <Alert type="warning" showIcon message="请先在顶栏选择「当前操作租户」" />
      ) : (
        <>
          <Alert className="mb-4" type="info" showIcon message={`当前租户：${activeTenantName ?? activeTenantId}`} description="配置能力与 Tool、条件的关联，定义每类能力的路由匹配规则。" />
          <Space className="mb-4" wrap>
            <Input.Search allowClear placeholder="搜索规则名称/描述" style={{ width: 240 }} onSearch={setKeyword} />
            <Select allowClear placeholder="关联能力" style={{ width: 200 }} options={capOptions} value={capFilter} onChange={setCapFilter} />
            <Select allowClear placeholder="状态" style={{ width: 120 }} options={[{ value: 'enabled', label: '启用' }, { value: 'disabled', label: '停用' }]} value={statusFilter} onChange={setStatusFilter} />
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          </Space>
          <Table<RoutingRule> rowKey="id" loading={loading} columns={columns} dataSource={data} pagination={false} locale={{ emptyText: <Empty description="暂无路由规则" /> }} />
        </>
      )}

      <Drawer
        title={editing ? '编辑路由规则' : '新建路由规则'}
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
          <Form.Item label="关联能力" name="capabilityId" rules={[{ required: true, message: '请选择关联能力' }]}>
            <Select placeholder="选择能力" options={capOptions} />
          </Form.Item>
          <Form.Item label="规则名称" name="name" rules={[{ required: true, message: '请输入规则名称' }]}>
            <Input placeholder="如：订单查询路由规则" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="规则说明" />
          </Form.Item>
          <Form.Item label="优先级" name="priority" rules={[{ required: true }]} tooltip="同能力内数值越小越优先">
            <InputNumber min={1} max={10000} className="w-full" />
          </Form.Item>
          <Form.Item label="需人工确认" name="needConfirmation" valuePropName="checked">
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>

          <Typography.Title level={5}>匹配条件（conditions）</Typography.Title>
          <Form.Item label="关键词（JSON 字符串数组）" name="keywordsText" tooltip='输入文本包含任一关键词即匹配。如 ["查询","订单"]'>
            <Input.TextArea rows={2} className="font-mono text-xs" placeholder='["查询", "订单"]' />
          </Form.Item>
          <Form.Item label="正则模式（JSON 字符串数组）" name="patternsText" tooltip='命中任一即匹配。如 ["^查.*订单"]'>
            <Input.TextArea rows={2} className="font-mono text-xs" placeholder='["^查.*订单"]' />
          </Form.Item>
          <Form.Item label="意图标签（JSON 字符串数组，保留）" name="intentsText" tooltip="保留接口，供 NLU 引擎扩展">
            <Input.TextArea rows={2} className="font-mono text-xs" placeholder='["order_query"]' />
          </Form.Item>

          <Typography.Title level={5}>可调用工具</Typography.Title>
          <Form.Item label="工具 ID 列表（JSON 字符串数组）" name="toolIdsText" tooltip="命中规则时可调用的工具范围">
            <Input.TextArea rows={2} className="font-mono text-xs" placeholder='["tool-id-1", "tool-id-2"]' />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}
