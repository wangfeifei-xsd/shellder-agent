'use client';

import { PlusOutlined, ReloadOutlined, ThunderboltOutlined, FormOutlined, RobotOutlined } from '@ant-design/icons';
import {
  Empty,
  Alert,
  App,
  Button,
  Descriptions,
  Drawer,
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
  HttpQueryParameter,
  HttpQueryToolConfig,
  ParseSignalResult,
  RISK_LEVEL_OPTIONS,
  Tool,
  ToolDetail,
  ToolStatus,
  ToolTestResult,
  createTool,
  deleteTool,
  getTool,
  invokeTool,
  listHttpQueryTools,
  parametersToInputSchema,
  parseHttpQuerySignal,
  polishHttpQueryDraft,
  updateTool,
  updateToolStatus,
} from '@/lib/tool';
import { HTTP_QUERY_PRESET } from './http-query-preset';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

interface HttpQueryFormValues {
  name: string;
  description?: string;
  toolCode: string;
  intentTags?: string[];
  priority?: number;
  riskLevel: 'low' | 'medium' | 'high';
  needConfirmation: boolean;
  timeoutMs: number;
  permissionScope?: string;
  connectorId?: string;
  parametersText: string;
  invokeMethod: 'GET' | 'POST';
  invokePath: string;
  queryMappingText?: string;
  bodyMappingText?: string;
  invokeTimeoutMs?: number;
  responseType?: 'text_reply' | 'json_data' | 'play_audio';
  successPath?: string;
  successValue?: string;
  fieldMappingText?: string;
  replyTextPath?: string;
}

function parseJsonObject(text?: string): Record<string, string> | undefined {
  if (!text?.trim()) return undefined;
  return JSON.parse(text) as Record<string, string>;
}

function buildHttpQueryConfig(v: HttpQueryFormValues): HttpQueryToolConfig {
  const parameters: HttpQueryParameter[] = JSON.parse(v.parametersText || '[]');
  return {
    toolCode: v.toolCode.trim(),
    intentTags: v.intentTags,
    priority: v.priority,
    parameters,
    invoke: {
      method: v.invokeMethod,
      path: v.invokePath.trim(),
      queryMapping: parseJsonObject(v.queryMappingText),
      bodyMapping: parseJsonObject(v.bodyMappingText),
      timeoutMs: v.invokeTimeoutMs,
    },
    response: {
      type: v.responseType,
      successPath: v.successPath || undefined,
      successValue: v.successValue || undefined,
      fieldMapping: parseJsonObject(v.fieldMappingText),
      replyTextPath: v.replyTextPath || undefined,
    },
  };
}

function formFromTool(tool: Tool): Partial<HttpQueryFormValues> {
  const hq = tool.config.httpQuery;
  return {
    name: tool.name,
    description: tool.description ?? undefined,
    toolCode: hq?.toolCode ?? '',
    intentTags: hq?.intentTags,
    priority: hq?.priority,
    riskLevel: tool.riskLevel,
    needConfirmation: tool.needConfirmation,
    timeoutMs: tool.timeoutMs,
    permissionScope: tool.permissionScope ?? undefined,
    connectorId: tool.connectorId ?? undefined,
    parametersText: JSON.stringify(hq?.parameters ?? [], null, 2),
    invokeMethod: hq?.invoke.method ?? 'GET',
    invokePath: hq?.invoke.path ?? '',
    queryMappingText: hq?.invoke.queryMapping
      ? JSON.stringify(hq.invoke.queryMapping, null, 2)
      : '',
    bodyMappingText: hq?.invoke.bodyMapping ? JSON.stringify(hq.invoke.bodyMapping, null, 2) : '',
    invokeTimeoutMs: hq?.invoke.timeoutMs,
    responseType: hq?.response.type,
    successPath: hq?.response.successPath,
    successValue: hq?.response.successValue != null ? String(hq.response.successValue) : undefined,
    fieldMappingText: hq?.response.fieldMapping
      ? JSON.stringify(hq.response.fieldMapping, null, 2)
      : '',
    replyTextPath: hq?.response.replyTextPath,
  };
}

export default function HttpQueryToolPage() {
  const { message, modal } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();
  const [form] = Form.useForm<HttpQueryFormValues>();

  const [data, setData] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Tool | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<ToolDetail | undefined>();
  const [testTarget, setTestTarget] = useState<Tool | undefined>();
  const [testParamsText, setTestParamsText] = useState('{}');
  const [testResult, setTestResult] = useState<ToolTestResult | undefined>();
  const [testLoading, setTestLoading] = useState(false);
  const [signalText, setSignalText] = useState('[查询工具:music_search_v1 {"keyword":"test"}]');
  const [signalResult, setSignalResult] = useState<ParseSignalResult | undefined>();
  const [polishOpen, setPolishOpen] = useState(false);
  const [polishHint, setPolishHint] = useState('');
  const [polishing, setPolishing] = useState(false);

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
      const res = await listHttpQueryTools({ tenantId: activeTenantId, keyword, pageSize: 100 });
      setData(res.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, keyword, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadConnectors = useCallback(async () => {
    if (!activeTenantId) return;
    try {
      const res = await listConnectors({ tenantId: activeTenantId, pageSize: 100 });
      setConnectors(res.items.filter((c) => c.type === 'http'));
    } catch {
      setConnectors([]);
    }
  }, [activeTenantId]);

  const connectorOptions = useMemo(
    () => connectors.map((c) => ({ value: c.id, label: `${c.name}（${c.target}）` })),
    [connectors],
  );

  const applyPreset = useCallback(
    () => {
      const apply = () => {
        form.setFieldsValue({ ...HTTP_QUERY_PRESET });
        message.success('已填入演示预制（music_sing_v1），请绑定 HTTP 连接器后保存');
      };
      const current = form.getFieldsValue();
      const hasContent = Boolean(
        current.name?.trim() ||
          current.toolCode?.trim() ||
          current.description?.trim(),
      );
      if (hasContent) {
        modal.confirm({
          title: '覆盖当前表单？',
          content: '添入预制将替换名称、参数与 invoke/response 映射等字段。',
          onOk: apply,
        });
      } else {
        apply();
      }
    },
    [form, message, modal],
  );

  const openCreate = () => {
    setEditing(undefined);
    form.resetFields();
    form.setFieldsValue({ ...HTTP_QUERY_PRESET });
    void loadConnectors();
    setDrawerOpen(true);
  };

  const openEdit = (tool: Tool) => {
    setEditing(tool);
    form.setFieldsValue(formFromTool(tool));
    void loadConnectors();
    setDrawerOpen(true);
  };

  const handleSubmit = async () => {
    if (!activeTenantId) return;
    try {
      const v = await form.validateFields();
      const httpQuery = buildHttpQueryConfig(v);
      const parameters = JSON.parse(v.parametersText || '[]') as HttpQueryParameter[];
      const inputSchema = parametersToInputSchema(parameters);
      setSubmitting(true);

      const payload = {
        name: v.name,
        description: v.description,
        type: 'http_query' as const,
        inputSchema,
        permissionScope: v.permissionScope,
        riskLevel: v.riskLevel,
        needConfirmation: v.needConfirmation,
        timeoutMs: v.timeoutMs,
        connectorId: v.connectorId,
        config: { httpQuery },
      };

      if (editing) {
        await updateTool(editing.id, payload);
        message.success('已更新');
      } else {
        await createTool({ ...payload, tenantId: activeTenantId } as CreateToolInput);
        message.success('已创建');
      }
      setDrawerOpen(false);
      void load();
    } catch (err) {
      if (err instanceof Error) message.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (tool: Tool) => {
    modal.confirm({
      title: `删除「${tool.name}」？`,
      onOk: async () => {
        await deleteTool(tool.id);
        message.success('已删除');
        void load();
      },
    });
  };

  const toggleStatus = async (tool: Tool) => {
    const next: ToolStatus = tool.status === 'enabled' ? 'disabled' : 'enabled';
    await updateToolStatus(tool.id, next);
    message.success(next === 'enabled' ? '已启用' : '已停用');
    void load();
  };

  const openDetail = async (tool: Tool) => {
    try {
      setDetail(await getTool(tool.id));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载详情失败');
    }
  };

  const runInvoke = async () => {
    if (!testTarget) return;
    try {
      const params = JSON.parse(testParamsText || '{}') as Record<string, unknown>;
      setTestLoading(true);
      setTestResult(await invokeTool(testTarget.id, params));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '调用失败');
    } finally {
      setTestLoading(false);
    }
  };

  const runParseSignal = async () => {
    try {
      setSignalResult(await parseHttpQuerySignal(signalText));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '解析失败');
    }
  };

  const runAiPolish = async () => {
    if (!activeTenantId) {
      message.warning('请先选择租户');
      return;
    }
    setPolishing(true);
    try {
      const draft = form.getFieldsValue(true) as Record<string, unknown>;
      const result = await polishHttpQueryDraft(activeTenantId, draft, polishHint.trim() || undefined);
      form.setFieldsValue(result.draft as Partial<HttpQueryFormValues>);
      setPolishOpen(false);
      setPolishHint('');
      message.success(`AI 润色完成：${result.rationale}`);
      if (result.warnings?.length) {
        message.warning(result.warnings.join('；'));
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'AI 润色失败');
    } finally {
      setPolishing(false);
    }
  };

  const columns: ColumnsType<Tool> = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: 'toolCode',
      key: 'toolCode',
      render: (_, r) => r.config.httpQuery?.toolCode ?? '—',
    },
    {
      title: '连接器',
      key: 'connector',
      render: (_, r) => r.connector?.name ?? '—',
    },
    {
      title: '方法 / 路径',
      key: 'invoke',
      render: (_, r) => {
        const inv = r.config.httpQuery?.invoke;
        return inv ? `${inv.method} ${inv.path}` : '—';
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (s: ToolStatus) => (
        <Tag color={s === 'enabled' ? 'green' : 'default'}>{s === 'enabled' ? '启用' : '停用'}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, r) => (
        <Space wrap>
          <Button type="link" size="small" onClick={() => openDetail(r)}>
            详情
          </Button>
          <Button type="link" size="small" onClick={() => openEdit(r)}>
            编辑
          </Button>
          <Button type="link" size="small" onClick={() => toggleStatus(r)}>
            {r.status === 'enabled' ? '停用' : '启用'}
          </Button>
          <Button
            type="link"
            size="small"
            icon={<ThunderboltOutlined />}
            onClick={() => {
              setTestTarget(r);
              setTestResult(undefined);
              setTestParamsText('{}');
            }}
          >
            调用
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(r)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="p-6">
      <Typography.Title level={4}>查询工具（HTTP 业务查询）</Typography.Title>
      <Typography.Paragraph type="secondary">
        配置外部 HTTP 只读查询接口；Runtime 归属 action 能力，支持路由或 LLM 信号{' '}
        <Typography.Text code>[查询工具:tool_code {'{...}'}]</Typography.Text>
      </Typography.Paragraph>

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
            description="HTTP 业务查询 Tool 按租户隔离注册，须绑定 HTTP 连接器；Runtime 归属 action 能力，支持能力路由或 LLM 信号 [查询工具:tool_code {...}]。执行前统一走 Policy。"
          />

          <Space className="mb-4" wrap>
            <Input.Search
              placeholder="搜索名称 / 描述"
              allowClear
              style={{ width: 240 }}
              onSearch={setKeyword}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建查询工具
            </Button>
          </Space>

          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data}
            pagination={false}
            locale={{ emptyText: <Empty description="该租户暂无 HTTP 查询工具" /> }}
          />

          <Typography.Title level={5} className="mt-8">
            信号解析调试
          </Typography.Title>
          <Input.TextArea
            rows={2}
            value={signalText}
            onChange={(e) => setSignalText(e.target.value)}
            className="font-mono text-xs mb-2"
          />
          <Button onClick={() => void runParseSignal()}>parse-signal</Button>
          {signalResult && (
            <pre className="text-xs bg-gray-50 p-3 rounded mt-2">
              {JSON.stringify(signalResult, null, 2)}
            </pre>
          )}
        </>
      )}

      <Drawer
        title={editing ? '编辑 HTTP 查询工具' : '新建 HTTP 查询工具'}
        width={720}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
        extra={
          <Space wrap>
            <Button icon={<FormOutlined />} onClick={() => applyPreset()}>
              添入预制
            </Button>
            <Button
              icon={<RobotOutlined />}
              disabled={!activeTenantId}
              onClick={() => setPolishOpen(true)}
            >
              AI 润色
            </Button>
            <Button type="primary" loading={submitting} onClick={() => void handleSubmit()}>
              保存
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Typography.Title level={5}>基本信息</Typography.Title>
          <Form.Item label="名称" name="name" rules={[{ required: true }]}>
            <Input placeholder="如：歌曲搜索" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            label="toolCode"
            name="toolCode"
            rules={[{ required: true, pattern: /^[a-z][a-z0-9_]*$/, message: '小写字母开头' }]}
            tooltip="供 Prompt / 信号引用，如 music_search_v1"
          >
            <Input placeholder="music_search_v1" />
          </Form.Item>
          <Space className="flex" align="start" wrap>
            <Form.Item label="intentTags" name="intentTags">
              <Select mode="tags" placeholder="意图标签" style={{ width: 220 }} />
            </Form.Item>
            <Form.Item label="priority" name="priority">
              <InputNumber style={{ width: 100 }} />
            </Form.Item>
            <Form.Item label="风险等级" name="riskLevel" rules={[{ required: true }]}>
              <Select options={RISK_LEVEL_OPTIONS} style={{ width: 100 }} />
            </Form.Item>
            <Form.Item label="需确认" name="needConfirmation" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
          <Form.Item label="关联 HTTP 连接器" name="connectorId">
            <Select allowClear options={connectorOptions} placeholder="选择 http 连接器" />
          </Form.Item>

          <Typography.Title level={5}>入参 parameters</Typography.Title>
          <Form.Item
            label="parameters（JSON 数组）"
            name="parametersText"
            rules={[{ required: true }]}
            tooltip='[{"name":"keyword","type":"string","required":true}]'
          >
            <Input.TextArea rows={6} className="font-mono text-xs" />
          </Form.Item>

          <Typography.Title level={5}>调用配置 invoke</Typography.Title>
          <Space align="start">
            <Form.Item label="method" name="invokeMethod" rules={[{ required: true }]}>
              <Select options={[{ value: 'GET' }, { value: 'POST' }]} style={{ width: 100 }} />
            </Form.Item>
            <Form.Item label="path" name="invokePath" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input placeholder="/api/search" style={{ width: 360 }} />
            </Form.Item>
            <Form.Item label="timeoutMs" name="invokeTimeoutMs">
              <InputNumber min={100} style={{ width: 120 }} />
            </Form.Item>
          </Space>
          <Form.Item label="queryMapping（JSON）" name="queryMappingText">
            <Input.TextArea rows={3} className="font-mono text-xs" placeholder='{"q":"keyword"}' />
          </Form.Item>
          <Form.Item label="bodyMapping（JSON）" name="bodyMappingText">
            <Input.TextArea rows={3} className="font-mono text-xs" />
          </Form.Item>

          <Typography.Title level={5}>响应映射 response</Typography.Title>
          <Form.Item label="type" name="responseType">
            <Select
              allowClear
              options={[
                { value: 'json_data', label: 'json_data' },
                { value: 'text_reply', label: 'text_reply' },
                { value: 'play_audio', label: 'play_audio' },
              ]}
              style={{ width: 160 }}
            />
          </Form.Item>
          <Form.Item label="successPath" name="successPath">
            <Input placeholder="$.code" />
          </Form.Item>
          <Form.Item label="successValue" name="successValue">
            <Input placeholder="0" />
          </Form.Item>
          <Form.Item label="fieldMapping（JSON）" name="fieldMappingText">
            <Input.TextArea rows={3} className="font-mono text-xs" />
          </Form.Item>
          <Form.Item label="replyTextPath" name="replyTextPath">
            <Input placeholder="$.data.text" />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        title={detail ? `详情：${detail.name}` : '详情'}
        open={!!detail}
        onCancel={() => setDetail(undefined)}
        footer={null}
        width={720}
      >
        {detail && (
          <>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="toolCode">{detail.config.httpQuery?.toolCode}</Descriptions.Item>
              <Descriptions.Item label="租户">{activeTenantName}</Descriptions.Item>
              <Descriptions.Item label="连接器">{detail.connector?.name ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{fmt(detail.updatedAt)}</Descriptions.Item>
            </Descriptions>
            <Typography.Title level={5} className="mt-4">
              配置
            </Typography.Title>
            <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-64">
              {JSON.stringify(detail.config.httpQuery, null, 2)}
            </pre>
          </>
        )}
      </Modal>

      <Modal
        title={testTarget ? `调用测试：${testTarget.name}` : '调用测试'}
        open={!!testTarget}
        onCancel={() => setTestTarget(undefined)}
        footer={null}
        width={800}
      >
        <Form layout="vertical">
          <Form.Item label="入参 params（JSON）">
            <Input.TextArea
              rows={4}
              className="font-mono text-xs"
              value={testParamsText}
              onChange={(e) => setTestParamsText(e.target.value)}
            />
          </Form.Item>
          <Button type="primary" loading={testLoading} onClick={() => void runInvoke()}>
            发起 invoke
          </Button>
        </Form>
        {testResult && <ToolTestResultView result={testResult} />}
      </Modal>

      <Modal
        title="AI 润色 HTTP 查询工具"
        open={polishOpen}
        onCancel={() => {
          if (!polishing) {
            setPolishOpen(false);
            setPolishHint('');
          }
        }}
        onOk={() => void runAiPolish()}
        confirmLoading={polishing}
        okText="开始润色"
      >
        <Typography.Paragraph type="secondary">
          将根据当前表单内容与平台 LLM 补全/润色名称、描述、intentTags、parameters 与 invoke/response
          映射；不会自动保存。
        </Typography.Paragraph>
        <Form layout="vertical">
          <Form.Item label="润色说明（可选）">
            <Input.TextArea
              rows={3}
              value={polishHint}
              onChange={(e) => setPolishHint(e.target.value)}
              placeholder="例如：改为订单查询场景，入参 orderId"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
