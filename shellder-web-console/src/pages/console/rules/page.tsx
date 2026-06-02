'use client';

import { ExperimentOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
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
  EllipsisCell,
  ellipsisTextColumn,
  renderEllipsisLink,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import {
  CAPABILITY_OPTIONS,
  CreateRuleInput,
  PolicyDecision,
  RESULT_META,
  RISK_LEVEL_OPTIONS,
  RULE_ACTION_META,
  RULE_TYPE_META,
  RiskLevel,
  Rule,
  RuleAction,
  RuleConditions,
  RuleType,
  UpdateRuleInput,
  createRule,
  deleteRule,
  evaluateRules,
  listRules,
  updateRule,
  updateRuleStatus,
} from '@/lib/rule';

const fmt = (s: string) => new Date(s).toLocaleString('zh-CN');

const TYPE_OPTIONS = Object.entries(RULE_TYPE_META).map(([value, m]) => ({
  value,
  label: m.label,
}));
const ACTION_OPTIONS = Object.entries(RULE_ACTION_META).map(([value, m]) => ({
  value,
  label: m.label,
}));

interface RuleFormValues {
  name: string;
  type: RuleType;
  action: RuleAction;
  priority: number;
  description?: string;
  match: 'all' | 'any';
  toolNames: string[];
  toolNameContains?: string;
  riskLevels: RiskLevel[];
  capabilities: string[];
  needConfirmation: 'unset' | 'true' | 'false';
  permissionScopes: string[];
}

interface EvalFormValues {
  toolName?: string;
  riskLevel?: RiskLevel;
  capability?: string;
  needConfirmation: boolean;
  permissionScope?: string;
  requestSummary?: string;
  persistHits: boolean;
}

function conditionsToForm(c: RuleConditions): Partial<RuleFormValues> {
  return {
    match: c.match ?? 'all',
    toolNames: c.toolNames ?? [],
    toolNameContains: c.toolNameContains,
    riskLevels: c.riskLevels ?? [],
    capabilities: c.capabilities ?? [],
    needConfirmation:
      c.needConfirmation === undefined ? 'unset' : c.needConfirmation ? 'true' : 'false',
    permissionScopes: c.permissionScopes ?? [],
  };
}

function formToConditions(v: RuleFormValues): RuleConditions {
  const c: RuleConditions = { match: v.match };
  if (v.toolNames?.length) c.toolNames = v.toolNames;
  if (v.toolNameContains) c.toolNameContains = v.toolNameContains;
  if (v.riskLevels?.length) c.riskLevels = v.riskLevels;
  if (v.capabilities?.length) c.capabilities = v.capabilities;
  if (v.needConfirmation !== 'unset') c.needConfirmation = v.needConfirmation === 'true';
  if (v.permissionScopes?.length) c.permissionScopes = v.permissionScopes;
  return c;
}

function conditionSummary(c: RuleConditions): string {
  const parts: string[] = [];
  if (c.toolNames?.length) parts.push(`工具∈[${c.toolNames.join(', ')}]`);
  if (c.toolNameContains) parts.push(`工具名含「${c.toolNameContains}」`);
  if (c.riskLevels?.length) parts.push(`风险∈[${c.riskLevels.join(', ')}]`);
  if (c.capabilities?.length) parts.push(`能力∈[${c.capabilities.join(', ')}]`);
  if (c.needConfirmation !== undefined) parts.push(`needConfirmation=${c.needConfirmation}`);
  if (c.permissionScopes?.length) parts.push(`scope∈[${c.permissionScopes.join(', ')}]`);
  if (parts.length === 0) return '全量匹配';
  return `${c.match === 'any' ? '任一' : '全部'}：${parts.join('；')}`;
}

export default function RuleConfigPage() {
  const { message, modal } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();
  const [form] = Form.useForm<RuleFormValues>();
  const [evalForm] = Form.useForm<EvalFormValues>();

  const [data, setData] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const [evalOpen, setEvalOpen] = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);
  const [decision, setDecision] = useState<PolicyDecision | undefined>();

  const activeTenantName = useMemo(
    () => tenants.find((t) => t.id === activeTenantId)?.name,
    [tenants, activeTenantId],
  );

  const load = useCallback(async () => {
    if (!activeTenantId) {
      setData([]);
      return;
    }
    setLoading(true);
    try {
      const res = await listRules({ tenantId: activeTenantId, keyword, pageSize: 100 });
      setData(res.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载规则列表失败');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, keyword, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(undefined);
    form.resetFields();
    form.setFieldsValue({
      type: 'confirm',
      action: 'need_confirm',
      priority: 100,
      match: 'all',
      toolNames: [],
      riskLevels: [],
      capabilities: [],
      needConfirmation: 'unset',
      permissionScopes: [],
    });
    setDrawerOpen(true);
  };

  const openEdit = (rule: Rule) => {
    setEditing(rule);
    form.resetFields();
    form.setFieldsValue({
      name: rule.name,
      type: rule.type,
      action: rule.action,
      priority: rule.priority,
      description: rule.description ?? undefined,
      ...conditionsToForm(rule.conditions),
    } as RuleFormValues);
    setDrawerOpen(true);
  };

  const handleSubmit = async () => {
    if (!activeTenantId) {
      message.warning('请先在顶栏选择当前操作租户');
      return;
    }
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      const conditions = formToConditions(values);
      if (editing) {
        const payload: UpdateRuleInput = {
          name: values.name,
          type: values.type,
          action: values.action,
          priority: values.priority,
          description: values.description,
          conditions,
        };
        await updateRule(editing.id, payload);
      } else {
        const payload: CreateRuleInput = {
          tenantId: activeTenantId,
          name: values.name,
          type: values.type,
          action: values.action,
          priority: values.priority,
          description: values.description,
          conditions,
        };
        await createRule(payload);
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

  const handleToggleStatus = async (rule: Rule, enabled: boolean) => {
    try {
      await updateRuleStatus(rule.id, enabled ? 'enabled' : 'disabled');
      message.success(enabled ? '已启用' : '已停用');
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '状态更新失败');
    }
  };

  const handleDelete = (rule: Rule) => {
    modal.confirm({
      title: '确认删除该规则？',
      content: '删除后已有命中记录将保留（断开关联）。',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteRule(rule.id);
          message.success('已删除');
          void load();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  const openEvaluate = () => {
    setDecision(undefined);
    evalForm.resetFields();
    evalForm.setFieldsValue({ needConfirmation: false, persistHits: true });
    setEvalOpen(true);
  };

  const handleEvaluate = async () => {
    if (!activeTenantId) {
      message.warning('请先在顶栏选择当前操作租户');
      return;
    }
    const values = await evalForm.validateFields();
    setEvalLoading(true);
    try {
      const res = await evaluateRules({
        tenantId: activeTenantId,
        toolName: values.toolName,
        riskLevel: values.riskLevel,
        capability: values.capability,
        needConfirmation: values.needConfirmation,
        permissionScope: values.permissionScope,
        requestSummary: values.requestSummary,
        persistHits: values.persistHits,
      });
      setDecision(res);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '试评估失败');
    } finally {
      setEvalLoading(false);
    }
  };

  const columns: ColumnsType<Rule> = [
    withNowrap<Rule>({
      title: '规则名称',
      dataIndex: 'name',
      width: 180,
      render: (v: string, row) => renderEllipsisLink(v, () => openEdit(row)),
    }),
    withNowrap<Rule>({
      title: '类型',
      dataIndex: 'type',
      width: 120,
      render: (t: RuleType) => (
        <Tag color={RULE_TYPE_META[t].color}>{RULE_TYPE_META[t].label}</Tag>
      ),
    }),
    withNowrap<Rule>({
      title: '动作',
      dataIndex: 'action',
      width: 120,
      render: (a: RuleAction) => (
        <Tag color={RULE_ACTION_META[a].color}>{RULE_ACTION_META[a].label}</Tag>
      ),
    }),
    ellipsisTextColumn<Rule>('优先级', 'priority', 90),
    withNowrap<Rule>({
      title: '匹配条件',
      dataIndex: 'conditions',
      render: (c: RuleConditions) => {
        const summary = conditionSummary(c);
        return (
          <EllipsisCell tooltip={summary}>
            <Typography.Text type="secondary" className="text-xs">
              {summary}
            </Typography.Text>
          </EllipsisCell>
        );
      },
    }),
    withNowrap<Rule>({
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: Rule['status'], row) => (
        <Switch
          checked={s === 'enabled'}
          checkedChildren="启用"
          unCheckedChildren="停用"
          onChange={(checked) => handleToggleStatus(row, checked)}
        />
      ),
    }),
    withNowrap<Rule>({
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
        <Typography.Title level={3} className="!mb-0">
          规则配置
        </Typography.Title>
        <Space>
          <Button icon={<ExperimentOutlined />} onClick={openEvaluate} disabled={!activeTenantId}>
            试评估
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
            disabled={!activeTenantId}
          >
            新建规则
          </Button>
        </Space>
      </div>

      {!activeTenantId ? (
        <Alert
          type="warning"
          showIcon
          message="请先在顶栏选择「当前操作租户」"
          description="规则按租户隔离配置，需选定租户后查看与维护其规则。"
        />
      ) : (
        <>
          <Alert
            className="mb-4"
            type="info"
            showIcon
            message={`当前租户：${activeTenantName ?? activeTenantId}`}
            description="规则按 priority 升序评估（数值越小越优先）。Tool 执行前由 Policy 调用评估，命中写入命中记录。"
          />
          <Space className="mb-4" wrap>
            <Input.Search
              allowClear
              placeholder="搜索规则名称"
              style={{ width: 240 }}
              onSearch={setKeyword}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>
              刷新
            </Button>
          </Space>

          <Table<Rule>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data}
            pagination={false}
            locale={{ emptyText: <Empty description="该租户暂无规则" /> }}
            {...tableEllipsisLayout}
          />
        </>
      )}

      <Drawer
        title={editing ? '编辑规则' : '新建规则'}
        width={600}
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
            label="规则名称"
            name="name"
            rules={[{ required: true, message: '请输入规则名称' }]}
          >
            <Input placeholder="如：高风险动作需确认" />
          </Form.Item>
          <Space className="flex" size="large">
            <Form.Item
              label="规则类型"
              name="type"
              rules={[{ required: true }]}
              style={{ width: 180 }}
            >
              <Select options={TYPE_OPTIONS} />
            </Form.Item>
            <Form.Item
              label="命中动作"
              name="action"
              rules={[{ required: true }]}
              style={{ width: 180 }}
            >
              <Select options={ACTION_OPTIONS} />
            </Form.Item>
            <Form.Item
              label="优先级"
              name="priority"
              tooltip="数值越小越优先"
              rules={[{ required: true }]}
              style={{ width: 120 }}
            >
              <InputNumber min={0} max={9999} className="w-full" />
            </Form.Item>
          </Space>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Typography.Title level={5}>匹配条件（简易 DSL）</Typography.Title>
          <Typography.Paragraph type="secondary" className="text-xs">
            未填写任何条件表示租户内全量匹配；按下方「子句匹配」决定全部满足或任一满足。
          </Typography.Paragraph>

          <Form.Item label="子句匹配" name="match">
            <Select
              options={[
                { value: 'all', label: '全部满足（all）' },
                { value: 'any', label: '任一满足（any）' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Tool 名称（精确，命中其一）" name="toolNames">
            <Select mode="tags" allowClear placeholder="输入 Tool 名称，回车添加" />
          </Form.Item>
          <Form.Item label="Tool 名称包含" name="toolNameContains">
            <Input allowClear placeholder="如 delete（忽略大小写）" />
          </Form.Item>
          <Form.Item label="风险等级" name="riskLevels">
            <Select mode="multiple" allowClear options={RISK_LEVEL_OPTIONS} />
          </Form.Item>
          <Form.Item label="业务能力" name="capabilities">
            <Select mode="multiple" allowClear options={CAPABILITY_OPTIONS} />
          </Form.Item>
          <Form.Item label="Tool needConfirmation 标记" name="needConfirmation">
            <Select
              options={[
                { value: 'unset', label: '不限定' },
                { value: 'true', label: '为 true' },
                { value: 'false', label: '为 false' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Tool 权限范围" name="permissionScopes">
            <Select mode="tags" allowClear placeholder="输入权限范围标识，回车添加" />
          </Form.Item>
        </Form>
      </Drawer>

      <Drawer
        title="规则试评估"
        width={520}
        open={evalOpen}
        onClose={() => setEvalOpen(false)}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={() => setEvalOpen(false)}>关闭</Button>
            <Button type="primary" loading={evalLoading} onClick={handleEvaluate}>
              评估
            </Button>
          </Space>
        }
      >
        <Alert
          className="mb-4"
          type="info"
          showIcon
          message="模拟 Tool 执行上下文"
          description="07 工具就绪前可用本入口验证规则链路（如「高风险需确认」返回 needConfirm）。"
        />
        <Form form={evalForm} layout="vertical">
          <Form.Item label="Tool 名称" name="toolName">
            <Input allowClear placeholder="如 deleteUser" />
          </Form.Item>
          <Form.Item label="风险等级" name="riskLevel">
            <Select allowClear options={RISK_LEVEL_OPTIONS} placeholder="不指定" />
          </Form.Item>
          <Form.Item label="业务能力" name="capability">
            <Select allowClear options={CAPABILITY_OPTIONS} placeholder="不指定" />
          </Form.Item>
          <Form.Item label="权限范围" name="permissionScope">
            <Input allowClear placeholder="如 order:write" />
          </Form.Item>
          <Form.Item label="Tool needConfirmation" name="needConfirmation" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item label="请求摘要" name="requestSummary">
            <Input.TextArea rows={2} placeholder="脱敏请求摘要" />
          </Form.Item>
          <Form.Item label="写入命中记录" name="persistHits" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>

        {decision && (
          <>
            <Typography.Title level={5}>评估结果</Typography.Title>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="最终处置">
                <Tag color={RESULT_META[decision.result].color}>
                  {RESULT_META[decision.result].label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="allow">{String(decision.allow)}</Descriptions.Item>
              <Descriptions.Item label="needConfirm">
                {String(decision.needConfirm)}
              </Descriptions.Item>
              <Descriptions.Item label="highRisk">
                {String(decision.highRisk)}
              </Descriptions.Item>
              <Descriptions.Item label="原因">{decision.reason || '—'}</Descriptions.Item>
              <Descriptions.Item label="命中规则">
                {decision.matchedRules.length === 0 ? (
                  '无命中'
                ) : (
                  <Space direction="vertical" size={2}>
                    {decision.matchedRules.map((m) => (
                      <Tag key={m.ruleId} color={RULE_ACTION_META[m.action].color}>
                        {m.name}（{RULE_ACTION_META[m.action].label}）
                      </Tag>
                    ))}
                  </Space>
                )}
              </Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Drawer>
    </>
  );
}
