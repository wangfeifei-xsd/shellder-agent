'use client';

import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import {
  type ConfigMap,
  type NotificationTemplate,
  type NotificationTemplateType,
  TEMPLATE_TYPE_LABEL,
  batchUpsertConfigs,
  createNotificationTemplate,
  deleteNotificationTemplate,
  getAllConfigs,
  listNotificationTemplates,
  updateNotificationTemplate,
} from '@/lib/system-settings';

export default function NotificationSettingsPage() {
  const { message } = App.useApp();

  // ── 通知连接器配置 ──────────────────────────────────
  const [connectorId, setConnectorId] = useState('');
  const [connectorSaving, setConnectorSaving] = useState(false);

  // ── 模板列表 ────────────────────────────────────────
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // ── 模板弹窗 ────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [modalSaving, setModalSaving] = useState(false);

  const loadConnectorConfig = useCallback(async () => {
    try {
      const configs: ConfigMap = await getAllConfigs();
      setConnectorId(configs['notification.connectorId']?.configValue ?? '');
    } catch {
      // ignore
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const list = await listNotificationTemplates();
      setTemplates(list);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载通知模板失败');
    } finally {
      setTemplatesLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void loadConnectorConfig();
    void loadTemplates();
  }, [loadConnectorConfig, loadTemplates]);

  const saveConnector = async () => {
    setConnectorSaving(true);
    try {
      await batchUpsertConfigs([
        { configKey: 'notification.connectorId', configValue: connectorId },
      ]);
      message.success('通知连接器已保存');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setConnectorSaving(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ enabled: true });
    setModalOpen(true);
  };

  const openEdit = (tpl: NotificationTemplate) => {
    setEditingId(tpl.id);
    form.setFieldsValue({
      type: tpl.type,
      name: tpl.name,
      subject: tpl.subject,
      body: tpl.body,
      enabled: tpl.enabled,
      connectorId: tpl.connectorId,
    });
    setModalOpen(true);
  };

  const handleSaveTemplate = async () => {
    const values = await form.validateFields();
    setModalSaving(true);
    try {
      if (editingId) {
        await updateNotificationTemplate(editingId, {
          name: values.name,
          subject: values.subject,
          body: values.body,
          enabled: values.enabled,
          connectorId: values.connectorId,
        });
        message.success('模板已更新');
      } else {
        await createNotificationTemplate({
          type: values.type,
          name: values.name,
          subject: values.subject,
          body: values.body,
          enabled: values.enabled,
          connectorId: values.connectorId,
        });
        message.success('模板已创建');
      }
      setModalOpen(false);
      void loadTemplates();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setModalSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNotificationTemplate(id);
      message.success('模板已删除');
      void loadTemplates();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const columns: ColumnsType<NotificationTemplate> = [
    {
      title: '类型',
      dataIndex: 'type',
      width: 140,
      render: (t: NotificationTemplateType) => (
        <Tag>{TEMPLATE_TYPE_LABEL[t]}</Tag>
      ),
    },
    { title: '名称', dataIndex: 'name' },
    { title: '主题', dataIndex: 'subject', render: (v: string | null) => v || '—' },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 80,
      render: (v: boolean) =>
        v ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 180,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_, row) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(row)}
          >
            编辑
          </Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(row.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Typography.Title level={3}>通知配置</Typography.Title>

      {/* 通知连接器 */}
      <Card title="消息通知接口" className="mb-6 max-w-2xl">
        <Space>
          <Input
            placeholder="通知类连接器 ID"
            style={{ width: 360 }}
            value={connectorId}
            onChange={(e) => setConnectorId(e.target.value)}
          />
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={connectorSaving}
            onClick={saveConnector}
          >
            保存
          </Button>
        </Space>
        <Typography.Text type="secondary" className="mt-2 block">
          填写连接器管理中 type=notification 的连接器 ID，作为通知发送的默认通道。
        </Typography.Text>
      </Card>

      {/* 通知模板列表 */}
      <Card
        title="通知模板"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建模板
          </Button>
        }
      >
        <Table<NotificationTemplate>
          rowKey="id"
          loading={templatesLoading}
          columns={columns}
          dataSource={templates}
          pagination={false}
        />
      </Card>

      {/* 模板编辑弹窗 */}
      <Modal
        title={editingId ? '编辑通知模板' : '新建通知模板'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSaveTemplate}
        confirmLoading={modalSaving}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item
            name="type"
            label="模板类型"
            rules={[{ required: true, message: '请选择模板类型' }]}
          >
            <Select
              disabled={!!editingId}
              placeholder="选择类型"
              options={[
                { value: 'approval', label: '审批通知' },
                { value: 'task_complete', label: '任务完成通知' },
                { value: 'exception', label: '异常通知' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="name"
            label="模板名称"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input placeholder="如：默认审批通知模板" />
          </Form.Item>

          <Form.Item name="subject" label="通知主题">
            <Input placeholder="支持变量：{{actionType}} {{taskTitle}} 等" />
          </Form.Item>

          <Form.Item
            name="body"
            label="模板内容"
            rules={[{ required: true, message: '请输入模板内容' }]}
          >
            <Input.TextArea
              rows={6}
              placeholder="支持变量占位符 {{var}}"
            />
          </Form.Item>

          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item name="connectorId" label="关联通知连接器 ID">
            <Input placeholder="留空则使用全局默认通知连接器" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
