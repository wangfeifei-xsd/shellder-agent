'use client';

import { LeftOutlined } from '@ant-design/icons';
import { App, Breadcrumb, Button, Spin, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import TenantForm from '@/components/console/TenantForm';
import { Tenant, TenantUpsertInput, getTenant, updateTenant } from '@/lib/tenant';

export default function EditTenantPage() {
  const navigate = useNavigate();
  const id = useParams().id!;
  const { message } = App.useApp();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTenant(await getTenant(id));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载租户失败');
    } finally {
      setLoading(false);
    }
  }, [id, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (input: TenantUpsertInput) => {
    setSubmitting(true);
    try {
      await updateTenant(id, input);
      message.success('保存成功');
      navigate(`/tenants/${id}`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spin />
      </div>
    );
  }

  if (!tenant) {
    return <Typography.Text type="secondary">租户不存在</Typography.Text>;
  }

  return (
    <>
      <Breadcrumb
        className="mb-4"
        items={[
          { title: <Link to="/tenants">租户列表</Link> },
          { title: <Link to={`/tenants/${id}`}>{tenant.name}</Link> },
          { title: '编辑' },
        ]}
      />
      <div className="mb-4 flex items-center gap-2">
        <Button type="text" icon={<LeftOutlined />} onClick={() => navigate(`/tenants/${id}`)} />
        <Typography.Title level={3} className="!mb-0">
          编辑租户
        </Typography.Title>
      </div>
      <TenantForm
        initial={tenant}
        submitText="保存"
        submitting={submitting}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/tenants/${id}`)}
      />
    </>
  );
}
