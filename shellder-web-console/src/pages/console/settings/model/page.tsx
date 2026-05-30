'use client';

import { SaveOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Spin,
  Switch,
  Typography,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { type ConfigMap, batchUpsertConfigs, getAllConfigs } from '@/lib/system-settings';

export default function ModelSettingsPage() {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const configs: ConfigMap = await getAllConfigs();
      form.setFieldsValue({
        streamEnabled: configs['model.streamEnabled']?.configValue === 'true',
        timeoutMs: Number(configs['model.timeoutMs']?.configValue ?? '60000'),
        retryCount: Number(configs['model.retryCount']?.configValue ?? '3'),
        retryDelayMs: Number(configs['model.retryDelayMs']?.configValue ?? '1000'),
        capabilityResponseTemplate:
          configs['model.capabilityResponseTemplate']?.configValue ?? '{}',
      });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载配置失败');
    } finally {
      setLoading(false);
    }
  }, [form, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await batchUpsertConfigs([
        { configKey: 'model.streamEnabled', configValue: String(values.streamEnabled) },
        { configKey: 'model.timeoutMs', configValue: String(values.timeoutMs) },
        { configKey: 'model.retryCount', configValue: String(values.retryCount) },
        { configKey: 'model.retryDelayMs', configValue: String(values.retryDelayMs) },
        {
          configKey: 'model.capabilityResponseTemplate',
          configValue: values.capabilityResponseTemplate,
        },
      ]);
      message.success('模型与响应配置已保存');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spin tip="加载中…" />
      </div>
    );
  }

  return (
    <>
      <Typography.Title level={3}>模型与响应配置</Typography.Title>
      <Typography.Paragraph type="secondary" className="max-w-2xl">
        编排层流式开关、重试与能力响应模板。上游 LLM（Base URL / API Key）请在
        <Link to="/settings/llm"> 模型接入 </Link>
        中配置。
      </Typography.Paragraph>

      <Card className="max-w-2xl">
        <Form form={form} layout="vertical">
          <Form.Item
            name="streamEnabled"
            label="流式响应"
            valuePropName="checked"
            extra="关闭后 SSE 仅返回 complete 事件"
          >
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>

          <Form.Item
            name="timeoutMs"
            label="模型调用超时（毫秒）"
            rules={[{ required: true, message: '请输入超时时间' }]}
          >
            <InputNumber min={1000} max={600000} step={1000} className="!w-full" />
          </Form.Item>

          <Form.Item
            name="retryCount"
            label="默认重试次数"
            rules={[{ required: true, message: '请输入重试次数' }]}
          >
            <InputNumber min={0} max={10} step={1} className="!w-full" />
          </Form.Item>

          <Form.Item
            name="retryDelayMs"
            label="重试间隔（毫秒）"
            rules={[{ required: true, message: '请输入重试间隔' }]}
          >
            <InputNumber min={100} max={60000} step={100} className="!w-full" />
          </Form.Item>

          <Form.Item
            name="capabilityResponseTemplate"
            label="能力级响应模板（JSON）"
            extra="按能力类型自定义响应格式模板"
          >
            <Input.TextArea rows={6} placeholder='{"qa":"...","query":"..."}' />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={onSave}
            >
              保存
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </>
  );
}
