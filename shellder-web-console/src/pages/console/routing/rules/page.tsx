'use client';

import { PlusOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
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
  ROUTING_TOOL_KIND_OPTIONS,
  Capability,
  CAPABILITY_TYPE_META,
  CapabilityType,
  CreateRoutingRuleInput,
  RoutingConditions,
  RoutingRule,
  RoutingRuleStatus,
  UpdateRoutingRuleInput,
  createRoutingRule,
  deleteRoutingRule,
  listCapabilities,
  listRoutingRules,
  suggestRoutingRuleWithAi,
  updateRoutingRule,
  updateRoutingRuleStatus,
} from '@/lib/capability';
import { Tool, ToolType, TOOL_TYPE_META, listTools } from '@/lib/tool';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

interface RuleFormValues {
  capabilityId: string;
  name: string;
  description?: string;
  keywordsText?: string;
  patternsText?: string;
  intentsText?: string;
  toolKind?: 'http_query' | 'action' | 'notification';
  toolIds?: string[];
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
  const [tools, setTools] = useState<Tool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<RoutingRule | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [aiIntent, setAiIntent] = useState('');
  const [aiSamples, setAiSamples] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRationale, setAiRationale] = useState<string | null>(null);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);

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
    } catch (err) {
      setCapabilities([]);
      message.error(err instanceof Error ? err.message : '加载能力列表失败');
    }
  }, [activeTenantId, message]);

  const loadTools = useCallback(async () => {
    if (!activeTenantId) {
      setTools([]);
      return;
    }
    setToolsLoading(true);
    try {
      const res = await listTools({ tenantId: activeTenantId, pageSize: 200 });
      setTools(res.items);
    } catch (err) {
      setTools([]);
      message.error(err instanceof Error ? err.message : '加载工具列表失败');
    } finally {
      setToolsLoading(false);
    }
  }, [activeTenantId, message]);

  useEffect(() => { void load(); void loadCapabilities(); }, [load, loadCapabilities]);

  const capOptions = useMemo(() => capabilities.map((c) => ({ value: c.id, label: `${c.name}（${CAPABILITY_TYPE_META[c.type].label}）`, type: c.type })), [capabilities]);
  const watchedCapabilityId = Form.useWatch('capabilityId', form);
  const watchedCapabilityType = useMemo(
    () => capabilities.find((c) => c.id === watchedCapabilityId)?.type,
    [capabilities, watchedCapabilityId],
  );
  const watchedToolKind = Form.useWatch('toolKind', form);
  const watchedToolIds = Form.useWatch('toolIds', form);

  const allowedToolTypes = useMemo((): ToolType[] => {
    switch (watchedCapabilityType) {
      case 'query':
        return ['query'];
      case 'action':
        if (watchedToolKind) return [watchedToolKind];
        return ['action', 'notification', 'http_query'];
      case 'workflow':
        return ['workflow'];
      default:
        return [];
    }
  }, [watchedCapabilityType, watchedToolKind]);

  const toolOptions = useMemo(
    () =>
      tools
        .filter((t) => {
          if (allowedToolTypes.length > 0 && !allowedToolTypes.includes(t.type)) return false;
          return t.status === 'enabled' || (watchedToolIds ?? []).includes(t.id);
        })
        .map((t) => ({
          value: t.id,
          label: `${t.name}（${TOOL_TYPE_META[t.type].label}${t.status === 'disabled' ? ' · 已停用' : ''}）`,
        })),
    [tools, allowedToolTypes, watchedToolIds],
  );

  useEffect(() => {
    if (!drawerOpen || toolsLoading) return;
    const current = form.getFieldValue('toolIds') as string[] | undefined;
    if (!current?.length || allowedToolTypes.length === 0) return;
    const validIds = new Set(toolOptions.map((o) => o.value));
    const filtered = current.filter((id) => validIds.has(id));
    if (filtered.length !== current.length) {
      form.setFieldsValue({ toolIds: filtered });
    }
  }, [drawerOpen, toolsLoading, allowedToolTypes, toolOptions, form]);

  const resetAiAssist = () => {
    setAiIntent('');
    setAiSamples('');
    setAiRationale(null);
    setAiWarnings([]);
  };

  const openCreate = () => {
    setEditing(undefined);
    form.resetFields();
    form.setFieldsValue({ priority: 100, needConfirmation: false });
    resetAiAssist();
    void loadTools();
    setDrawerOpen(true);
  };

  const handleAiSuggest = async () => {
    if (!activeTenantId) {
      message.warning('请先选择操作租户');
      return;
    }
    const capabilityId = form.getFieldValue('capabilityId') as string | undefined;
    if (!capabilityId) {
      message.warning('请先选择关联能力');
      return;
    }
    const intent = aiIntent.trim();
    if (intent.length < 4) {
      message.warning('请用至少一句话描述希望匹配的用户场景或问法');
      return;
    }
    const sampleQueries = aiSamples
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    setAiLoading(true);
    setAiRationale(null);
    setAiWarnings([]);
    try {
      const draft = await suggestRoutingRuleWithAi({
        tenantId: activeTenantId,
        capabilityId,
        intentDescription: intent,
        sampleQueries: sampleQueries.length > 0 ? sampleQueries : undefined,
      });
      form.setFieldsValue({
        name: draft.name,
        description: draft.description,
        keywordsText: JSON.stringify(draft.keywords, null, 2),
        patternsText: draft.patterns.length ? JSON.stringify(draft.patterns, null, 2) : undefined,
        intentsText: draft.intents.length ? JSON.stringify(draft.intents, null, 2) : undefined,
        priority: draft.priority,
        needConfirmation: draft.needConfirmation,
      });
      setAiRationale(draft.rationale);
      setAiWarnings(draft.warnings ?? []);
      message.success('已生成规则草案，请核对后保存');
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'AI 生成失败');
    } finally {
      setAiLoading(false);
    }
  };

  const openEdit = (rule: RoutingRule) => {
    setEditing(rule);
    resetAiAssist();
    form.resetFields();
    form.setFieldsValue({
      capabilityId: rule.capabilityId,
      name: rule.name,
      description: rule.description ?? undefined,
      keywordsText: rule.conditions.keywords?.length ? JSON.stringify(rule.conditions.keywords) : undefined,
      patternsText: rule.conditions.patterns?.length ? JSON.stringify(rule.conditions.patterns) : undefined,
      intentsText: rule.conditions.intents?.length ? JSON.stringify(rule.conditions.intents) : undefined,
      toolKind: rule.conditions.toolKind,
      toolIds: rule.toolIds ?? [],
      priority: rule.priority,
      needConfirmation: rule.needConfirmation,
    });
    void loadTools();
    setDrawerOpen(true);
  };

  const handleSubmit = async () => {
    if (!activeTenantId) { message.warning('请先选择租户'); return; }
    const v = await form.validateFields();

    let keywords: string[] = [];
    let patterns: string[] = [];
    let intents: string[] = [];
    try { if (v.keywordsText?.trim()) keywords = JSON.parse(v.keywordsText); } catch { message.error('关键词格式非法'); return; }
    try { if (v.patternsText?.trim()) patterns = JSON.parse(v.patternsText); } catch { message.error('正则模式格式非法'); return; }
    try { if (v.intentsText?.trim()) intents = JSON.parse(v.intentsText); } catch { message.error('意图标签格式非法'); return; }
    const toolIds = v.toolIds ?? [];

    const conditions: RoutingConditions = { keywords, patterns, intents };
    if (v.toolKind) {
      conditions.toolKind = v.toolKind;
    }

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
    withNowrap<RoutingRule>({
      title: '规则名称',
      dataIndex: 'name',
      width: 180,
      render: (v: string, row) => renderEllipsisLink(v, () => openEdit(row)),
    }),
    withNowrap<RoutingRule>({
      title: '关联能力',
      dataIndex: 'capability',
      width: 160,
      render: (c: RoutingRule['capability']) =>
        c ? <Tag color={CAPABILITY_TYPE_META[c.type].color}>{c.name}</Tag> : renderOptionalText(undefined),
    }),
    ellipsisTextColumn<RoutingRule>('优先级', 'priority', 80),
    withNowrap<RoutingRule>({
      title: '需确认',
      dataIndex: 'needConfirmation',
      width: 80,
      render: (b: boolean) =>
        b ? <Tag color="orange">是</Tag> : <Typography.Text type="secondary">否</Typography.Text>,
    }),
    withNowrap<RoutingRule>({
      title: '关键词数',
      key: 'keywords',
      width: 90,
      render: (_, row) => row.conditions?.keywords?.length ?? 0,
    }),
    withNowrap<RoutingRule>({
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: RoutingRuleStatus, row) => (
        <Switch
          checked={s === 'enabled'}
          checkedChildren="启用"
          unCheckedChildren="停用"
          onChange={(c) => handleToggleStatus(row, c)}
        />
      ),
    }),
    withNowrap<RoutingRule>({
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      render: fmt,
    }),
    withNowrap<RoutingRule>({
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
        <Typography.Title level={3} className="!mb-0">路由规则</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={!activeTenantId}>新建规则</Button>
      </div>

      {!activeTenantId ? (
        <Alert type="warning" showIcon message="请先在顶栏选择「当前操作租户」" />
      ) : (
        <>
          <Alert
            className="mb-4"
            type="info"
            showIcon
            message={`当前租户：${activeTenantName ?? activeTenantId}`}
            description="配置能力与 Tool、条件的关联，定义每类能力的路由匹配规则。关联能力来自「能力目录」；若为空，刷新后平台将按租户已开通类型自动初始化四类基础能力。"
          />
          {!loading && capabilities.length === 0 && (
            <Alert
              className="mb-4"
              type="warning"
              showIcon
              message="当前租户暂无能力目录记录"
              description="请刷新页面；若仍为空，请确认租户 config 已开通 qa/query/action/workflow，或在「能力路由 → 能力目录」手动新建。"
            />
          )}
          <Space className="mb-4" wrap>
            <Input.Search allowClear placeholder="搜索规则名称/描述" style={{ width: 240 }} onSearch={setKeyword} />
            <Select allowClear placeholder="关联能力" style={{ width: 200 }} options={capOptions} value={capFilter} onChange={setCapFilter} />
            <Select allowClear placeholder="状态" style={{ width: 120 }} options={[{ value: 'enabled', label: '启用' }, { value: 'disabled', label: '停用' }]} value={statusFilter} onChange={setStatusFilter} />
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          </Space>
          <Table<RoutingRule>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data}
            pagination={false}
            locale={{ emptyText: <Empty description="暂无路由规则" /> }}
            {...tableEllipsisLayout}
          />
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
          <Card
            size="small"
            type="inner"
            title={
              <Space>
                <ThunderboltOutlined />
                AI 辅助生成
              </Space>
            }
            className="mb-4"
          >
            <Typography.Paragraph type="secondary" className="!mb-3 text-xs">
              先选择关联能力，用自然语言描述要匹配的用户问法；可粘贴示例用户输入（每行一条）。生成结果会填入下方表单，保存前建议在「路由测试」验证。
            </Typography.Paragraph>
            <Input.TextArea
              rows={2}
              placeholder="例如：用户询问订单状态、物流、退款进度时使用本规则"
              value={aiIntent}
              onChange={(e) => setAiIntent(e.target.value)}
              disabled={aiLoading}
            />
            <Input.TextArea
              className="mt-2"
              rows={3}
              placeholder={'示例用户输入（可选，每行一条）\n查一下我的订单到哪了\n订单 12345 物流'}
              value={aiSamples}
              onChange={(e) => setAiSamples(e.target.value)}
              disabled={aiLoading}
            />
            <Button
              type="primary"
              ghost
              icon={<ThunderboltOutlined />}
              className="mt-2"
              loading={aiLoading}
              onClick={() => void handleAiSuggest()}
            >
              生成匹配条件
            </Button>
            {aiRationale && (
              <Alert className="mt-3" type="info" showIcon message={aiRationale} />
            )}
            {aiWarnings.length > 0 && (
              <Alert
                className="mt-2"
                type="warning"
                showIcon
                message="生成提示"
                description={
                  <ul className="mb-0 pl-4">
                    {aiWarnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                }
              />
            )}
          </Card>

          <Form.Item label="关联能力" name="capabilityId" rules={[{ required: true, message: '请选择关联能力' }]}>
            <Select placeholder="选择能力" options={capOptions} />
          </Form.Item>
          <Typography.Paragraph type="secondary" className="!mb-3 text-xs">
            规则仅在所选<strong>能力内</strong>匹配用户输入后绑定 Tool。操作型能力可绑 action / notification / http_query Tool。
          </Typography.Paragraph>
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
          {watchedCapabilityType === 'action' && (
            <Form.Item
              label="Tool 类型过滤（toolKind，可选）"
              name="toolKind"
              tooltip="限定本规则绑定的 toolIds 仅解析为指定 Tool 类型；HTTP 业务查询选 http_query"
            >
              <Select allowClear placeholder="不限" options={ROUTING_TOOL_KIND_OPTIONS} />
            </Form.Item>
          )}

          <Typography.Title level={5}>可调用工具</Typography.Title>
          <Form.Item
            name="toolIds"
            label="工具"
            tooltip={
              watchedCapabilityType === 'qa'
                ? '问答型能力通常无需绑定 Tool'
                : '命中规则后调用的 Tool；选项为当前租户下已配置工具，并按关联能力类型过滤'
            }
          >
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              loading={toolsLoading}
              disabled={allowedToolTypes.length === 0}
              placeholder={
                allowedToolTypes.length === 0
                  ? '问答型能力无需绑定工具'
                  : toolOptions.length === 0
                    ? '当前租户暂无可用工具，请先在工具管理或查询型配置中创建'
                    : '选择可调用工具（可多选）'
              }
              options={toolOptions}
            />
          </Form.Item>
          {watchedCapabilityType === 'query' && (
            <Typography.Paragraph type="secondary" className="!mb-0 text-xs">
              查询型能力仅可选择 NL2SQL 类型（ToolType.query）工具。
            </Typography.Paragraph>
          )}
          {watchedCapabilityType === 'action' && watchedToolKind && (
            <Typography.Paragraph type="secondary" className="!mb-0 text-xs">
              已按 toolKind={watchedToolKind} 过滤可选工具。
            </Typography.Paragraph>
          )}
        </Form>
      </Drawer>
    </>
  );
}
