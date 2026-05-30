'use client';

import { LeftOutlined } from '@ant-design/icons';
import {
  App,
  Breadcrumb,
  Button,
  Card,
  Form,
  Select,
  Space,
  Spin,
  Switch,
  Typography,
} from 'antd';
import { Link } from 'react-router-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { TenantIsolation, getTenantIsolation, updateTenantIsolation } from '@/lib/tenant';

export default function TenantIsolationPage() {
  const navigate = useNavigate();
  const id = useParams().id!;
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const iso = await getTenantIsolation(id);
      form.setFieldsValue(iso);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载隔离配置失败');
    } finally {
      setLoading(false);
    }
  }, [id, form, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFinish = async (values: TenantIsolation) => {
    setSubmitting(true);
    try {
      await updateTenantIsolation(id, values);
      message.success('隔离配置已保存');
      navigate(`/tenants/${id}`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Breadcrumb
        className="mb-4"
        items={[
          { title: <Link to="/tenants">租户列表</Link> },
          { title: <Link to={`/tenants/${id}`}>租户详情</Link> },
          { title: '租户隔离配置' },
        ]}
      />
      <div className="mb-4 flex items-center gap-2">
        <Button type="text" icon={<LeftOutlined />} onClick={() => navigate(`/tenants/${id}`)} />
        <Typography.Title level={3} className="!mb-0">
          租户隔离配置
        </Typography.Title>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Spin />
        </div>
      ) : (
        <Card className="max-w-2xl">
          <Form form={form} layout="vertical" onFinish={handleFinish}>
            <Form.Item
              label="数据隔离策略"
              name="dataIsolationStrategy"
              tooltip="严格隔离：租户数据互不可见；共享：放宽跨租户限制"
            >
              <Select
                options={[
                  { value: 'strict', label: '严格隔离' },
                  { value: 'shared', label: '共享' },
                ]}
              />
            </Form.Item>
            <Form.Item label="限制跨租户访问" name="restrictCrossTenant" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item
              label="连接器仅租户内可见"
              name="connectorVisibleWithinTenant"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              label="工具仅租户内可见"
              name="toolVisibleWithinTenant"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              label="审计数据仅租户内可见"
              name="auditVisibleWithinTenant"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={submitting}>
                保存
              </Button>
              <Button onClick={() => navigate(`/tenants/${id}`)}>取消</Button>
            </Space>
          </Form>
        </Card>
      )}
    </>
  );
}
