'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import {
  EllipsisCell,
  ellipsisTextColumn,
  renderOptionalText,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import { apiFetch } from '@/lib/api';
import { listOpenApiApps, type OpenApiAppItem } from '@/lib/openapi-management';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';

const { Title } = Typography;

interface CopilotConfigItem {
  id: string;
  tenantId: string;
  appId: string;
  name: string;
  status: 'enabled' | 'disabled';
  domainWhitelist: string[];
  features: Record<string, boolean>;
  welcomeMessage: string | null;
  placeholder: string | null;
  maxHistoryMessages: number;
  tokenTtlSeconds: number;
  createdAt: string;
  app?: { id: string; name: string; clientId: string; status: string };
}

export default function CopilotAdminPage() {
  const { activeTenantId, tenants: boundTenants } = useActiveTenant();
  const activeTenantLabel = useMemo(() => {
    const t = boundTenants.find((x) => x.id === activeTenantId);
    return t ? `${t.name}（${t.code}）` : activeTenantId ?? '—';
  }, [boundTenants, activeTenantId]);
  const [configs, setConfigs] = useState<CopilotConfigItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openapiApps, setOpenapiApps] = useState<OpenApiAppItem[]>([]);
  const [form] = Form.useForm();

  const usedAppIds = useMemo(() => new Set(configs.map((c) => c.appId)), [configs]);

  const appOptions = useMemo(() => {
    if (!activeTenantId) return [];
    return openapiApps
      .filter((a) => !usedAppIds.has(a.id))
      .map((a) => ({
        value: a.id,
        label: `${a.name}（${a.clientId}）`,
      }));
  }, [activeTenantId, openapiApps, usedAppIds]);

  const loadOpenapiApps = useCallback(async () => {
    if (!activeTenantId) {
      setOpenapiApps([]);
      return;
    }
    try {
      const res = await listOpenApiApps({
        pageSize: 200,
        status: 'enabled',
        tenantId: activeTenantId,
      });
      setOpenapiApps(res.items);
    } catch {
      setOpenapiApps([]);
    }
  }, [activeTenantId]);

  const load = useCallback(async () => {
    if (!activeTenantId) {
      setConfigs([]);
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<CopilotConfigItem[]>('/api/v1/copilot/configs', {
        query: { tenantId: activeTenantId },
      });
      setConfigs(data);
    } catch (e: any) {
      message.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadOpenapiApps();
  }, [loadOpenapiApps]);

  useEffect(() => {
    if (!modalOpen || editingId) return;
    form.setFieldValue('appId', undefined);
  }, [activeTenantId, modalOpen, editingId, form]);

  const handleCreate = () => {
    if (!activeTenantId) {
      message.warning('请先在顶栏选择「当前操作租户」');
      return;
    }
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({
      maxHistoryMessages: 50,
      tokenTtlSeconds: 3600,
      enableHistory: true,
      enableTask: true,
      enableConfirmation: true,
    });
    setModalOpen(true);
  };

  const handleEdit = (record: CopilotConfigItem) => {
    setEditingId(record.id);
    form.setFieldsValue({
      ...record,
      domainWhitelist: (record.domainWhitelist ?? []).join('\n'),
      enableHistory: record.features?.enableHistory ?? true,
      enableTask: record.features?.enableTask ?? true,
      enableConfirmation: record.features?.enableConfirmation ?? true,
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: '确认删除此 Copilot 配置？',
      onOk: async () => {
        await apiFetch(`/api/v1/copilot/configs/${id}`, { method: 'DELETE' });
        message.success('已删除');
        load();
      },
    });
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (!editingId && !activeTenantId) {
      message.warning('请先在顶栏选择「当前操作租户」');
      return;
    }
    const shared = {
      name: values.name,
      domainWhitelist: values.domainWhitelist
        ? values.domainWhitelist.split('\n').map((s: string) => s.trim()).filter(Boolean)
        : [],
      features: {
        enableHistory: values.enableHistory ?? true,
        enableTask: values.enableTask ?? true,
        enableConfirmation: values.enableConfirmation ?? true,
      },
      welcomeMessage: values.welcomeMessage || null,
      placeholder: values.placeholder || null,
      maxHistoryMessages: values.maxHistoryMessages,
      tokenTtlSeconds: values.tokenTtlSeconds,
    };

    try {
      if (editingId) {
        await apiFetch(`/api/v1/copilot/configs/${editingId}`, {
          method: 'PATCH',
          body: shared,
        });
        message.success('已更新');
      } else {
        await apiFetch('/api/v1/copilot/configs', {
          method: 'POST',
          body: {
            ...shared,
            tenantId: activeTenantId,
            appId: values.appId,
          },
        });
        message.success('已创建');
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      message.error(e.message ?? '操作失败');
    }
  };

  const columns = [
    ellipsisTextColumn<CopilotConfigItem>('配置名称', 'name', 160),
    withNowrap<CopilotConfigItem>({
      title: '关联应用',
      key: 'app',
      render: (_: unknown, r: CopilotConfigItem) => {
        const text = r.app?.name ?? r.appId;
        return <EllipsisCell tooltip={text}>{text}</EllipsisCell>;
      },
    }),
    withNowrap<CopilotConfigItem>({
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (s: string) => (
        <Tag color={s === 'enabled' ? 'success' : 'default'}>{s === 'enabled' ? '启用' : '禁用'}</Tag>
      ),
    }),
    withNowrap<CopilotConfigItem>({
      title: '域名白名单',
      key: 'domains',
      ellipsis: true,
      render: (_: unknown, r: CopilotConfigItem) => {
        const domains = (r.domainWhitelist ?? []) as string[];
        const text =
          domains.length > 0
            ? domains.slice(0, 2).join(', ') + (domains.length > 2 ? '…' : '')
            : '';
        return renderOptionalText(text || undefined);
      },
    }),
    withNowrap<CopilotConfigItem>({
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    }),
    withNowrap<CopilotConfigItem>({
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: unknown, record: CopilotConfigItem) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)}>
            删除
          </Button>
        </Space>
      ),
    }),
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Title level={4} className="!mb-0">
          嵌入式 Copilot 配置
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新建配置
        </Button>
      </div>

      <Card>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={configs}
          columns={columns}
          pagination={false}
          {...tableEllipsisLayout}
        />
      </Card>

      <Modal
        title={editingId ? '编辑 Copilot 配置' : '新建 Copilot 配置'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        width={640}
        okText="保存"
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item name="name" label="配置名称" rules={[{ required: true }]}>
            <Input placeholder="例如：客服 Copilot" />
          </Form.Item>
          {!editingId && (
            <>
              <Form.Item label="归属租户">
                <Typography.Text>{activeTenantLabel}</Typography.Text>
                <div className="mt-1 text-xs text-gray-500">
                  与顶栏「当前操作租户」一致
                </div>
              </Form.Item>
              <Form.Item
                name="appId"
                label="OpenAPI 应用"
                rules={[{ required: true, message: '请选择 OpenAPI 应用' }]}
                extra={
                  appOptions.length === 0 ? (
                    <span>
                      请先在{' '}
                      <Link to="/openapi/apps">OpenAPI 应用接入</Link> 为当前租户创建应用
                    </span>
                  ) : (
                    '每个 OpenAPI 应用仅可绑定一份 Copilot 配置'
                  )
                }
              >
                <Select
                  showSearch
                  placeholder="选择本租户的 OpenAPI 应用"
                  disabled={!activeTenantId}
                  optionFilterProp="label"
                  options={appOptions}
                />
              </Form.Item>
            </>
          )}
          <Form.Item name="domainWhitelist" label="域名白名单（每行一个）">
            <Input.TextArea rows={3} placeholder="https://example.com&#10;https://app.example.com" />
          </Form.Item>
          <Form.Item name="welcomeMessage" label="欢迎语">
            <Input.TextArea rows={2} placeholder="你好！我是智能助手，有什么可以帮您？" />
          </Form.Item>
          <Form.Item name="placeholder" label="输入框占位文字">
            <Input placeholder="请输入您的问题…" />
          </Form.Item>
          <Form.Item label="功能开关">
            <Space>
              <Form.Item name="enableHistory" valuePropName="checked" noStyle>
                <Switch checkedChildren="历史会话" unCheckedChildren="历史会话" />
              </Form.Item>
              <Form.Item name="enableTask" valuePropName="checked" noStyle>
                <Switch checkedChildren="任务状态" unCheckedChildren="任务状态" />
              </Form.Item>
              <Form.Item name="enableConfirmation" valuePropName="checked" noStyle>
                <Switch checkedChildren="待确认" unCheckedChildren="待确认" />
              </Form.Item>
            </Space>
          </Form.Item>
          <Form.Item name="maxHistoryMessages" label="历史消息最大加载条数">
            <Input type="number" />
          </Form.Item>
          <Form.Item name="tokenTtlSeconds" label="Token 有效期（秒）">
            <Input type="number" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
