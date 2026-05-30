'use client';

import { ApiOutlined, SaveOutlined, ThunderboltOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Spin,
  Typography,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';
import {
  getLlmSettings,
  testLlmConnection,
  updateLlmSettings,
  type LlmSettingsView,
} from '@/lib/llm-settings';

export default function LlmIntegrationPage() {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState<LlmSettingsView | null>(null);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    elapsed_ms?: number;
    error?: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLlmSettings();
      setSettings(data);
      form.setFieldsValue({
        base_url: data.base_url,
        model: data.model,
        timeout_ms: data.timeout_ms,
        max_tokens: data.max_tokens,
        chat_path: data.chat_path,
        api_key: '',
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
      const payload: Record<string, unknown> = {
        base_url: values.base_url,
        model: values.model,
        timeout_ms: values.timeout_ms,
        max_tokens: values.max_tokens,
        chat_path: values.chat_path,
      };
      if (values.api_key?.trim()) {
        payload.api_key = values.api_key.trim();
      }
      const updated = await updateLlmSettings(payload);
      setSettings(updated);
      form.setFieldValue('api_key', '');
      message.success('模型接入配置已保存');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    const values = form.getFieldsValue();
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testLlmConnection({
        base_url: values.base_url,
        model: values.model,
        api_key: values.api_key?.trim() || undefined,
      });
      setTestResult(result);
      if (result.ok) message.success(`连接成功（${result.elapsed_ms}ms）`);
      else message.error(result.error ?? '连接失败');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '测试失败');
    } finally {
      setTesting(false);
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
      <Typography.Title level={3}>
        <ApiOutlined className="mr-2" />
        模型接入
      </Typography.Title>
      <Typography.Paragraph type="secondary" className="max-w-3xl">
        配置平台主 LLM（OpenAI 兼容 Chat Completions）。问答型 Runtime 与「问答测试」均使用此配置生成最终回答；
        pathy 仅负责知识召回，不在此配置 pathy 内 LLM。
      </Typography.Paragraph>

      {!settings?.api_key_configured && (
        <Alert
          className="mb-4 max-w-2xl"
          type="warning"
          showIcon
          message="尚未配置 API Key"
          description="保存 Base URL、模型 ID 与 API Key 后，问答型能力方可正常调用平台 LLM。"
        />
      )}

      <Card className="max-w-2xl">
        <Form form={form} layout="vertical">
          <Form.Item
            name="base_url"
            label="Base URL"
            rules={[{ required: true, message: '请输入 Base URL' }]}
            extra="例如 https://api.openai.com/v1 或兼容网关根路径"
          >
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>

          <Form.Item
            name="model"
            label="模型 ID"
            rules={[{ required: true, message: '请输入模型 ID' }]}
          >
            <Input placeholder="gpt-4o-mini" />
          </Form.Item>

          <Form.Item
            name="api_key"
            label="API Key"
            extra={
              settings?.api_key_configured
                ? '已配置密钥；留空则保持不变，填写则覆盖'
                : '必填；保存后不会在界面回显明文'
            }
          >
            <Input.Password placeholder="sk-..." autoComplete="new-password" />
          </Form.Item>

          <Form.Item
            name="chat_path"
            label="Chat Completions 路径"
            extra="相对 Base URL，默认 v1/chat/completions"
          >
            <Input placeholder="v1/chat/completions" />
          </Form.Item>

          <Form.Item
            name="timeout_ms"
            label="单次 Chat 超时（毫秒）"
            rules={[{ required: true, message: '请输入超时时间' }]}
          >
            <InputNumber min={1000} max={600000} step={1000} className="!w-full" />
          </Form.Item>

          <Form.Item
            name="max_tokens"
            label="max_tokens"
            rules={[{ required: true, message: '请输入 max_tokens' }]}
          >
            <InputNumber min={1} max={200000} step={256} className="!w-full" />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={onSave}
              className="mr-2"
            >
              保存
            </Button>
            <Button icon={<ThunderboltOutlined />} loading={testing} onClick={onTest}>
              测试连接
            </Button>
          </Form.Item>
        </Form>

        {testResult && (
          <Alert
            className="mt-4"
            type={testResult.ok ? 'success' : 'error'}
            showIcon
            message={testResult.ok ? '连通性测试通过' : '连通性测试失败'}
            description={
              <>
                {testResult.message}
                {testResult.elapsed_ms != null && `（${testResult.elapsed_ms} ms）`}
                {testResult.error && (
                  <div className="mt-1 text-xs opacity-80">{testResult.error}</div>
                )}
              </>
            }
          />
        )}
      </Card>
    </>
  );
}
