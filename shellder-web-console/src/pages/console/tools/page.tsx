'use client';

import { PlusOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
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
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import { ToolTestResultView } from '@/components/console/ToolTestResultView';
import { Connector, listConnectors } from '@/lib/connector';
import {
  CreateToolInput,
  RISK_LEVEL_META,
  RISK_LEVEL_OPTIONS,
  Tool,
  ToolConfig,
  ToolDetail,
  ToolRiskLevel,
  ToolStatus,
  ToolTestResult,
  ToolType,
  TOOL_TYPE_CONNECTOR_TYPE,
  TOOL_TYPE_META,
  TOOL_TYPE_OPTIONS,
  UpdateToolInput,
  createTool,
  deleteTool,
  getTool,
  listTools,
  testTool,
  updateTool,
  updateToolStatus,
} from '@/lib/tool';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

const DEFAULT_INPUT_SCHEMA = JSON.stringify(
  { type: 'object', properties: {}, required: [] },
  null,
  2,
);

interface ToolFormValues {
  name: string;
  description?: string;
  type: ToolType;
  riskLevel: ToolRiskLevel;
  needConfirmation: boolean;
  timeoutMs: number;
  permissionScope?: string;
  idempotencyKey?: string;
  auditEventType?: string;
  connectorId?: string;
  inputSchemaText: string;
  outputSchemaText?: string;
  // query
  sqlTableWhitelist?: string[];
  sqlFieldWhitelist?: string[];
  sqlMaxRows?: number;
  sqlMaxExecutionMs?: number;
  sqlTemplatesText?: string;
  // action / notification
  httpMethod?: string;
  httpPath?: string;
  httpHeadersText?: string;
  httpBodyTemplateText?: string;
  // workflow
  workflowStepsText?: string;
}

function parseJsonOr<T>(text: string | undefined, fallback: T): T {
  if (!text || !text.trim()) return fallback;
  return JSON.parse(text) as T;
}

function buildConfig(v: ToolFormValues): ToolConfig {
  switch (v.type) {
    case 'query':
      return {
        sql: {
          tableWhitelist: v.sqlTableWhitelist ?? [],
          fieldWhitelist: v.sqlFieldWhitelist ?? [],
          maxRows: v.sqlMaxRows ?? 100,
          maxExecutionMs: v.sqlMaxExecutionMs ?? 3000,
          templates: parseJsonOr(v.sqlTemplatesText, []),
        },
      };
    case 'action':
    case 'notification':
      return {
        http: {
          method: v.httpMethod ?? 'POST',
          path: v.httpPath ?? '',
          headers: parseJsonOr(v.httpHeadersText, {}),
          bodyTemplate: v.httpBodyTemplateText?.trim()
            ? parseJsonOr(v.httpBodyTemplateText, undefined)
            : undefined,
        },
      };
    case 'workflow':
      return { workflow: { steps: parseJsonOr(v.workflowStepsText, []) } };
    default:
      return {};
  }
}

export default function ToolPage() {
  const { message, modal } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();
  const [form] = Form.useForm<ToolFormValues>();

  const [data, setData] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<ToolType | undefined>();
  const [statusFilter, setStatusFilter] = useState<ToolStatus | undefined>();
  const [riskFilter, setRiskFilter] = useState<ToolRiskLevel | undefined>();

  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Tool | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [formType, setFormType] = useState<ToolType>('query');

  const [detail, setDetail] = useState<ToolDetail | undefined>();
  const [detailLoading, setDetailLoading] = useState(false);

  const [testTarget, setTestTarget] = useState<Tool | undefined>();

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
      const res = await listTools({
        tenantId: activeTenantId,
        keyword,
        type: typeFilter,
        status: statusFilter,
        riskLevel: riskFilter,
        pageSize: 100,
      });
      setData(res.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载工具列表失败');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, keyword, typeFilter, statusFilter, riskFilter, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadConnectors = useCallback(async () => {
    if (!activeTenantId) return;
    try {
      const res = await listConnectors({ tenantId: activeTenantId, pageSize: 100 });
      setConnectors(res.items);
    } catch {
      setConnectors([]);
    }
  }, [activeTenantId]);

  const connectorOptions = useMemo(() => {
    const expected = TOOL_TYPE_CONNECTOR_TYPE[formType];
    return connectors
      .filter((c) => !expected || c.type === expected)
      .map((c) => ({ value: c.id, label: `${c.name}（${c.type}）` }));
  }, [connectors, formType]);

  const openCreate = () => {
    setEditing(undefined);
    setFormType('query');
    form.resetFields();
    form.setFieldsValue({
      type: 'query',
      riskLevel: 'low',
      needConfirmation: false,
      timeoutMs: 10000,
      inputSchemaText: DEFAULT_INPUT_SCHEMA,
      sqlMaxRows: 100,
      sqlMaxExecutionMs: 3000,
      sqlTableWhitelist: [],
      httpMethod: 'POST',
    });
    void loadConnectors();
    setDrawerOpen(true);
  };

  const openEdit = (t: Tool) => {
    setEditing(t);
    setFormType(t.type);
    form.resetFields();
    form.setFieldsValue({
      name: t.name,
      description: t.description ?? undefined,
      type: t.type,
      riskLevel: t.riskLevel,
      needConfirmation: t.needConfirmation,
      timeoutMs: t.timeoutMs,
      permissionScope: t.permissionScope ?? undefined,
      idempotencyKey: t.idempotencyKey ?? undefined,
      auditEventType: t.auditEventType ?? undefined,
      connectorId: t.connectorId ?? undefined,
      inputSchemaText: JSON.stringify(t.inputSchema ?? {}, null, 2),
      outputSchemaText: t.outputSchema
        ? JSON.stringify(t.outputSchema, null, 2)
        : undefined,
      sqlTableWhitelist: t.config.sql?.tableWhitelist ?? [],
      sqlFieldWhitelist: t.config.sql?.fieldWhitelist ?? [],
      sqlMaxRows: t.config.sql?.maxRows ?? 100,
      sqlMaxExecutionMs: t.config.sql?.maxExecutionMs ?? 3000,
      sqlTemplatesText: t.config.sql?.templates?.length
        ? JSON.stringify(t.config.sql.templates, null, 2)
        : undefined,
      httpMethod: t.config.http?.method ?? 'POST',
      httpPath: t.config.http?.path ?? undefined,
      httpHeadersText: t.config.http?.headers
        ? JSON.stringify(t.config.http.headers, null, 2)
        : undefined,
      httpBodyTemplateText:
        t.config.http?.bodyTemplate !== undefined
          ? JSON.stringify(t.config.http.bodyTemplate, null, 2)
          : undefined,
      workflowStepsText: t.config.workflow?.steps?.length
        ? JSON.stringify(t.config.workflow.steps, null, 2)
        : undefined,
    });
    void loadConnectors();
    setDrawerOpen(true);
  };

  const openDetail = async (t: Tool) => {
    setDetailLoading(true);
    try {
      setDetail(await getTool(t.id));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载工具详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!activeTenantId) {
      message.warning('请先在顶栏选择当前操作租户');
      return;
    }
    const v = await form.validateFields();

    let inputSchema: Record<string, unknown>;
    let outputSchema: Record<string, unknown> | undefined;
    let config: ToolConfig;
    try {
      inputSchema = JSON.parse(v.inputSchemaText) as Record<string, unknown>;
    } catch {
      message.error('inputSchema 不是合法 JSON');
      return;
    }
    try {
      outputSchema = v.outputSchemaText?.trim()
        ? (JSON.parse(v.outputSchemaText) as Record<string, unknown>)
        : undefined;
    } catch {
      message.error('outputSchema 不是合法 JSON');
      return;
    }
    try {
      config = buildConfig(v);
    } catch {
      message.error('类型配置（模板 / Headers / 步骤）不是合法 JSON');
      return;
    }

    setSubmitting(true);
    try {
      if (editing) {
        const payload: UpdateToolInput = {
          name: v.name,
          description: v.description,
          type: v.type,
          inputSchema,
          outputSchema,
          permissionScope: v.permissionScope,
          riskLevel: v.riskLevel,
          needConfirmation: v.needConfirmation,
          timeoutMs: v.timeoutMs,
          idempotencyKey: v.idempotencyKey,
          auditEventType: v.auditEventType,
          connectorId: v.connectorId ?? '',
          config,
        };
        await updateTool(editing.id, payload);
      } else {
        const payload: CreateToolInput = {
          tenantId: activeTenantId,
          name: v.name,
          description: v.description,
          type: v.type,
          inputSchema,
          outputSchema,
          permissionScope: v.permissionScope,
          riskLevel: v.riskLevel,
          needConfirmation: v.needConfirmation,
          timeoutMs: v.timeoutMs,
          idempotencyKey: v.idempotencyKey,
          auditEventType: v.auditEventType,
          connectorId: v.connectorId,
          config,
        };
        await createTool(payload);
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

  const handleToggleStatus = async (t: Tool, enabled: boolean) => {
    try {
      await updateToolStatus(t.id, enabled ? 'enabled' : 'disabled');
      message.success(enabled ? '已启用' : '已停用');
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '状态更新失败');
    }
  };

  const handleDelete = (t: Tool) => {
    modal.confirm({
      title: `确认删除工具「${t.name}」？`,
      content: '删除后已有工具调用审计记录将保留（断开关联）。',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteTool(t.id);
          message.success('已删除');
          void load();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  const columns: ColumnsType<Tool> = [
    {
      title: '工具名称',
      dataIndex: 'name',
      render: (v: string, row) => <a onClick={() => openDetail(row)}>{v}</a>,
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 100,
      render: (t: ToolType) => (
        <Tag color={TOOL_TYPE_META[t].color}>{TOOL_TYPE_META[t].label}</Tag>
      ),
    },
    {
      title: '风险',
      dataIndex: 'riskLevel',
      width: 80,
      render: (r: ToolRiskLevel) => (
        <Tag color={RISK_LEVEL_META[r].color}>{RISK_LEVEL_META[r].label}</Tag>
      ),
    },
    {
      title: '需确认',
      dataIndex: 'needConfirmation',
      width: 80,
      render: (b: boolean) =>
        b ? <Tag color="orange">是</Tag> : <Typography.Text type="secondary">否</Typography.Text>,
    },
    {
      title: '权限范围',
      dataIndex: 'permissionScope',
      width: 140,
      render: (v: string | null) => v || '—',
    },
    {
      title: '关联连接器',
      dataIndex: 'connector',
      width: 150,
      render: (c: Tool['connector']) =>
        c ? <Tag>{c.name}</Tag> : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: ToolStatus, row) => (
        <Switch
          checked={s === 'enabled'}
          checkedChildren="启用"
          unCheckedChildren="停用"
          onChange={(checked) => handleToggleStatus(row, checked)}
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, row) => (
        <Space size="small">
          <a onClick={() => setTestTarget(row)}>调用测试</a>
          <a onClick={() => openEdit(row)}>编辑</a>
          <a className="text-red-500" onClick={() => handleDelete(row)}>
            删除
          </a>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">
          工具管理
        </Typography.Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreate}
          disabled={!activeTenantId}
        >
          新建工具
        </Button>
      </div>

      {!activeTenantId ? (
        <Alert
          type="warning"
          showIcon
          message="请先在顶栏选择「当前操作租户」"
          description="工具按租户隔离注册，需选定租户后查看与维护其工具。"
        />
      ) : (
        <>
          <Alert
            className="mb-4"
            type="info"
            showIcon
            message={`当前租户：${activeTenantName ?? activeTenantId}`}
            description="V1 所有 Tool 必须经注册中心。四类工具：查询型（只读 SQL）、操作型 / 通知型（HTTP）、流程型（编排）。执行前统一走 Policy。"
          />
          <Space className="mb-4" wrap>
            <Input.Search
              allowClear
              placeholder="搜索名称 / 描述 / 权限范围"
              style={{ width: 260 }}
              onSearch={setKeyword}
            />
            <Select
              allowClear
              placeholder="类型"
              style={{ width: 130 }}
              options={TOOL_TYPE_OPTIONS}
              value={typeFilter}
              onChange={setTypeFilter}
            />
            <Select
              allowClear
              placeholder="风险等级"
              style={{ width: 120 }}
              options={RISK_LEVEL_OPTIONS}
              value={riskFilter}
              onChange={setRiskFilter}
            />
            <Select
              allowClear
              placeholder="状态"
              style={{ width: 120 }}
              options={[
                { value: 'enabled', label: '启用' },
                { value: 'disabled', label: '停用' },
              ]}
              value={statusFilter}
              onChange={setStatusFilter}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>
              刷新
            </Button>
          </Space>

          <Table<Tool>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data}
            pagination={false}
            locale={{ emptyText: <Empty description="该租户暂无工具" /> }}
          />
        </>
      )}

      <ToolFormDrawer
        open={drawerOpen}
        editing={editing}
        form={form}
        formType={formType}
        connectorOptions={connectorOptions}
        submitting={submitting}
        onTypeChange={setFormType}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
      />

      <Drawer
        title="工具详情"
        width={680}
        open={!!detail}
        loading={detailLoading}
        onClose={() => setDetail(undefined)}
        destroyOnClose
      >
        {detail && <ToolDetailView detail={detail} />}
      </Drawer>

      <ToolTestModal tool={testTarget} onClose={() => setTestTarget(undefined)} />
    </>
  );
}

// ── 新建 / 编辑抽屉 ───────────────────────────────────────

function ToolFormDrawer({
  open,
  editing,
  form,
  formType,
  connectorOptions,
  submitting,
  onTypeChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editing?: Tool;
  form: ReturnType<typeof Form.useForm<ToolFormValues>>[0];
  formType: ToolType;
  connectorOptions: { value: string; label: string }[];
  submitting: boolean;
  onTypeChange: (t: ToolType) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const expectedConnector = TOOL_TYPE_CONNECTOR_TYPE[formType];
  return (
    <Drawer
      title={editing ? '编辑工具' : '新建工具'}
      width={680}
      open={open}
      onClose={onClose}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={submitting} onClick={onSubmit}>
            保存
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="工具名称"
          name="name"
          rules={[{ required: true, message: '请输入工具名称' }]}
        >
          <Input placeholder="如：queryOrderByDate / createTicket" />
        </Form.Item>
        <Form.Item label="描述" name="description">
          <Input.TextArea rows={2} placeholder="工具用途说明" />
        </Form.Item>

        <Space className="flex" size="large" align="start">
          <Form.Item label="类型" name="type" rules={[{ required: true }]} style={{ width: 150 }}>
            <Select options={TOOL_TYPE_OPTIONS} onChange={onTypeChange} />
          </Form.Item>
          <Form.Item
            label="风险等级"
            name="riskLevel"
            rules={[{ required: true }]}
            style={{ width: 120 }}
          >
            <Select options={RISK_LEVEL_OPTIONS} />
          </Form.Item>
          <Form.Item
            label="超时（毫秒）"
            name="timeoutMs"
            rules={[{ required: true }]}
            style={{ width: 150 }}
          >
            <InputNumber min={100} max={600000} className="w-full" />
          </Form.Item>
          <Form.Item label="需人工确认" name="needConfirmation" valuePropName="checked">
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>
        </Space>

        <Space className="flex" size="large" align="start">
          <Form.Item
            label="权限范围"
            name="permissionScope"
            tooltip="如 order:read；配合角色 toolScopes 与连接器 allowedToolScopes 校验"
            style={{ width: 200 }}
          >
            <Input placeholder="order:read" />
          </Form.Item>
          <Form.Item label="幂等键模板" name="idempotencyKey" style={{ width: 200 }}>
            <Input placeholder="如 ${orderId}" />
          </Form.Item>
          <Form.Item label="审计事件类型" name="auditEventType" style={{ width: 200 }}>
            <Input placeholder="如 order.query" />
          </Form.Item>
        </Space>

        {formType !== 'workflow' && (
          <Form.Item
            label="关联连接器"
            name="connectorId"
            tooltip={
              expectedConnector
                ? `该类型应关联 ${expectedConnector} 连接器`
                : undefined
            }
          >
            <Select
              allowClear
              placeholder={
                connectorOptions.length ? '选择连接器' : '该租户暂无匹配类型的连接器'
              }
              options={connectorOptions}
            />
          </Form.Item>
        )}

        <Form.Item
          label="入参 Schema（JSON Schema）"
          name="inputSchemaText"
          rules={[{ required: true, message: '请输入入参 Schema' }]}
          tooltip="保存时校验是否为合法 JSON Schema，非法拒绝"
        >
          <Input.TextArea rows={6} className="font-mono text-xs" />
        </Form.Item>
        <Form.Item label="出参 Schema（JSON Schema，可选）" name="outputSchemaText">
          <Input.TextArea rows={4} className="font-mono text-xs" placeholder="可留空" />
        </Form.Item>

        {formType === 'query' && (
          <>
            <Typography.Title level={5}>SQL 查询工具配置</Typography.Title>
            <Form.Item
              label="表白名单"
              name="sqlTableWhitelist"
              rules={[{ required: true, message: '请配置至少一张允许访问的表' }]}
              tooltip="仅允许查询白名单内的表"
            >
              <Select mode="tags" allowClear placeholder="输入表名回车添加" />
            </Form.Item>
            <Form.Item label="字段白名单（可选）" name="sqlFieldWhitelist">
              <Select mode="tags" allowClear placeholder="table.field，回车添加（空=不限制）" />
            </Form.Item>
            <Space className="flex" size="large">
              <Form.Item
                label="最大返回行数"
                name="sqlMaxRows"
                rules={[{ required: true }]}
                style={{ width: 180 }}
              >
                <InputNumber min={1} max={100000} className="w-full" />
              </Form.Item>
              <Form.Item
                label="最大执行时长（毫秒）"
                name="sqlMaxExecutionMs"
                rules={[{ required: true }]}
                style={{ width: 200 }}
              >
                <InputNumber min={100} max={600000} className="w-full" />
              </Form.Item>
            </Space>
            <Form.Item
              label="SQL 模板（JSON 数组，可选）"
              name="sqlTemplatesText"
              tooltip='[{ "id":"t1", "name":"按日期", "sql":"SELECT id FROM orders WHERE dt=:dt" }]'
            >
              <Input.TextArea rows={4} className="font-mono text-xs" />
            </Form.Item>
          </>
        )}

        {(formType === 'action' || formType === 'notification') && (
          <>
            <Typography.Title level={5}>HTTP 调用配置</Typography.Title>
            <Space className="flex" size="large">
              <Form.Item label="方法" name="httpMethod" style={{ width: 130 }}>
                <Select
                  options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({
                    value: m,
                    label: m,
                  }))}
                />
              </Form.Item>
              <Form.Item label="路径（相对连接器 target）" name="httpPath" style={{ width: 360 }}>
                <Input placeholder="/api/orders" />
              </Form.Item>
            </Space>
            <Form.Item label="附加 Headers（JSON，可选）" name="httpHeadersText">
              <Input.TextArea rows={3} className="font-mono text-xs" placeholder='{"X-Biz":"a"}' />
            </Form.Item>
            <Form.Item
              label="请求体模板（JSON，可选）"
              name="httpBodyTemplateText"
              tooltip="留空则调用测试时以入参作为请求体"
            >
              <Input.TextArea rows={3} className="font-mono text-xs" />
            </Form.Item>
          </>
        )}

        {formType === 'workflow' && (
          <>
            <Typography.Title level={5}>流程编排</Typography.Title>
            <Alert
              className="mb-3"
              type="info"
              showIcon
              message="流程型工具的编排执行属于 12-Agent 运行时 / 13-四类能力，本阶段仅登记步骤定义。"
            />
            <Form.Item
              label="步骤（JSON 数组）"
              name="workflowStepsText"
              tooltip='[{ "name":"下单", "toolId":"<tool.id>", "description":"" }]'
            >
              <Input.TextArea rows={4} className="font-mono text-xs" />
            </Form.Item>
          </>
        )}
      </Form>
    </Drawer>
  );
}

// ── 详情视图 ──────────────────────────────────────────────

function ToolDetailView({ detail }: { detail: ToolDetail }) {
  const recentColumns: ColumnsType<ToolDetail['recentCalls'][number]> = [
    { title: '时间', dataIndex: 'createdAt', width: 160, render: (v: string) => fmt(v) },
    {
      title: '结果',
      dataIndex: 'status',
      width: 80,
      render: (s: string) => (
        <Tag color={s === 'success' ? 'green' : s === 'failed' ? 'red' : 'gold'}>{s}</Tag>
      ),
    },
    { title: '调用人', dataIndex: 'callerName', width: 100, render: (v: string | null) => v || '—' },
    {
      title: '耗时',
      dataIndex: 'durationMs',
      width: 80,
      render: (v: number | null) => (v != null ? `${v}ms` : '—'),
    },
    { title: '摘要', dataIndex: 'requestSummary', ellipsis: true, render: (v: string | null) => v || '—' },
  ];

  return (
    <>
      <Typography.Title level={5}>定义与约束</Typography.Title>
      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label="名称">{detail.name}</Descriptions.Item>
        <Descriptions.Item label="类型">
          <Tag color={TOOL_TYPE_META[detail.type].color}>{TOOL_TYPE_META[detail.type].label}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="风险等级">
          <Tag color={RISK_LEVEL_META[detail.riskLevel].color}>
            {RISK_LEVEL_META[detail.riskLevel].label}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="需人工确认">
          {detail.needConfirmation ? '是' : '否'}
        </Descriptions.Item>
        <Descriptions.Item label="权限范围">{detail.permissionScope || '—'}</Descriptions.Item>
        <Descriptions.Item label="超时">{detail.timeoutMs}ms</Descriptions.Item>
        <Descriptions.Item label="幂等键">{detail.idempotencyKey || '—'}</Descriptions.Item>
        <Descriptions.Item label="审计事件类型">{detail.auditEventType || '—'}</Descriptions.Item>
        <Descriptions.Item label="关联连接器">
          {detail.connector ? (
            <Tag>{`${detail.connector.name}（${detail.connector.type}）`}</Tag>
          ) : (
            '—'
          )}
        </Descriptions.Item>
        <Descriptions.Item label="描述">{detail.description || '—'}</Descriptions.Item>
      </Descriptions>

      <Typography.Title level={5} className="!mt-6">
        入参 / 出参 Schema
      </Typography.Title>
      <Typography.Text type="secondary" className="text-xs">
        inputSchema
      </Typography.Text>
      <pre className="m-0 whitespace-pre-wrap text-xs bg-gray-50 p-2 rounded">
        {JSON.stringify(detail.inputSchema, null, 2)}
      </pre>
      {detail.outputSchema && (
        <>
          <Typography.Text type="secondary" className="text-xs">
            outputSchema
          </Typography.Text>
          <pre className="m-0 whitespace-pre-wrap text-xs bg-gray-50 p-2 rounded">
            {JSON.stringify(detail.outputSchema, null, 2)}
          </pre>
        </>
      )}

      <Typography.Title level={5} className="!mt-6">
        类型配置
      </Typography.Title>
      <pre className="m-0 whitespace-pre-wrap text-xs bg-gray-50 p-2 rounded">
        {JSON.stringify(detail.config, null, 2)}
      </pre>

      <Typography.Title level={5} className="!mt-6">
        调用统计（工具调用审计）
      </Typography.Title>
      <Descriptions column={2} bordered size="small">
        <Descriptions.Item label="样本数">{detail.stats.sampleSize}</Descriptions.Item>
        <Descriptions.Item label="成功率">
          {(detail.stats.successRate * 100).toFixed(1)}%
        </Descriptions.Item>
        <Descriptions.Item label="失败率">
          {(detail.stats.failureRate * 100).toFixed(1)}%
        </Descriptions.Item>
        <Descriptions.Item label="平均耗时">
          {detail.stats.avgDurationMs != null ? `${detail.stats.avgDurationMs}ms` : '—'}
        </Descriptions.Item>
      </Descriptions>

      <Typography.Title level={5} className="!mt-6">
        最近调用
      </Typography.Title>
      <Table
        rowKey="id"
        size="small"
        columns={recentColumns}
        dataSource={detail.recentCalls}
        pagination={false}
        locale={{ emptyText: <Empty description="暂无调用记录" /> }}
      />
    </>
  );
}

// ── 调用测试弹窗 ──────────────────────────────────────────

function ToolTestModal({ tool, onClose }: { tool?: Tool; onClose: () => void }) {
  const { message } = App.useApp();
  const [paramsText, setParamsText] = useState('{}');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ToolTestResult | undefined>();

  useEffect(() => {
    if (tool) {
      setParamsText('{}');
      setResult(undefined);
    }
  }, [tool]);

  const run = async () => {
    if (!tool) return;
    let params: Record<string, unknown>;
    try {
      params = JSON.parse(paramsText) as Record<string, unknown>;
    } catch {
      message.error('测试参数不是合法 JSON');
      return;
    }
    setRunning(true);
    try {
      setResult(await testTool(tool.id, params));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '调用测试失败');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      title={tool ? `调用测试：${tool.name}` : '调用测试'}
      open={!!tool}
      onCancel={onClose}
      width={680}
      footer={[
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
        <Button
          key="run"
          type="primary"
          icon={<ThunderboltOutlined />}
          loading={running}
          onClick={run}
        >
          执行测试
        </Button>,
      ]}
    >
      <Alert
        className="mb-3"
        type="info"
        showIcon
        message="执行前先走 Policy；Policy 拒绝 / 需确认时不会发起外部调用。"
      />
      <Typography.Text type="secondary" className="text-xs">
        测试入参（JSON，按 inputSchema 校验）
      </Typography.Text>
      <Input.TextArea
        rows={4}
        className="font-mono text-xs"
        value={paramsText}
        onChange={(e) => setParamsText(e.target.value)}
      />
      {result && <ToolTestResultView result={result} />}
    </Modal>
  );
}
