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
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  EllipsisCell,
  renderEllipsisLink,
  renderOptionalText,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import {
  AUTH_TYPE_META,
  AUTH_TYPE_OPTIONS,
  AuthType,
  CONNECTOR_TYPE_META,
  DB_CONNECTOR_TYPE_OPTIONS,
  GENERAL_CONNECTOR_TYPE_OPTIONS,
  Connector,
  ConnectorDetail,
  ConnectorStatus,
  ConnectorType,
  CreateConnectorInput,
  TEST_STATUS_META,
  UpdateConnectorInput,
  createConnector,
  deleteConnector,
  formatDbTarget,
  getConnector,
  listConnectors,
  testConnector,
  updateConnector,
  updateConnectorStatus,
} from '@/lib/connector';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

interface ConnectorFormValues {
  name: string;
  type: ConnectorType;
  target: string;
  database?: string;
  authType: AuthType;
  timeoutMs: number;
  description?: string;
  propertiesText?: string;
  allowedToolScopes: string[];
  clearSecret?: boolean;
  // 凭证字段（按 authType 取用）
  username?: string;
  password?: string;
  token?: string;
  headerName?: string;
  apiKey?: string;
  customSecretText?: string;
}

function buildSecret(v: ConnectorFormValues): Record<string, string> | undefined {
  switch (v.authType) {
    case 'basic': {
      const s: Record<string, string> = {};
      if (v.username) s.username = v.username;
      if (v.password) s.password = v.password;
      return Object.keys(s).length ? s : undefined;
    }
    case 'bearer':
      return v.token ? { token: v.token } : undefined;
    case 'api_key': {
      const s: Record<string, string> = {};
      if (v.headerName) s.headerName = v.headerName;
      if (v.apiKey) s.apiKey = v.apiKey;
      return Object.keys(s).length ? s : undefined;
    }
    case 'custom': {
      if (!v.customSecretText?.trim()) return undefined;
      const parsed = JSON.parse(v.customSecretText) as Record<string, string>;
      return parsed;
    }
    case 'none':
    default:
      return undefined;
  }
}

function parseProperties(text?: string): Record<string, unknown> | undefined {
  if (!text?.trim()) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

export type ConnectorListVariant = 'general' | 'db';

const PAGE_COPY: Record<
  ConnectorListVariant,
  {
    section: string;
    title: string;
    createLabel: string;
    alert: string;
    empty: string;
  }
> = {
  general: {
    section: '连接器管理',
    title: '连接器列表',
    createLabel: '新建连接器',
    alert: 'HTTP API（操作/流程）与消息通知接口。凭证加密存储，详情仅脱敏展示。只读数据库连接请在「『查询型』配置 → 数据库连接器」维护。',
    empty: '该租户暂无 HTTP / 通知类连接器',
  },
  db: {
    section: '『查询型』配置',
    title: '数据库连接器',
    createLabel: '新建数据库连接器',
    alert: '只读数据库连接（host:port + 逻辑库名 + 只读账号）。表结构抽取与 ER 图发布请在「库表ER图」维护。',
    empty: '该租户暂无只读数据库连接器',
  },
};

export function ConnectorListPage({ variant }: { variant: ConnectorListVariant }) {
  const isDb = variant === 'db';
  const copy = PAGE_COPY[variant];
  const { message, modal } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();
  const [form] = Form.useForm<ConnectorFormValues>();

  const [data, setData] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<ConnectorType | undefined>();
  const [statusFilter, setStatusFilter] = useState<ConnectorStatus | undefined>();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Connector | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [authType, setAuthType] = useState<AuthType>('none');

  const [detail, setDetail] = useState<ConnectorDetail | undefined>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [testingId, setTestingId] = useState<string | undefined>();

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
      const res = await listConnectors({
        tenantId: activeTenantId,
        keyword,
        type: typeFilter,
        status: statusFilter,
        pageSize: 100,
      });
      setData(
        res.items.filter((c) => (isDb ? c.type === 'db_readonly' : c.type !== 'db_readonly')),
      );
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载连接器列表失败');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, keyword, typeFilter, statusFilter, message, isDb]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(undefined);
    setAuthType('none');
    form.resetFields();
    form.setFieldsValue({
      type: isDb ? 'db_readonly' : 'http',
      authType: isDb ? 'basic' : 'none',
      timeoutMs: 5000,
      allowedToolScopes: [],
    });
    setDrawerOpen(true);
  };

  const openEdit = (c: Connector) => {
    setEditing(c);
    const editAuthType = c.type === 'db_readonly' ? 'basic' : c.authType;
    setAuthType(editAuthType);
    form.resetFields();
    form.setFieldsValue({
      name: c.name,
      type: c.type,
      target: c.target,
      authType: editAuthType,
      timeoutMs: c.timeoutMs,
      description: c.description ?? undefined,
      database:
        c.type === 'db_readonly' && c.properties?.database
          ? String(c.properties.database)
          : undefined,
      propertiesText:
        c.properties && Object.keys(c.properties).length
          ? JSON.stringify(
              Object.fromEntries(
                Object.entries(c.properties).filter(([k]) => k !== 'database'),
              ),
              null,
              2,
            )
          : undefined,
      allowedToolScopes: c.allowedToolScopes ?? [],
      username:
        c.credentialHints?.username ??
        (typeof c.properties?.username === 'string' ? c.properties.username : undefined),
    });
    setDrawerOpen(true);
  };

  const openDetail = async (c: Connector) => {
    setDetailLoading(true);
    try {
      const d = await getConnector(c.id);
      setDetail(d);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载连接器详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!activeTenantId) {
      message.warning('请先在顶栏选择当前操作租户');
      return;
    }
    const values = await form.validateFields();
    let properties: Record<string, unknown> | undefined;
    let secret: Record<string, string> | undefined;
    try {
      properties = parseProperties(values.propertiesText);
      if (values.type === 'db_readonly') {
        if (!values.database?.trim()) {
          message.error('只读数据库连接器须填写逻辑库名');
          return;
        }
        properties = { ...properties, database: values.database.trim() };
        if (values.authType !== 'basic') {
          message.error('只读数据库连接器须使用 Basic 认证');
          return;
        }
        if (!values.username?.trim()) {
          message.error('请填写数据库用户名');
          return;
        }
        if (values.clearSecret) {
          message.error('只读数据库连接器不可清空凭证');
          return;
        }
        const needPassword = !editing?.hasSecret;
        if (needPassword && !values.password) {
          message.error('请填写数据库口令');
          return;
        }
      }
    } catch {
      message.error('附加配置不是合法 JSON');
      return;
    }
    try {
      secret = buildSecret(values);
    } catch {
      message.error('自定义凭证不是合法 JSON');
      return;
    }

    if (values.type === 'db_readonly') {
      values.authType = 'basic';
      if (!secret?.username?.trim() || (!editing?.hasSecret && !secret?.password)) {
        message.error('只读数据库连接器须填写用户名与口令');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (editing) {
        const payload: UpdateConnectorInput = {
          name: values.name,
          type: values.type,
          target: values.target,
          authType: values.type === 'db_readonly' ? 'basic' : values.authType,
          timeoutMs: values.timeoutMs,
          description: values.description,
          properties,
          allowedToolScopes: values.allowedToolScopes,
        };
        if (values.clearSecret) payload.clearSecret = true;
        else if (secret) payload.secret = secret;
        await updateConnector(editing.id, payload);
      } else {
        const payload: CreateConnectorInput = {
          tenantId: activeTenantId,
          name: values.name,
          type: values.type,
          target: values.target,
          authType: values.type === 'db_readonly' ? 'basic' : values.authType,
          timeoutMs: values.timeoutMs,
          description: values.description,
          properties,
          allowedToolScopes: values.allowedToolScopes,
          secret,
        };
        await createConnector(payload);
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

  const handleToggleStatus = async (c: Connector, enabled: boolean) => {
    try {
      await updateConnectorStatus(c.id, enabled ? 'enabled' : 'disabled');
      message.success(enabled ? '已启用' : '已停用');
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '状态更新失败');
    }
  };

  const handleDelete = (c: Connector) => {
    modal.confirm({
      title: '确认删除该连接器？',
      content: '删除后已有外部调用审计记录将保留（断开关联）。',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteConnector(c.id);
          message.success('已删除');
          void load();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  const handleTest = async (c: Connector) => {
    setTestingId(c.id);
    try {
      const res = await testConnector(c.id);
      if (res.ok) {
        message.success(`连通成功：${res.message}（${res.latencyMs}ms）`);
      } else {
        message.error(`连通失败：${res.message}（${res.latencyMs}ms）`);
      }
      void load();
      if (detail && detail.id === c.id) void openDetail(c);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '连通性测试失败');
    } finally {
      setTestingId(undefined);
    }
  };

  const columns: ColumnsType<Connector> = [
    withNowrap<Connector>({
      title: '连接器名称',
      dataIndex: 'name',
      width: 200,
      ellipsis: true,
      render: (v: string, row) => renderEllipsisLink(v, () => openDetail(row)),
    }),
    ...(!isDb
      ? [
          withNowrap<Connector>({
            title: '类型',
            dataIndex: 'type' as const,
            width: 120,
            render: (t: ConnectorType) => (
              <Tag color={CONNECTOR_TYPE_META[t].color}>{CONNECTOR_TYPE_META[t].label}</Tag>
            ),
          }),
        ]
      : []),
    withNowrap<Connector>({
      title: isDb ? '目标库' : '目标系统',
      dataIndex: 'target',
      width: 220,
      ellipsis: true,
      render: (_: string, row) => {
        const text = formatDbTarget(row);
        return (
          <EllipsisCell tooltip={text}>
            <Typography.Text className="text-xs">{text}</Typography.Text>
          </EllipsisCell>
        );
      },
    }),
    withNowrap<Connector>({
      title: '认证',
      dataIndex: 'authType',
      width: 110,
      render: (a: AuthType) => <Tag>{AUTH_TYPE_META[a].label}</Tag>,
    }),
    withNowrap<Connector>({
      title: '最近测试',
      dataIndex: 'lastTestStatus',
      width: 150,
      render: (s: Connector['lastTestStatus'], row) =>
        s ? (
          <Space size={4} className="flex-nowrap">
            <Tag className="shrink-0" color={TEST_STATUS_META[s].color}>
              {TEST_STATUS_META[s].label}
            </Tag>
            {row.lastTestLatencyMs != null && (
              <Typography.Text type="secondary" className="shrink-0 text-xs">
                {row.lastTestLatencyMs}ms
              </Typography.Text>
            )}
          </Space>
        ) : (
          <Typography.Text type="secondary">未测试</Typography.Text>
        ),
    }),
    withNowrap<Connector>({
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: ConnectorStatus, row) => (
        <Switch
          checked={s === 'enabled'}
          checkedChildren="启用"
          unCheckedChildren="停用"
          onChange={(checked) => handleToggleStatus(row, checked)}
        />
      ),
    }),
    withNowrap<Connector>({
      title: '操作',
      key: 'actions',
      width: 170,
      render: (_, row) => (
        <Space size="small">
          <a onClick={() => handleTest(row)}>
            {testingId === row.id ? '测试中…' : '测试'}
          </a>
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
        <div>
          <Typography.Text type="secondary" className="text-xs">
            {copy.section}
          </Typography.Text>
          <Typography.Title level={3} className="!mb-0">
            {copy.title}
          </Typography.Title>
        </div>
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
            disabled={!activeTenantId}
          >
            {copy.createLabel}
          </Button>
        </Space>
      </div>

      {!activeTenantId ? (
        <Alert
          type="warning"
          showIcon
          message="请先在顶栏选择「当前操作租户」"
          description="连接器按租户隔离配置，需选定租户后查看与维护其连接器。"
        />
      ) : (
        <>
          <Alert
            className="mb-4"
            type="info"
            showIcon
            message={`当前租户：${activeTenantName ?? activeTenantId}`}
            description={copy.alert}
          />
          <Space className="mb-4" wrap>
            <Input.Search
              allowClear
              placeholder="搜索名称 / 目标系统"
              style={{ width: 240 }}
              onSearch={setKeyword}
            />
            {!isDb && (
              <Select
                allowClear
                placeholder="连接类型"
                style={{ width: 150 }}
                options={GENERAL_CONNECTOR_TYPE_OPTIONS}
                value={typeFilter}
                onChange={setTypeFilter}
              />
            )}
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

          <Table<Connector>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data}
            pagination={false}
            locale={{ emptyText: <Empty description={copy.empty} /> }}
            {...tableEllipsisLayout}
          />
        </>
      )}

      <ConnectorFormDrawer
        variant={variant}
        open={drawerOpen}
        editing={editing}
        form={form}
        authType={authType}
        submitting={submitting}
        onAuthTypeChange={setAuthType}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
      />

      <Drawer
        title="连接器详情"
        width={620}
        open={!!detail}
        loading={detailLoading}
        onClose={() => setDetail(undefined)}
        destroyOnClose
        extra={
          detail && (
            <Button
              icon={<ThunderboltOutlined />}
              loading={testingId === detail.id}
              onClick={() => handleTest(detail)}
            >
              连通性测试
            </Button>
          )
        }
      >
        {detail && <ConnectorDetailView variant={variant} detail={detail} />}
      </Drawer>
    </>
  );
}

// ── 新建 / 编辑抽屉 ───────────────────────────────────────

function ConnectorFormDrawer({
  variant,
  open,
  editing,
  form,
  authType,
  submitting,
  onAuthTypeChange,
  onClose,
  onSubmit,
}: {
  variant: ConnectorListVariant;
  open: boolean;
  editing?: Connector;
  form: ReturnType<typeof Form.useForm<ConnectorFormValues>>[0];
  authType: AuthType;
  submitting: boolean;
  onAuthTypeChange: (a: AuthType) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const lockDbType = variant === 'db';
  const connectorType = Form.useWatch('type', form);
  const isDbReadonly = lockDbType || connectorType === 'db_readonly';
  const typeOptions = lockDbType ? DB_CONNECTOR_TYPE_OPTIONS : GENERAL_CONNECTOR_TYPE_OPTIONS;

  useEffect(() => {
    if (isDbReadonly) {
      form.setFieldsValue({ authType: 'basic' });
      onAuthTypeChange('basic');
    }
  }, [isDbReadonly, form, onAuthTypeChange]);

  return (
    <Drawer
      title={
        editing
          ? lockDbType
            ? '编辑数据库连接器'
            : '编辑连接器'
          : lockDbType
            ? '新建数据库连接器'
            : '新建连接器'
      }
      width={620}
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
          label="连接名称"
          name="name"
          rules={[{ required: true, message: '请输入连接名称' }]}
        >
          <Input placeholder="如：报表只读库 / 订单中心 API" />
        </Form.Item>
        <Space className="flex" size="large">
          {lockDbType ? (
            <Form.Item name="type" hidden initialValue="db_readonly">
              <Input />
            </Form.Item>
          ) : (
            <Form.Item
              label="连接类型"
              name="type"
              rules={[{ required: true }]}
              style={{ width: 200 }}
            >
              <Select options={typeOptions} />
            </Form.Item>
          )}
          <Form.Item
            label="超时（毫秒）"
            name="timeoutMs"
            rules={[{ required: true }]}
            style={{ width: 160 }}
          >
            <InputNumber min={100} max={120000} className="w-full" />
          </Form.Item>
        </Space>
        <Form.Item
          label="目标主机"
          name="target"
          rules={[{ required: true, message: '请输入目标地址' }]}
          tooltip="HTTP / 通知为 URL；只读数据库为 host:port（不含库名）"
        >
          <Input placeholder="https://api.example.com 或 db.internal:3306" />
        </Form.Item>

        {connectorType === 'db_readonly' && (
          <Form.Item
            label="逻辑库名 (database)"
            name="database"
            rules={[{ required: true, message: '只读库连接器必须指定逻辑库名' }]}
            tooltip="一连接器对应一个逻辑库，不可在执行层切换"
          >
            <Input placeholder="如 report、order_db" />
          </Form.Item>
        )}

        {isDbReadonly ? (
          <>
            <Form.Item name="authType" hidden>
              <Input />
            </Form.Item>
            <Alert
              className="mb-4"
              type="info"
              showIcon
              message="只读数据库须使用 Basic 认证"
              description="须填写只读库账号与口令（口令加密存储）；不支持无认证或其它认证方式。"
            />
            <Space className="flex" size="large">
              <Form.Item
                label="数据库用户名"
                name="username"
                rules={[{ required: true, message: '请填写数据库用户名' }]}
                style={{ width: 260 }}
              >
                <Input autoComplete="off" placeholder="只读账号" />
              </Form.Item>
              <Form.Item
                label="数据库口令"
                name="password"
                rules={[
                  {
                    required: !editing?.hasSecret,
                    message: '请填写数据库口令',
                  },
                ]}
                style={{ width: 260 }}
              >
                <Input.Password
                  autoComplete="new-password"
                  placeholder={editing?.hasSecret ? '留空则保留原口令' : '口令（加密存储）'}
                />
              </Form.Item>
            </Space>
          </>
        ) : (
          <Form.Item label="认证方式" name="authType" rules={[{ required: true }]}>
            <Select options={AUTH_TYPE_OPTIONS} onChange={onAuthTypeChange} />
          </Form.Item>
        )}

        {editing?.hasSecret && !isDbReadonly && (
          <Alert
            className="mb-4"
            type="info"
            showIcon
            message="已配置凭证（脱敏）"
            description="留空凭证字段则保留原凭证；如需更换请重新填写，或勾选下方「清空凭证」。"
          />
        )}

        {!isDbReadonly && authType === 'basic' && (
          <Space className="flex" size="large">
            <Form.Item label="用户名" name="username" style={{ width: 260 }}>
              <Input autoComplete="off" placeholder="账号" />
            </Form.Item>
            <Form.Item label="口令" name="password" style={{ width: 260 }}>
              <Input.Password autoComplete="new-password" placeholder="口令（加密存储）" />
            </Form.Item>
          </Space>
        )}
        {!isDbReadonly && authType === 'bearer' && (
          <Form.Item label="Token" name="token">
            <Input.Password autoComplete="new-password" placeholder="Bearer Token（加密存储）" />
          </Form.Item>
        )}
        {!isDbReadonly && authType === 'api_key' && (
          <Space className="flex" size="large">
            <Form.Item label="Header 名称" name="headerName" style={{ width: 220 }}>
              <Input placeholder="X-API-Key" />
            </Form.Item>
            <Form.Item label="API Key" name="apiKey" style={{ width: 300 }}>
              <Input.Password autoComplete="new-password" placeholder="密钥（加密存储）" />
            </Form.Item>
          </Space>
        )}
        {!isDbReadonly && authType === 'custom' && (
          <Form.Item
            label="自定义凭证（JSON）"
            name="customSecretText"
            tooltip='以 header. 前缀的键将作为请求头下发，如 {"header.X-Sign": "..."}'
          >
            <Input.TextArea rows={3} placeholder='{"header.X-Sign": "abc"}' />
          </Form.Item>
        )}

        {editing?.hasSecret && !isDbReadonly && (
          <Form.Item name="clearSecret" valuePropName="checked">
            <Switch checkedChildren="清空凭证" unCheckedChildren="保留凭证" />
          </Form.Item>
        )}

        <Form.Item
          label="附加配置（JSON，非敏感）"
          name="propertiesText"
          tooltip="如只读库的 database/username/sslMode；HTTP 的固定 header 等"
        >
          <Input.TextArea rows={3} placeholder='{"database": "report", "username": "readonly"}' />
        </Form.Item>
        <Form.Item
          label="可被引用的 Tool 范围"
          name="allowedToolScopes"
          tooltip="声明可引用本连接器的工具范围 key；07-工具管理 据此校验绑定"
        >
          <Select mode="tags" allowClear placeholder="输入范围 key，回车添加" />
        </Form.Item>
        <Form.Item label="描述" name="description">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}

// ── 详情视图 ──────────────────────────────────────────────

function ConnectorDetailView({
  variant,
  detail,
}: {
  variant: ConnectorListVariant;
  detail: ConnectorDetail;
}) {
  type RecentCall = ConnectorDetail['recentCalls'][number];
  const recentColumns: ColumnsType<RecentCall> = [
    withNowrap<RecentCall>({ title: '时间', dataIndex: 'createdAt', width: 170, render: (v: string) => fmt(v) }),
    withNowrap<RecentCall>({
      title: '结果',
      dataIndex: 'status',
      width: 80,
      render: (s: string) => (
        <Tag color={s === 'success' ? 'green' : s === 'failed' ? 'red' : 'gold'}>{s}</Tag>
      ),
    }),
    withNowrap<RecentCall>({
      title: '状态码',
      dataIndex: 'statusCode',
      width: 80,
      render: (v: number | null) => (v == null ? '—' : v),
    }),
    withNowrap<RecentCall>({
      title: '耗时',
      dataIndex: 'durationMs',
      width: 80,
      render: (v: number | null) => (v != null ? `${v}ms` : '—'),
    }),
    withNowrap<RecentCall>({
      title: '错误',
      dataIndex: 'errorMessage',
      ellipsis: true,
      render: (v: string | null) => renderOptionalText(v),
    }),
  ];

  return (
    <>
      <Typography.Title level={5}>配置摘要</Typography.Title>
      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label="名称">{detail.name}</Descriptions.Item>
        <Descriptions.Item label="类型">
          <Tag color={CONNECTOR_TYPE_META[detail.type].color}>
            {CONNECTOR_TYPE_META[detail.type].label}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="目标系统">{formatDbTarget(detail)}</Descriptions.Item>
        <Descriptions.Item label="认证方式">
          {AUTH_TYPE_META[detail.authType].label}
        </Descriptions.Item>
        <Descriptions.Item label="凭证">
          {detail.hasSecret ? (
            <Space wrap>
              {Object.keys(detail.secretMask).map((k) => (
                <Tag key={k}>
                  {k}: {detail.secretMask[k]}
                </Tag>
              ))}
            </Space>
          ) : (
            <Typography.Text type="secondary">未配置凭证</Typography.Text>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="超时">{detail.timeoutMs}ms</Descriptions.Item>
        <Descriptions.Item label="状态">
          <Tag color={detail.status === 'enabled' ? 'green' : 'default'}>
            {detail.status === 'enabled' ? '启用' : '停用'}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="可引用 Tool 范围">
          {detail.allowedToolScopes.length ? (
            <Space wrap>
              {detail.allowedToolScopes.map((s) => (
                <Tag key={s}>{s}</Tag>
              ))}
            </Space>
          ) : (
            '—'
          )}
        </Descriptions.Item>
        <Descriptions.Item label="附加配置">
          {detail.properties && Object.keys(detail.properties).length ? (
            <pre className="m-0 whitespace-pre-wrap text-xs">
              {JSON.stringify(detail.properties, null, 2)}
            </pre>
          ) : (
            '—'
          )}
        </Descriptions.Item>
        <Descriptions.Item label="描述">{detail.description || '—'}</Descriptions.Item>
      </Descriptions>

      <Typography.Title level={5} className="!mt-6">
        关联 Tool
      </Typography.Title>
      {detail.relatedTools.length ? (
        <Space wrap>
          {detail.relatedTools.map((t) => (
            <Tag key={t.id}>{t.name}</Tag>
          ))}
        </Space>
      ) : (
        <Typography.Paragraph type="secondary" className="text-xs">
          暂无关联 Tool（07-工具管理 就绪后按可引用范围反查）。
        </Typography.Paragraph>
      )}

      <Typography.Title level={5} className="!mt-6">
        最近调用统计（外部接口审计）
      </Typography.Title>
      <Descriptions column={2} bordered size="small">
        <Descriptions.Item label="样本数">{detail.stats.sampleSize}</Descriptions.Item>
        <Descriptions.Item label="失败率">
          {(detail.stats.failureRate * 100).toFixed(1)}%
        </Descriptions.Item>
        <Descriptions.Item label="平均耗时">
          {detail.stats.avgDurationMs != null ? `${detail.stats.avgDurationMs}ms` : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="超时次数">{detail.stats.timeoutCount}</Descriptions.Item>
      </Descriptions>
      {detail.lastTestStatus && (
        <Alert
          className="mt-3"
          type={detail.lastTestStatus === 'success' ? 'success' : 'error'}
          showIcon
          message={`最近测试：${TEST_STATUS_META[detail.lastTestStatus].label}（${
            detail.lastTestLatencyMs ?? '—'
          }ms）`}
          description={`${detail.lastTestMessage ?? ''}｜${fmt(detail.lastTestedAt)}`}
        />
      )}

      <Typography.Title level={5} className="!mt-6">
        最近调用日志
      </Typography.Title>
      <Table
        rowKey="id"
        size="small"
        columns={recentColumns}
        dataSource={detail.recentCalls}
        pagination={false}
        locale={{ emptyText: <Empty description="暂无外部调用记录" /> }}
        {...tableEllipsisLayout}
      />

      {variant === 'db' && detail.type === 'db_readonly' && (
        <Alert
          className="mt-4"
          type="info"
          showIcon
          message="库表 ER 图"
          description={
            <>
              表结构抽取、LLM 生成 ER 图与发布请在「库表ER图」维护。{' '}
              <Link to={`/query/db-er?connectorId=${detail.id}`}>前往库表ER图</Link>
              {!detail.lastTestStatus || detail.lastTestStatus === 'failed' ? (
                <span className="text-orange-600"> · 建议先完成连通性测试</span>
              ) : null}
            </>
          }
        />
      )}
    </>
  );
}

export default function ConnectorPage() {
  return <ConnectorListPage variant="general" />;
}
