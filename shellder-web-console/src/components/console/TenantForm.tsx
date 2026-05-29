'use client';

import { Button, Card, Checkbox, Form, Input, InputNumber, Select, Space } from 'antd';
import { CAPABILITY_OPTIONS, Tenant, TenantCapability, TenantUpsertInput } from '@/lib/tenant';

interface Props {
  initial?: Tenant;
  submitText: string;
  submitting?: boolean;
  onSubmit: (input: TenantUpsertInput) => void;
  onCancel?: () => void;
}

export default function TenantForm({ initial, submitText, submitting, onSubmit, onCancel }: Props) {
  const [form] = Form.useForm();

  const initialValues = {
    status: initial?.status ?? 'enabled',
    name: initial?.name,
    code: initial?.code,
    adminUserId: initial?.adminUserId ?? undefined,
    externalTenantId: initial?.externalTenantId ?? undefined,
    remark: initial?.remark ?? undefined,
    capabilities: initial?.capabilities ?? [],
    maxSessions: initial?.limits?.maxSessions ?? 0,
    maxTasks: initial?.limits?.maxTasks ?? 0,
  };

  const handleFinish = (values: Record<string, unknown>) => {
    const input: TenantUpsertInput = {
      name: values.name as string,
      code: values.code as string,
      status: values.status as 'enabled' | 'disabled',
      adminUserId: (values.adminUserId as string) || undefined,
      externalTenantId: (values.externalTenantId as string) || undefined,
      remark: (values.remark as string) || undefined,
      config: {
        capabilities: (values.capabilities as TenantCapability[]) ?? [],
        limits: {
          maxSessions: Number(values.maxSessions ?? 0),
          maxTasks: Number(values.maxTasks ?? 0),
        },
      },
    };
    onSubmit(input);
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={initialValues}
      onFinish={handleFinish}
      className="max-w-2xl"
    >
      <Card title="基本信息" className="mb-4">
        <Form.Item
          label="租户名称"
          name="name"
          rules={[{ required: true, message: '请输入租户名称' }]}
        >
          <Input placeholder="例如：示例租户" maxLength={128} />
        </Form.Item>
        <Form.Item
          label="租户编码"
          name="code"
          tooltip="平台内唯一，仅允许字母、数字、下划线、连字符"
          rules={[
            { required: true, message: '请输入租户编码' },
            { pattern: /^[A-Za-z0-9_-]+$/, message: '仅允许字母、数字、下划线、连字符' },
            { min: 2, max: 64, message: '长度 2-64' },
          ]}
        >
          <Input placeholder="例如：default" maxLength={64} />
        </Form.Item>
        <Form.Item label="状态" name="status" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'enabled', label: '启用' },
              { value: 'disabled', label: '禁用' },
            ]}
          />
        </Form.Item>
        <Form.Item
          label="租户管理员"
          name="adminUserId"
          tooltip="绑定平台用户；用户模块（阶段 03）就绪前可留空"
        >
          <Input placeholder="平台用户 ID（可空）" maxLength={36} />
        </Form.Item>
        <Form.Item
          label="外部租户标识 externalTenantId"
          name="externalTenantId"
          tooltip="上层业务租户映射，非同步字段，可留空"
        >
          <Input placeholder="上层业务租户 ID（可空）" maxLength={128} />
        </Form.Item>
        <Form.Item label="备注" name="remark">
          <Input.TextArea rows={3} maxLength={512} showCount />
        </Form.Item>
      </Card>

      <Card title="开通能力与限额" className="mb-4">
        <Form.Item label="开通能力范围" name="capabilities">
          <Checkbox.Group options={CAPABILITY_OPTIONS} />
        </Form.Item>
        <Space size="large">
          <Form.Item label="最大会话数（0=不限）" name="maxSessions">
            <InputNumber min={0} />
          </Form.Item>
          <Form.Item label="最大任务数（0=不限）" name="maxTasks">
            <InputNumber min={0} />
          </Form.Item>
        </Space>
      </Card>

      <Space>
        <Button type="primary" htmlType="submit" loading={submitting}>
          {submitText}
        </Button>
        {onCancel && <Button onClick={onCancel}>取消</Button>}
      </Space>
    </Form>
  );
}
