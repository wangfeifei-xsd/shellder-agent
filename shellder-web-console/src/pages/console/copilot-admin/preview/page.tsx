'use client';

import { useMemo, useState } from 'react';
import { Button, Card, Form, Input, Select, Space, Typography, message } from 'antd';
import { PlayCircleOutlined, CopyOutlined } from '@ant-design/icons';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';

const { Title, Paragraph, Text } = Typography;

/**
 * Copilot 嵌入预览 — 管理员可在此页面测试嵌入效果，
 * 并获取嵌入代码片段。
 */
export default function CopilotPreviewPage() {
  const { tenants } = useActiveTenant();
  const [form] = Form.useForm();
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const resolveCopilotPath = () => {
    const pathname = window.location.pathname.replace(/\/+$/, '');
    const basePath = pathname.replace(/\/copilot-admin\/preview$/, '');
    return `${basePath || ''}/copilot`;
  };
  const tenantOptions = useMemo(
    () =>
      tenants.map((tenant) => ({
        value: tenant.id,
        label: `${tenant.name}（${tenant.code}）`,
      })),
    [tenants],
  );

  const handlePreview = async () => {
    const values = await form.validateFields();
    const params = new URLSearchParams();
    params.set('clientId', values.clientId);
    params.set('clientSecret', values.clientSecret);
    if (values.tenantId) params.set('tenantId', values.tenantId);
    if (values.externalTenantId) params.set('externalTenantId', values.externalTenantId);
    if (values.externalUserId) params.set('externalUserId', values.externalUserId);
    setIframeSrc(`${resolveCopilotPath()}?${params.toString()}`);
  };

  const generateEmbedCode = () => {
    const values = form.getFieldsValue();
    if (!values.clientId || !values.clientSecret) {
      message.warning('请先填写凭证');
      return;
    }
    const code = `<!-- shellder-agent Copilot 嵌入代码 -->
<iframe
  id="shellder-copilot"
  src="${window.location.origin}${resolveCopilotPath()}"
  style="width: 400px; height: 600px; border: none; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.12);"
  allow="clipboard-write"
></iframe>
<script>
  // 通过 postMessage 传入凭证（推荐，避免 URL 暴露密钥）
  const copilotFrame = document.getElementById('shellder-copilot');
  copilotFrame.addEventListener('load', () => {
    copilotFrame.contentWindow.postMessage({
      type: 'copilot:init',
      clientId: '${values.clientId}',
      clientSecret: '${values.clientSecret}',
      ${values.tenantId ? `tenantId: '${values.tenantId}',` : ''}
      ${values.externalTenantId ? `externalTenantId: '${values.externalTenantId}',` : ''}
      ${values.externalUserId ? `externalUserId: '${values.externalUserId}',` : ''}
    }, '${window.location.origin}');
  });
</script>`;

    navigator.clipboard.writeText(code).then(() => {
      message.success('嵌入代码已复制到剪贴板');
    });
  };

  return (
    <div>
      <Title level={4}>嵌入式 Copilot 预览</Title>
      <Paragraph type="secondary">
        在此页面测试 Copilot 嵌入效果，并生成可直接使用的嵌入代码片段。
      </Paragraph>

      <div className="flex gap-6">
        {/* 左侧：配置表单 */}
        <Card className="w-[400px]" title="嵌入参数">
          <Form form={form} layout="vertical">
            <Form.Item name="clientId" label="Client ID" rules={[{ required: true }]}>
              <Input placeholder="OpenAPI 应用的 Client ID" />
            </Form.Item>
            <Form.Item name="clientSecret" label="Client Secret" rules={[{ required: true }]}>
              <Input.Password placeholder="OpenAPI 应用的 Client Secret" />
            </Form.Item>
            <Form.Item name="tenantId" label="租户 ID">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={tenantOptions.length > 0 ? '可选，选择租户' : '暂无可选租户'}
                options={tenantOptions}
              />
            </Form.Item>
            <Form.Item name="externalTenantId" label="外部租户 ID">
              <Input placeholder="可选，externalTenantId 映射" />
            </Form.Item>
            <Form.Item name="externalUserId" label="外部用户 ID">
              <Input placeholder="可选，业务系统用户标识" />
            </Form.Item>
            <Space>
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={handlePreview}>
                预览
              </Button>
              <Button icon={<CopyOutlined />} onClick={generateEmbedCode}>
                复制嵌入代码
              </Button>
            </Space>
          </Form>
        </Card>

        {/* 右侧：iframe 预览 */}
        <Card
          className="flex-1"
          title="预览效果"
          bodyStyle={{ padding: 0, height: 560, overflow: 'hidden' }}
        >
          {iframeSrc ? (
            <iframe
              src={iframeSrc}
              className="h-full w-full border-none"
              title="Copilot Preview"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">
              点击「预览」按钮开始测试
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
