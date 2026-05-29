'use client';

import { LeftOutlined } from '@ant-design/icons';
import { App, Breadcrumb, Button, Typography } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import TenantForm from '@/components/console/TenantForm';
import { TenantUpsertInput, createTenant } from '@/lib/tenant';

export default function NewTenantPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (input: TenantUpsertInput) => {
    setSubmitting(true);
    try {
      const tenant = await createTenant(input);
      message.success('租户创建成功');
      router.push(`/tenants/${tenant.id}`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Breadcrumb
        className="mb-4"
        items={[{ title: <Link href="/tenants">租户列表</Link> }, { title: '新建租户' }]}
      />
      <div className="mb-4 flex items-center gap-2">
        <Button type="text" icon={<LeftOutlined />} onClick={() => router.push('/tenants')} />
        <Typography.Title level={3} className="!mb-0">
          新建租户
        </Typography.Title>
      </div>
      <TenantForm
        submitText="创建"
        submitting={submitting}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/tenants')}
      />
    </>
  );
}
