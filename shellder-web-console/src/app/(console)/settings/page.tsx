'use client';

import { SaveOutlined } from '@ant-design/icons';
import { App, Button, Card, Form, Input, InputNumber, Spin, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { type ConfigMap, batchUpsertConfigs, getAllConfigs } from '@/lib/system-settings';

export default function BasicSettingsPage() {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const configs: ConfigMap = await getAllConfigs();
      form.setFieldsValue({
        platformName: configs['basic.platformName']?.configValue ?? 'shellder-agent',
        platformLogo: configs['basic.platformLogo']?.configValue ?? '',
        defaultTimeoutMs: Number(configs['basic.defaultTimeoutMs']?.configValue ?? '300000'),
        defaultPageSize: Number(configs['basic.defaultPageSize']?.configValue ?? '20'),
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
        { configKey: 'basic.platformName', configValue: String(values.platformName) },
        { configKey: 'basic.platformLogo', configValue: String(values.platformLogo ?? '') },
        { configKey: 'basic.defaultTimeoutMs', configValue: String(values.defaultTimeoutMs) },
        { configKey: 'basic.defaultPageSize', configValue: String(values.defaultPageSize) },
      ]);
      message.success('基础配置已保存');
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
      <Typography.Title level={3}>基础配置</Typography.Title>

      <Card className="max-w-2xl">
        <Form form={form} layout="vertical">
          <Form.Item
            name="platformName"
            label="平台名称"
            rules={[{ required: true, message: '请输入平台名称' }]}
          >
            <Input placeholder="shellder-agent" />
          </Form.Item>

          <Form.Item name="platformLogo" label="平台 Logo URL">
            <Input placeholder="https://example.com/logo.png" />
          </Form.Item>

          <Form.Item
            name="defaultTimeoutMs"
            label="默认超时（毫秒）"
            rules={[{ required: true, message: '请输入默认超时' }]}
          >
            <InputNumber min={1000} max={3600000} step={1000} className="!w-full" />
          </Form.Item>

          <Form.Item
            name="defaultPageSize"
            label="默认分页大小"
            rules={[{ required: true, message: '请输入默认分页大小' }]}
          >
            <InputNumber min={5} max={200} step={5} className="!w-full" />
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
