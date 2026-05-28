'use client';

import { Button, Card, Form, Input, Typography } from 'antd';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md shadow-md" title="Agent 平台登录">
        <Typography.Paragraph type="secondary" className="mb-6">
          阶段 01 占位页。认证与用户模块将在阶段 03 实现。
        </Typography.Paragraph>
        <Form
          layout="vertical"
          onFinish={() => router.push('/')}
          initialValues={{ username: 'admin', password: '' }}
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="admin" />
          </Form.Item>
          <Form.Item label="密码" name="password">
            <Input.Password placeholder="阶段 01 任意密码可进入" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            登录（占位）
          </Button>
        </Form>
      </Card>
    </div>
  );
}
