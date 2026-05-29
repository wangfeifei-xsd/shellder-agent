'use client';

import { Drawer, Form, Input, Select, Space, Button } from 'antd';
import { useEffect, useState } from 'react';
import { Role } from '@/lib/role';
import { MeTenant } from '@/lib/auth';
import {
  CreateUserInput,
  PlatformUser,
  UpdateUserInput,
  createUser,
  updateUser,
} from '@/lib/user';

interface Props {
  open: boolean;
  editing?: PlatformUser;
  roles: Role[];
  tenants: MeTenant[];
  onClose: () => void;
  onSaved: () => void;
}

interface FormValues {
  username: string;
  password?: string;
  displayName?: string;
  email?: string;
  status: 'enabled' | 'disabled';
  remark?: string;
  roleIds: string[];
  tenantIds: string[];
}

export default function UserFormDrawer({
  open,
  editing,
  roles,
  tenants,
  onClose,
  onSaved,
}: Props) {
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!editing;

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.setFieldsValue({
        username: editing.username,
        displayName: editing.displayName ?? undefined,
        email: editing.email ?? undefined,
        status: editing.status,
        remark: editing.remark ?? undefined,
        roleIds: editing.roles.map((r) => r.id),
        tenantIds: editing.tenants.map((t) => t.id),
        password: undefined,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ status: 'enabled', roleIds: [], tenantIds: [] });
    }
  }, [open, editing, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      if (isEdit && editing) {
        const payload: UpdateUserInput = {
          displayName: values.displayName,
          email: values.email,
          status: values.status,
          remark: values.remark,
          roleIds: values.roleIds,
          tenantIds: values.tenantIds,
        };
        if (values.password) payload.password = values.password;
        await updateUser(editing.id, payload);
      } else {
        const payload: CreateUserInput = {
          username: values.username,
          password: values.password!,
          displayName: values.displayName,
          email: values.email,
          status: values.status,
          remark: values.remark,
          roleIds: values.roleIds,
          tenantIds: values.tenantIds,
        };
        await createUser(payload);
      }
      onSaved();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      title={isEdit ? '编辑用户' : '新建用户'}
      width={520}
      open={open}
      onClose={onClose}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={submitting} onClick={handleSubmit}>
            保存
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="用户名"
          name="username"
          rules={[{ required: true, message: '请输入用户名' }]}
        >
          <Input disabled={isEdit} placeholder="字母数字、下划线、点、连字符" />
        </Form.Item>
        <Form.Item
          label={isEdit ? '密码（留空不修改）' : '初始密码'}
          name="password"
          rules={isEdit ? [] : [{ required: true, message: '请输入初始密码' }, { min: 6 }]}
        >
          <Input.Password placeholder="至少 6 位" autoComplete="new-password" />
        </Form.Item>
        <Form.Item label="显示名" name="displayName">
          <Input placeholder="可选" />
        </Form.Item>
        <Form.Item label="邮箱" name="email" rules={[{ type: 'email', message: '邮箱格式不正确' }]}>
          <Input placeholder="可选" />
        </Form.Item>
        <Form.Item label="状态" name="status">
          <Select
            options={[
              { value: 'enabled', label: '启用' },
              { value: 'disabled', label: '禁用' },
            ]}
          />
        </Form.Item>
        <Form.Item label="分配角色" name="roleIds">
          <Select
            mode="multiple"
            allowClear
            placeholder="选择角色"
            optionFilterProp="label"
            options={roles.map((r) => ({ value: r.id, label: `${r.name}（${r.code}）` }))}
          />
        </Form.Item>
        <Form.Item
          label="绑定租户"
          name="tenantIds"
          tooltip="仅可绑定已登记且启用的租户（tenant.id），支持多租户"
        >
          <Select
            mode="multiple"
            allowClear
            placeholder="选择租户"
            optionFilterProp="label"
            options={tenants.map((t) => ({ value: t.id, label: `${t.name}（${t.code}）` }))}
          />
        </Form.Item>
        <Form.Item label="备注" name="remark">
          <Input.TextArea rows={2} placeholder="可选" />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
