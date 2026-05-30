'use client';

import { EditOutlined, LeftOutlined } from '@ant-design/icons';
import {
  App,
  Breadcrumb,
  Button,
  Card,
  Col,
  Descriptions,
  Row,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
} from 'antd';
import { Link } from 'react-router-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import {
  CAPABILITY_LABEL,
  TenantCapability,
  TenantDetail,
  getTenant,
} from '@/lib/tenant';

export default function TenantDetailPage() {
  const navigate = useNavigate();
  const id = useParams().id!;
  const { message } = App.useApp();

  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTenant(await getTenant(id));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载租户详情失败');
    } finally {
      setLoading(false);
    }
  }, [id, message]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const iso = tenant.isolation;

  return (
    <>
      <Breadcrumb
        className="mb-4"
        items={[{ title: <Link to="/tenants">租户列表</Link> }, { title: tenant.name }]}
      />
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button type="text" icon={<LeftOutlined />} onClick={() => navigate('/tenants')} />
          <Typography.Title level={3} className="!mb-0">
            {tenant.name}
          </Typography.Title>
          {tenant.status === 'enabled' ? (
            <Tag color="green">启用</Tag>
          ) : (
            <Tag color="red">禁用</Tag>
          )}
        </div>
        <Space>
          <Button icon={<EditOutlined />} onClick={() => navigate(`/tenants/${id}/edit`)}>
            编辑
          </Button>
          <Button onClick={() => navigate(`/tenants/${id}/isolation`)}>租户隔离配置</Button>
        </Space>
      </div>

      <Card title="基本信息" className="mb-4">
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="租户名称">{tenant.name}</Descriptions.Item>
          <Descriptions.Item label="租户编码">{tenant.code}</Descriptions.Item>
          <Descriptions.Item label="状态">
            {tenant.status === 'enabled' ? '启用' : '禁用'}
          </Descriptions.Item>
          <Descriptions.Item label="管理员">{tenant.adminUserId || '—'}</Descriptions.Item>
          <Descriptions.Item label="externalTenantId">
            {tenant.externalTenantId || '—'}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {new Date(tenant.createdAt).toLocaleString('zh-CN')}
          </Descriptions.Item>
          <Descriptions.Item label="开通能力" span={2}>
            {tenant.capabilities?.length ? (
              <Space size={4} wrap>
                {tenant.capabilities.map((c: TenantCapability) => (
                  <Tag key={c}>{CAPABILITY_LABEL[c]}</Tag>
                ))}
              </Space>
            ) : (
              '—'
            )}
          </Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>
            {tenant.remark || '—'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="统计" className="mb-4">
        <Row gutter={16}>
          <Col span={4}>
            <Statistic title="用户数" value={tenant.stats.userCount} />
          </Col>
          <Col span={4}>
            <Statistic title="会话数" value={tenant.stats.sessionCount} />
          </Col>
          <Col span={4}>
            <Statistic title="任务数" value={tenant.stats.taskCount} />
          </Col>
          <Col span={4}>
            <Statistic title="工具数" value={tenant.stats.toolCount} />
          </Col>
          <Col span={4}>
            <Statistic title="连接器数" value={tenant.stats.connectorCount} />
          </Col>
        </Row>
      </Card>

      <Card title="默认能力与限制">
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="最大会话数">
            {tenant.limits.maxSessions === 0 ? '不限制' : tenant.limits.maxSessions}
          </Descriptions.Item>
          <Descriptions.Item label="最大任务数">
            {tenant.limits.maxTasks === 0 ? '不限制' : tenant.limits.maxTasks}
          </Descriptions.Item>
          <Descriptions.Item label="数据隔离策略">
            {iso.dataIsolationStrategy === 'strict' ? '严格隔离' : '共享'}
          </Descriptions.Item>
          <Descriptions.Item label="限制跨租户访问">
            {iso.restrictCrossTenant ? '是' : '否'}
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </>
  );
}
