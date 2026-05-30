'use client';

import { useEffect, useState } from 'react';
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
import { apiFetch } from '@/lib/api';

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
  const [configs, setConfigs] = useState<CopilotConfigItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<CopilotConfigItem[]>('/api/v1/copilot/configs');
      setConfigs(data);
    } catch (e: any) {
      message.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = () => {
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
    const body: any = {
      name: values.name,
      tenantId: values.tenantId,
      appId: values.appId,
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
        await apiFetch(`/api/v1/copilot/configs/${editingId}`, { method: 'PATCH', body });
        message.success('已更新');
      } else {
        await apiFetch('/api/v1/copilot/configs', { method: 'POST', body });
        message.success('已创建');
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      message.error(e.message ?? '操作失败');
    }
  };

  const columns = [
    { title: '配置名称', dataIndex: 'name', key: 'name' },
    {
      title: '关联应用',
      key: 'app',
      render: (_: unknown, r: CopilotConfigItem) => r.app?.name ?? r.appId,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => (
        <Tag color={s === 'enabled' ? 'success' : 'default'}>{s === 'enabled' ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '域名白名单',
      key: 'domains',
      render: (_: unknown, r: CopilotConfigItem) =>
        (r.domainWhitelist ?? []).length > 0
          ? (r.domainWhitelist as string[]).slice(0, 2).join(', ') +
            ((r.domainWhitelist as string[]).length > 2 ? '…' : '')
          : '—',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: CopilotConfigItem) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)}>
            删除
          </Button>
        </Space>
      ),
    },
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
              <Form.Item name="tenantId" label="租户 ID" rules={[{ required: true }]}>
                <Input placeholder="租户 ID" />
              </Form.Item>
              <Form.Item name="appId" label="OpenAPI 应用 ID" rules={[{ required: true }]}>
                <Input placeholder="关联的 OpenAPI 应用 ID" />
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
