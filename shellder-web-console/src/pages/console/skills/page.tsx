'use client';

import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
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
import { Tool, listTools } from '@/lib/tool';
import {
  CAPABILITY_TYPE_META,
  CAPABILITY_TYPE_OPTIONS,
  CreateSkillInput,
  ENTRY_MODE_OPTIONS,
  EXEC_STATUS_META,
  RISK_LEVEL_META,
  RISK_LEVEL_OPTIONS,
  SKILL_STATUS_META,
  SKILL_STATUS_OPTIONS,
  TRIGGER_TYPE_OPTIONS,
  CapabilityType,
  Skill,
  SkillDetail,
  SkillExecStatus,
  SkillExecution,
  SkillTrigger,
  SkillRiskLevel,
  SkillStatus,
  TriggerTestCandidate,
  TriggerTestResult,
  UpdateSkillInput,
  createSkill,
  deleteSkill,
  getSkill,
  getSkillExecutions,
  listSkills,
  testSkillTrigger,
  updateSkill,
  updateSkillStatus,
} from '@/lib/skill';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

interface TriggerRow {
  triggerText: string;
  triggerType: string;
  priority: number;
}

interface BindingRow {
  bindingType: string;
  targetId: string;
  orderNo: number;
  config?: string;
}

interface SkillFormValues {
  code: string;
  name: string;
  description?: string;
  category?: string;
  capabilityType: CapabilityType;
  status: SkillStatus;
  riskLevel: SkillRiskLevel;
  needConfirmation: boolean;
  permissionScope?: string;
  entryMode: 'tool' | 'workflow';
  entryToolId?: string;
  workflowToolId?: string;
  inputSchemaText?: string;
  outputSchemaText?: string;
  preconditionsText?: string;
  resultTemplate?: string;
  missingParamStrategyText?: string;
  failureHint?: string;
  remark?: string;
}

function parseJsonOr<T>(text: string | undefined, fallback: T): T {
  if (!text?.trim()) return fallback;
  return JSON.parse(text) as T;
}

export default function SkillPage() {
  const { message, modal } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();
  const [form] = Form.useForm<SkillFormValues>();

  const [data, setData] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [capFilter, setCapFilter] = useState<CapabilityType | undefined>();
  const [statusFilter, setStatusFilter] = useState<SkillStatus | undefined>();
  const [riskFilter, setRiskFilter] = useState<SkillRiskLevel | undefined>();

  const [tools, setTools] = useState<Tool[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Skill | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [formEntryMode, setFormEntryMode] = useState<'tool' | 'workflow'>('tool');

  const [triggers, setTriggers] = useState<TriggerRow[]>([]);
  const [bindings, setBindings] = useState<BindingRow[]>([]);

  const [detail, setDetail] = useState<SkillDetail | undefined>();
  const [detailLoading, setDetailLoading] = useState(false);

  const [testOpen, setTestOpen] = useState(false);
  const [testText, setTestText] = useState('');
  const [testCapType, setTestCapType] = useState<string | undefined>();
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<TriggerTestResult | undefined>();

  const [execSkillId, setExecSkillId] = useState<string | undefined>();
  const [execSkillName, setExecSkillName] = useState('');
  const [execData, setExecData] = useState<SkillExecution[]>([]);
  const [execLoading, setExecLoading] = useState(false);

  const activeTenantName = useMemo(
    () => tenants.find((t) => t.id === activeTenantId)?.name,
    [tenants, activeTenantId],
  );

  const load = useCallback(async () => {
    if (!activeTenantId) { setData([]); return; }
    setLoading(true);
    try {
      const res = await listSkills({
        tenantId: activeTenantId,
        keyword,
        capabilityType: capFilter,
        status: statusFilter,
        riskLevel: riskFilter,
        pageSize: 200,
      });
      setData(res.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载技能书列表失败');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, keyword, capFilter, statusFilter, riskFilter, message]);

  useEffect(() => { void load(); }, [load]);

  const loadTools = useCallback(async () => {
    if (!activeTenantId) return;
    try {
      const res = await listTools({ tenantId: activeTenantId, pageSize: 200 });
      setTools(res.items);
    } catch { setTools([]); }
  }, [activeTenantId]);

  const toolOptions = useMemo(
    () => tools.map((t) => ({ value: t.id, label: `${t.name}（${t.type}）` })),
    [tools],
  );
  const workflowToolOptions = useMemo(
    () => tools.filter((t) => t.type === 'workflow').map((t) => ({ value: t.id, label: t.name })),
    [tools],
  );

  const openCreate = () => {
    setEditing(undefined);
    setFormEntryMode('tool');
    setTriggers([]);
    setBindings([]);
    form.resetFields();
    form.setFieldsValue({
      status: 'draft',
      riskLevel: 'low',
      needConfirmation: false,
      capabilityType: 'qa',
      entryMode: 'tool',
    });
    void loadTools();
    setDrawerOpen(true);
  };

  const openEdit = (s: Skill) => {
    setEditing(s);
    setFormEntryMode(s.entryMode);
    setTriggers(
      s.triggers.map((t) => ({
        triggerText: t.triggerText,
        triggerType: t.triggerType,
        priority: t.priority,
      })),
    );
    setBindings(
      s.bindings.map((b) => ({
        bindingType: b.bindingType,
        targetId: b.targetId,
        orderNo: b.orderNo,
        config: b.config ? JSON.stringify(b.config, null, 2) : undefined,
      })),
    );
    form.resetFields();
    form.setFieldsValue({
      code: s.code,
      name: s.name,
      description: s.description ?? undefined,
      category: s.category ?? undefined,
      capabilityType: s.capabilityType,
      status: s.status,
      riskLevel: s.riskLevel,
      needConfirmation: s.needConfirmation,
      permissionScope: s.permissionScope ?? undefined,
      entryMode: s.entryMode,
      entryToolId: s.entryToolId ?? undefined,
      workflowToolId: s.workflowToolId ?? undefined,
      inputSchemaText: s.inputSchema ? JSON.stringify(s.inputSchema, null, 2) : undefined,
      outputSchemaText: s.outputSchema ? JSON.stringify(s.outputSchema, null, 2) : undefined,
      preconditionsText: s.preconditions ? JSON.stringify(s.preconditions, null, 2) : undefined,
      resultTemplate: s.resultTemplate ?? undefined,
      missingParamStrategyText: s.missingParamStrategy
        ? JSON.stringify(s.missingParamStrategy, null, 2)
        : undefined,
      failureHint: s.failureHint ?? undefined,
      remark: s.remark ?? undefined,
    });
    void loadTools();
    setDrawerOpen(true);
  };

  const openDetail = async (s: Skill) => {
    setDetailLoading(true);
    try { setDetail(await getSkill(s.id)); }
    catch (err) { message.error(err instanceof Error ? err.message : '加载技能书详情失败'); }
    finally { setDetailLoading(false); }
  };

  const openExecLog = async (s: Skill) => {
    setExecSkillId(s.id);
    setExecSkillName(s.name);
    setExecLoading(true);
    try {
      const res = await getSkillExecutions(s.id, { pageSize: 100 });
      setExecData(res.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载调用记录失败');
    } finally {
      setExecLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!activeTenantId) { message.warning('请先在顶栏选择当前操作租户'); return; }
    const v = await form.validateFields();

    let inputSchema: Record<string, unknown> | undefined;
    let outputSchema: Record<string, unknown> | undefined;
    let preconditions: Record<string, unknown> | undefined;
    let missingParamStrategy: Record<string, unknown> | undefined;

    try { inputSchema = parseJsonOr(v.inputSchemaText, undefined); }
    catch { message.error('输入参数 schema 不是合法 JSON'); return; }
    try { outputSchema = parseJsonOr(v.outputSchemaText, undefined); }
    catch { message.error('输出结果 schema 不是合法 JSON'); return; }
    try { preconditions = parseJsonOr(v.preconditionsText, undefined); }
    catch { message.error('前置条件不是合法 JSON'); return; }
    try { missingParamStrategy = parseJsonOr(v.missingParamStrategyText, undefined); }
    catch { message.error('缺参追问策略不是合法 JSON'); return; }

    const triggerData = triggers.filter((t) => t.triggerText.trim());
    const bindingData = bindings.filter((b) => b.targetId.trim()).map((b) => ({
      ...b,
      config: b.config ? (JSON.parse(b.config) as Record<string, unknown>) : undefined,
    }));

    setSubmitting(true);
    try {
      if (editing) {
        const payload: UpdateSkillInput = {
          code: v.code,
          name: v.name,
          description: v.description,
          category: v.category,
          capabilityType: v.capabilityType,
          status: v.status,
          riskLevel: v.riskLevel,
          needConfirmation: v.needConfirmation,
          permissionScope: v.permissionScope,
          entryMode: v.entryMode,
          entryToolId: v.entryToolId ?? '',
          workflowToolId: v.workflowToolId ?? '',
          inputSchema,
          outputSchema,
          preconditions,
          resultTemplate: v.resultTemplate,
          missingParamStrategy,
          failureHint: v.failureHint,
          remark: v.remark,
          triggers: triggerData,
          bindings: bindingData,
        };
        await updateSkill(editing.id, payload);
      } else {
        const payload: CreateSkillInput = {
          tenantId: activeTenantId,
          code: v.code,
          name: v.name,
          description: v.description,
          category: v.category,
          capabilityType: v.capabilityType,
          status: v.status,
          riskLevel: v.riskLevel,
          needConfirmation: v.needConfirmation,
          permissionScope: v.permissionScope,
          entryMode: v.entryMode,
          entryToolId: v.entryToolId,
          workflowToolId: v.workflowToolId,
          inputSchema,
          outputSchema,
          preconditions,
          resultTemplate: v.resultTemplate,
          missingParamStrategy,
          failureHint: v.failureHint,
          remark: v.remark,
          triggers: triggerData,
          bindings: bindingData,
        };
        await createSkill(payload);
      }
      setDrawerOpen(false);
      message.success('保存成功');
      void load();
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    } finally { setSubmitting(false); }
  };

  const handleToggleStatus = async (s: Skill, status: SkillStatus) => {
    try {
      await updateSkillStatus(s.id, status);
      message.success(status === 'enabled' ? '已启用' : '已停用');
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '状态更新失败');
    }
  };

  const handleDelete = (s: Skill) => {
    modal.confirm({
      title: `确认删除技能书「${s.name}」？`,
      content: '删除后已有调用记录将保留（断开关联）。',
      okButtonProps: { danger: true },
      onOk: async () => {
        try { await deleteSkill(s.id); message.success('已删除'); void load(); }
        catch (err) { message.error(err instanceof Error ? err.message : '删除失败'); }
      },
    });
  };

  const runTest = async () => {
    if (!activeTenantId) { message.warning('请先选择租户'); return; }
    if (!testText.trim()) { message.warning('请输入测试语句'); return; }
    setTestRunning(true);
    try {
      setTestResult(await testSkillTrigger({
        tenantId: activeTenantId,
        text: testText,
        capabilityType: testCapType,
      }));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '触发测试失败');
    } finally { setTestRunning(false); }
  };

  const columns: ColumnsType<Skill> = [
    withNowrap<Skill>({
      title: '技能名称',
      dataIndex: 'name',
      width: 180,
      render: (v: string, row) => renderEllipsisLink(v, () => openDetail(row)),
    }),
    ellipsisTextColumn<Skill>('编码', 'code', 120),
    withNowrap<Skill>({
      title: '能力类型',
      dataIndex: 'capabilityType',
      width: 100,
      render: (t: CapabilityType) => (
        <Tag color={CAPABILITY_TYPE_META[t].color}>{CAPABILITY_TYPE_META[t].label}</Tag>
      ),
    }),
    withNowrap<Skill>({
      title: '风险',
      dataIndex: 'riskLevel',
      width: 70,
      render: (r: SkillRiskLevel) => (
        <Tag color={RISK_LEVEL_META[r].color}>{RISK_LEVEL_META[r].label}</Tag>
      ),
    }),
    withNowrap<Skill>({
      title: '需确认',
      dataIndex: 'needConfirmation',
      width: 70,
      render: (b: boolean) =>
        b ? <Tag color="orange">是</Tag> : <Typography.Text type="secondary">否</Typography.Text>,
    }),
    withNowrap<Skill>({
      title: '入口',
      dataIndex: 'entryMode',
      width: 110,
      render: (m: string) =>
        m === 'workflow' ? <Tag color="purple">Workflow</Tag> : <Tag color="blue">Tool</Tag>,
    }),
    withNowrap<Skill>({
      title: '最近调用',
      dataIndex: 'lastCalledAt',
      width: 160,
      render: (v: string | null) => fmt(v),
    }),
    withNowrap<Skill>({
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: SkillStatus) => (
        <Tag color={SKILL_STATUS_META[s].color}>{SKILL_STATUS_META[s].label}</Tag>
      ),
    }),
    withNowrap<Skill>({
      title: '操作',
      key: 'actions',
      width: 240,
      render: (_, row) => (
        <Space size="small">
          <a onClick={() => openEdit(row)}>编辑</a>
          <a onClick={() => openExecLog(row)}>调用记录</a>
          {row.status === 'enabled' ? (
            <a onClick={() => handleToggleStatus(row, 'disabled')}>停用</a>
          ) : (
            <a onClick={() => handleToggleStatus(row, 'enabled')}>启用</a>
          )}
          <a className="text-red-500" onClick={() => handleDelete(row)}>
            删除
          </a>
        </Space>
      ),
    }),
  ];

  const execColumns: ColumnsType<SkillExecution> = [
    withNowrap<SkillExecution>({ title: '时间', dataIndex: 'startedAt', width: 160, render: (v: string) => fmt(v) }),
    withNowrap<SkillExecution>({
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (s: SkillExecStatus) => (
        <Tag color={EXEC_STATUS_META[s].color}>{EXEC_STATUS_META[s].label}</Tag>
      ),
    }),
    withNowrap<SkillExecution>({
      title: '会话',
      dataIndex: 'sessionId',
      width: 140,
      ellipsis: true,
      render: (v: string | null) => renderOptionalText(v),
    }),
    withNowrap<SkillExecution>({
      title: '任务',
      dataIndex: 'taskId',
      width: 140,
      ellipsis: true,
      render: (v: string | null) => renderOptionalText(v),
    }),
    withNowrap<SkillExecution>({
      title: '失败原因',
      dataIndex: 'errorSummary',
      ellipsis: true,
      render: (v: string | null) => renderOptionalText(v),
    }),
    withNowrap<SkillExecution>({
      title: '耗时',
      key: 'duration',
      width: 80,
      render: (_, row) => {
        if (!row.finishedAt) return '—';
        const ms = new Date(row.finishedAt).getTime() - new Date(row.startedAt).getTime();
        return `${ms}ms`;
      },
    }),
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">技能书管理</Typography.Title>
        <Space>
          <Button onClick={() => { setTestOpen(true); setTestResult(undefined); setTestText(''); }} disabled={!activeTenantId}>
            触发测试
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={!activeTenantId}>
            新建技能书
          </Button>
        </Space>
      </div>

      {!activeTenantId ? (
        <Alert type="warning" showIcon message="请先在顶栏选择「当前操作租户」" description="技能书按租户隔离，需选定租户后查看与维护。" />
      ) : (
        <>
          <Alert className="mb-4" type="info" showIcon
            message={`当前租户：${activeTenantName ?? activeTenantId}`}
            description="技能书是四类能力之上的业务封装层，将面向用户的业务能力与底层 Tool / Workflow 解耦。"
          />
          <Space className="mb-4" wrap>
            <Input.Search allowClear placeholder="搜索名称 / 编码 / 描述" style={{ width: 260 }} onSearch={setKeyword} />
            <Select allowClear placeholder="能力类型" style={{ width: 120 }} options={CAPABILITY_TYPE_OPTIONS} value={capFilter} onChange={setCapFilter} />
            <Select allowClear placeholder="风险等级" style={{ width: 110 }} options={RISK_LEVEL_OPTIONS} value={riskFilter} onChange={setRiskFilter} />
            <Select allowClear placeholder="状态" style={{ width: 110 }} options={SKILL_STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          </Space>
          <Table<Skill>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data}
            pagination={false}
            {...tableEllipsisLayout}
            locale={{ emptyText: <Empty description="该租户暂无技能书" /> }}
          />
        </>
      )}

      {/* ── 新建 / 编辑抽屉 ─────────────────────── */}
      <Drawer
        title={editing ? '编辑技能书' : '新建技能书'}
        width={780}
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
        <Tabs items={[
          {
            key: 'basic',
            label: '基本信息',
            children: (
              <Form form={form} layout="vertical">
                <Space className="flex" size="large" align="start">
                  <Form.Item label="技能编码" name="code" rules={[{ required: true, message: '请输入编码' }]} style={{ width: 200 }}>
                    <Input placeholder="如 query_order" />
                  </Form.Item>
                  <Form.Item label="技能名称" name="name" rules={[{ required: true, message: '请输入名称' }]} style={{ width: 280 }}>
                    <Input placeholder="如：查询订单详情" />
                  </Form.Item>
                  <Form.Item label="分类" name="category" style={{ width: 150 }}>
                    <Input placeholder="自定义分类" />
                  </Form.Item>
                </Space>
                <Form.Item label="描述" name="description"><Input.TextArea rows={2} /></Form.Item>

                <Space className="flex" size="large" align="start">
                  <Form.Item label="能力类型" name="capabilityType" rules={[{ required: true }]} style={{ width: 130 }}>
                    <Select options={CAPABILITY_TYPE_OPTIONS} />
                  </Form.Item>
                  <Form.Item label="状态" name="status" rules={[{ required: true }]} style={{ width: 110 }}>
                    <Select options={SKILL_STATUS_OPTIONS} />
                  </Form.Item>
                  <Form.Item label="风险等级" name="riskLevel" rules={[{ required: true }]} style={{ width: 110 }}>
                    <Select options={RISK_LEVEL_OPTIONS} />
                  </Form.Item>
                  <Form.Item label="需人工确认" name="needConfirmation" valuePropName="checked">
                    <Switch checkedChildren="是" unCheckedChildren="否" />
                  </Form.Item>
                </Space>

                <Space className="flex" size="large" align="start">
                  <Form.Item label="入口模式" name="entryMode" rules={[{ required: true }]} style={{ width: 150 }}>
                    <Select options={ENTRY_MODE_OPTIONS} onChange={setFormEntryMode} />
                  </Form.Item>
                  {formEntryMode === 'tool' ? (
                    <Form.Item label="主 Tool" name="entryToolId" style={{ width: 300 }}>
                      <Select allowClear showSearch optionFilterProp="label" placeholder="选择 Tool" options={toolOptions} />
                    </Form.Item>
                  ) : (
                    <Form.Item label="Workflow Tool" name="workflowToolId" style={{ width: 300 }}>
                      <Select allowClear showSearch optionFilterProp="label" placeholder="选择 Workflow Tool" options={workflowToolOptions} />
                    </Form.Item>
                  )}
                  <Form.Item label="权限范围" name="permissionScope" style={{ width: 180 }}>
                    <Input placeholder="如 order:read" />
                  </Form.Item>
                </Space>

                <Form.Item label="备注" name="remark"><Input.TextArea rows={1} /></Form.Item>
              </Form>
            ),
          },
          {
            key: 'craft',
            label: '技能制作',
            children: (
              <Form form={form} layout="vertical">
                <Form.Item label="输入参数 Schema（JSON Schema）" name="inputSchemaText">
                  <Input.TextArea rows={5} className="font-mono text-xs" placeholder='{"type":"object","properties":{}}' />
                </Form.Item>
                <Form.Item label="输出结果 Schema（JSON Schema）" name="outputSchemaText">
                  <Input.TextArea rows={4} className="font-mono text-xs" />
                </Form.Item>
                <Form.Item label="前置条件（JSON）" name="preconditionsText">
                  <Input.TextArea rows={3} className="font-mono text-xs" />
                </Form.Item>
                <Form.Item label="结果模板" name="resultTemplate">
                  <Input.TextArea rows={3} placeholder="如：订单 {{orderId}} 的状态为 {{status}}" />
                </Form.Item>
                <Form.Item label="缺参追问策略（JSON）" name="missingParamStrategyText">
                  <Input.TextArea rows={3} className="font-mono text-xs" placeholder='{"mode":"ask","prompts":{}}' />
                </Form.Item>
                <Form.Item label="失败提示" name="failureHint">
                  <Input.TextArea rows={2} placeholder="当技能执行失败时展示给用户的提示" />
                </Form.Item>

                <Typography.Title level={5} className="!mt-4">触发示例</Typography.Title>
                {triggers.map((t, i) => (
                  <Space key={i} className="mb-2 flex" align="start">
                    <Input placeholder="触发文本" value={t.triggerText} style={{ width: 260 }}
                      onChange={(e) => { const next = [...triggers]; next[i] = { ...t, triggerText: e.target.value }; setTriggers(next); }}
                    />
                    <Select value={t.triggerType} style={{ width: 100 }} options={TRIGGER_TYPE_OPTIONS}
                      onChange={(v) => { const next = [...triggers]; next[i] = { ...t, triggerType: v }; setTriggers(next); }}
                    />
                    <InputNumber value={t.priority} min={0} style={{ width: 80 }} placeholder="优先级"
                      onChange={(v) => { const next = [...triggers]; next[i] = { ...t, priority: v ?? 100 }; setTriggers(next); }}
                    />
                    <Button danger onClick={() => setTriggers(triggers.filter((_, j) => j !== i))}>删除</Button>
                  </Space>
                ))}
                <Button type="dashed" className="mb-4" onClick={() => setTriggers([...triggers, { triggerText: '', triggerType: 'keyword', priority: 100 }])}>
                  + 添加触发示例
                </Button>

                <Typography.Title level={5} className="!mt-4">绑定关系</Typography.Title>
                {bindings.map((b, i) => (
                  <Space key={i} className="mb-2 flex" align="start">
                    <Select value={b.bindingType} style={{ width: 120 }}
                      options={[{ value: 'tool', label: 'Tool' }, { value: 'workflow', label: 'Workflow' }, { value: 'connector', label: 'Connector' }]}
                      onChange={(v) => { const next = [...bindings]; next[i] = { ...b, bindingType: v }; setBindings(next); }}
                    />
                    <Select showSearch optionFilterProp="label" value={b.targetId} style={{ width: 240 }} placeholder="选择目标" options={toolOptions}
                      onChange={(v) => { const next = [...bindings]; next[i] = { ...b, targetId: v }; setBindings(next); }}
                    />
                    <InputNumber value={b.orderNo} min={0} style={{ width: 70 }} placeholder="序号"
                      onChange={(v) => { const next = [...bindings]; next[i] = { ...b, orderNo: v ?? 0 }; setBindings(next); }}
                    />
                    <Button danger onClick={() => setBindings(bindings.filter((_, j) => j !== i))}>删除</Button>
                  </Space>
                ))}
                <Button type="dashed" onClick={() => setBindings([...bindings, { bindingType: 'tool', targetId: '', orderNo: 0 }])}>
                  + 添加绑定
                </Button>
              </Form>
            ),
          },
        ]} />
      </Drawer>

      {/* ── 详情抽屉 ────────────────────────────── */}
      <Drawer title="技能书详情" width={720} open={!!detail} loading={detailLoading} onClose={() => setDetail(undefined)} destroyOnClose>
        {detail && <SkillDetailView detail={detail} />}
      </Drawer>

      {/* ── 触发测试弹窗 ────────────────────────── */}
      <Modal title="触发测试" open={testOpen} onCancel={() => setTestOpen(false)} width={720}
        footer={[
          <Button key="close" onClick={() => setTestOpen(false)}>关闭</Button>,
          <Button key="run" type="primary" loading={testRunning} onClick={runTest}>执行测试</Button>,
        ]}
      >
        <Alert className="mb-3" type="info" showIcon message="输入测试语句，查看能力路由结果、候选技能书与最终命中。" />
        <Space className="mb-3 flex" align="start">
          <Input.TextArea rows={2} style={{ width: 440 }} placeholder="输入测试语句…" value={testText} onChange={(e) => setTestText(e.target.value)} />
          <Select allowClear placeholder="能力类型（可选）" style={{ width: 130 }} options={CAPABILITY_TYPE_OPTIONS} value={testCapType} onChange={setTestCapType} />
        </Space>
        {testResult && <TriggerTestResultView result={testResult} />}
      </Modal>

      {/* ── 调用记录抽屉 ────────────────────────── */}
      <Drawer title={`调用记录 — ${execSkillName}`} width={800} open={!!execSkillId} onClose={() => setExecSkillId(undefined)} destroyOnClose>
        <Table<SkillExecution>
          rowKey="id"
          loading={execLoading}
          columns={execColumns}
          dataSource={execData}
          pagination={false}
          {...tableEllipsisLayout}
          locale={{ emptyText: <Empty description="暂无调用记录" /> }}
        />
      </Drawer>
    </>
  );
}

// ── 详情视图 ────────────────────────────────────────────

function SkillDetailView({ detail }: { detail: SkillDetail }) {
  return (
    <>
      <Descriptions column={2} bordered size="small">
        <Descriptions.Item label="编码">{detail.code}</Descriptions.Item>
        <Descriptions.Item label="名称">{detail.name}</Descriptions.Item>
        <Descriptions.Item label="能力类型">
          <Tag color={CAPABILITY_TYPE_META[detail.capabilityType].color}>{CAPABILITY_TYPE_META[detail.capabilityType].label}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="状态">
          <Tag color={SKILL_STATUS_META[detail.status].color}>{SKILL_STATUS_META[detail.status].label}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="风险等级">
          <Tag color={RISK_LEVEL_META[detail.riskLevel].color}>{RISK_LEVEL_META[detail.riskLevel].label}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="需人工确认">{detail.needConfirmation ? '是' : '否'}</Descriptions.Item>
        <Descriptions.Item label="入口模式">{detail.entryMode === 'workflow' ? 'Workflow Tool' : '主 Tool'}</Descriptions.Item>
        <Descriptions.Item label="版本">v{detail.version}</Descriptions.Item>
        <Descriptions.Item label="入口 Tool" span={2}>
          {detail.entryTool ? <Tag>{`${detail.entryTool.name}（${detail.entryTool.type}）`}</Tag> : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Workflow Tool" span={2}>
          {detail.workflowTool ? <Tag>{`${detail.workflowTool.name}（${detail.workflowTool.type}）`}</Tag> : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="权限范围">{detail.permissionScope || '—'}</Descriptions.Item>
        <Descriptions.Item label="分类">{detail.category || '—'}</Descriptions.Item>
        <Descriptions.Item label="描述" span={2}>{detail.description || '—'}</Descriptions.Item>
      </Descriptions>

      {detail.triggers.length > 0 && (
        <>
          <Typography.Title level={5} className="!mt-6">触发示例</Typography.Title>
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            columns={[
              ellipsisTextColumn<SkillTrigger>('文本', 'triggerText', 200),
              withNowrap<SkillTrigger>({ title: '类型', dataIndex: 'triggerType', width: 80 }),
              withNowrap<SkillTrigger>({ title: '优先级', dataIndex: 'priority', width: 80 }),
            ]}
            dataSource={detail.triggers}
            {...tableEllipsisLayout}
          />
        </>
      )}

      {detail.inputSchema && (
        <>
          <Typography.Title level={5} className="!mt-6">输入参数 Schema</Typography.Title>
          <pre className="text-xs bg-gray-50 p-2 rounded whitespace-pre-wrap">{JSON.stringify(detail.inputSchema, null, 2)}</pre>
        </>
      )}
      {detail.outputSchema && (
        <>
          <Typography.Title level={5} className="!mt-6">输出结果 Schema</Typography.Title>
          <pre className="text-xs bg-gray-50 p-2 rounded whitespace-pre-wrap">{JSON.stringify(detail.outputSchema, null, 2)}</pre>
        </>
      )}
      {detail.resultTemplate && (
        <>
          <Typography.Title level={5} className="!mt-6">结果模板</Typography.Title>
          <pre className="text-xs bg-gray-50 p-2 rounded whitespace-pre-wrap">{detail.resultTemplate}</pre>
        </>
      )}

      <Typography.Title level={5} className="!mt-6">调用统计</Typography.Title>
      <Descriptions column={2} bordered size="small">
        <Descriptions.Item label="样本数">{detail.stats.sampleSize}</Descriptions.Item>
        <Descriptions.Item label="成功率">{(detail.stats.successRate * 100).toFixed(1)}%</Descriptions.Item>
        <Descriptions.Item label="失败率">{(detail.stats.failureRate * 100).toFixed(1)}%</Descriptions.Item>
        <Descriptions.Item label="平均耗时">{detail.stats.avgDurationMs != null ? `${detail.stats.avgDurationMs}ms` : '—'}</Descriptions.Item>
      </Descriptions>

      {detail.recentExecutions.length > 0 && (
        <>
          <Typography.Title level={5} className="!mt-6">最近调用</Typography.Title>
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            columns={[
              withNowrap<SkillExecution>({ title: '时间', dataIndex: 'startedAt', width: 160, render: (v: string) => fmt(v) }),
              withNowrap<SkillExecution>({
                title: '状态',
                dataIndex: 'status',
                width: 80,
                render: (s: SkillExecStatus) => (
                  <Tag color={EXEC_STATUS_META[s].color}>{EXEC_STATUS_META[s].label}</Tag>
                ),
              }),
              withNowrap<SkillExecution>({
                title: '会话',
                dataIndex: 'sessionId',
                width: 120,
                ellipsis: true,
                render: (v: string | null) => renderOptionalText(v),
              }),
              withNowrap<SkillExecution>({
                title: '失败原因',
                dataIndex: 'errorSummary',
                ellipsis: true,
                render: (v: string | null) => renderOptionalText(v),
              }),
            ]}
            dataSource={detail.recentExecutions}
            {...tableEllipsisLayout}
          />
        </>
      )}
    </>
  );
}

// ── 触发测试结果视图 ──────────────────────────────────────

function TriggerTestResultView({ result }: { result: TriggerTestResult }) {
  return (
    <div className="mt-4">
      <Descriptions column={2} bordered size="small">
        <Descriptions.Item label="输入文本">{result.inputText}</Descriptions.Item>
        <Descriptions.Item label="候选技能书数">{result.candidateCount}</Descriptions.Item>
      </Descriptions>

      {result.hitSkill ? (
        <Alert className="mt-3" type="success" showIcon
          message={`命中技能书：${result.hitSkill.name}（${result.hitSkill.code}）`}
          description={
            <>
              <div>能力类型：{CAPABILITY_TYPE_META[result.hitSkill.capabilityType].label}</div>
              <div>入口模式：{result.hitSkill.entryMode === 'workflow' ? 'Workflow Tool' : '主 Tool'}</div>
              <div>命中原因：{result.hitSkill.reason}</div>
              {result.entryTool && <div>最终入口：{result.entryTool.name}（{result.entryTool.type}）</div>}
            </>
          }
        />
      ) : (
        <Alert className="mt-3" type="warning" showIcon message="未命中任何技能书" />
      )}

      {result.candidates.length > 0 && (
        <>
          <Typography.Title level={5} className="!mt-4">候选列表</Typography.Title>
          <Table
            rowKey="skillId"
            size="small"
            pagination={false}
            columns={[
              ellipsisTextColumn<TriggerTestCandidate>('技能名称', 'skillName', 160),
              ellipsisTextColumn<TriggerTestCandidate>('编码', 'skillCode', 100),
              withNowrap<TriggerTestCandidate>({
                title: '能力类型',
                dataIndex: 'capabilityType',
                width: 80,
                render: (t: CapabilityType) => (
                  <Tag color={CAPABILITY_TYPE_META[t].color}>{CAPABILITY_TYPE_META[t].label}</Tag>
                ),
              }),
              withNowrap<TriggerTestCandidate>({
                title: '分数',
                dataIndex: 'score',
                width: 70,
                render: (v: number) => v.toFixed(2),
              }),
              ellipsisTextColumn<TriggerTestCandidate>('原因', 'reason', 200),
            ]}
            {...tableEllipsisLayout}
            dataSource={result.candidates}
          />
        </>
      )}
    </div>
  );
}
