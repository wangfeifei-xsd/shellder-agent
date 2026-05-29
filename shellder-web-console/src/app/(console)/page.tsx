'use client';

import {
  Alert,
  Card,
  Col,
  Empty,
  List,
  Row,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
} from 'antd';
import {
  ApartmentOutlined,
  AuditOutlined,
  BookOutlined,
  CheckCircleOutlined,
  CloudServerOutlined,
  CloseCircleOutlined,
  DashboardOutlined,
  ExclamationCircleOutlined,
  MessageOutlined,
  ToolOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import { useAuth } from '@/components/auth/AuthContext';

interface ToolStats {
  total: number;
  success: number;
  failed: number;
  successRate: number;
  failRate: number;
  avgDurationMs: number | null;
}

interface PendingApprovalItem {
  id: string;
  actionType: string;
  actionSummary: string | null;
  riskLevel: string;
  initiatorName: string | null;
  createdAt: string;
}

interface RecentFailedTaskItem {
  id: string;
  title: string | null;
  status: string;
  capabilityType: string | null;
  failReason: string | null;
  createdAt: string;
}

interface DashboardSummary {
  toolStats: ToolStats;
  pendingApprovals: PendingApprovalItem[];
  pendingApprovalCount: number;
  recentFailedTasks: RecentFailedTaskItem[];
  recentFailedTaskCount: number;
}

const RISK_TAG_COLOR: Record<string, string> = {
  high: 'red',
  medium: 'orange',
  low: 'green',
};

const STATUS_LABEL: Record<string, string> = {
  failed: '失败',
  timeout: '超时',
};

const QUICK_LINKS = [
  { href: '/sessions/debug', icon: <MessageOutlined />, label: '会话调试' },
  { href: '/tools', icon: <ToolOutlined />, label: '工具管理' },
  { href: '/connectors', icon: <CloudServerOutlined />, label: '连接器管理' },
  { href: '/audit', icon: <AuditOutlined />, label: '审计中心' },
  { href: '/skills', icon: <BookOutlined />, label: '技能书管理' },
  { href: '/routing/capabilities', icon: <ApartmentOutlined />, label: '能力路由' },
];

export default function DashboardPage() {
  const { activeTenantId } = useActiveTenant();
  const { hasMenu } = useAuth();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<DashboardSummary>('api/v1/dashboard/summary', {
        query: { tenantId: activeTenantId },
      });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spin tip="加载中…" size="large" />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" showIcon message="工作台加载失败" description={error} />;
  }

  if (!data) return null;

  const { toolStats, pendingApprovals, pendingApprovalCount, recentFailedTasks, recentFailedTaskCount } = data;

  const filteredQuickLinks = QUICK_LINKS.filter((link) => {
    const menuKey = getMenuKeyForPath(link.href);
    return !menuKey || hasMenu(menuKey);
  });

  return (
    <div>
      <Typography.Title level={3} className="!mb-6">
        <DashboardOutlined className="mr-2" />
        工作台
      </Typography.Title>

      {/* 工具调用统计卡片 */}
      <Card title="工具调用统计（近 7 天）" className="mb-6">
        {toolStats.total === 0 ? (
          <Empty description="暂无工具调用数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Row gutter={[24, 16]}>
            <Col xs={12} sm={8} md={4}>
              <Statistic title="总调用" value={toolStats.total} />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Statistic
                title="成功"
                value={toolStats.success}
                valueStyle={{ color: '#52c41a' }}
                prefix={<CheckCircleOutlined />}
              />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Statistic
                title="失败"
                value={toolStats.failed}
                valueStyle={{ color: '#ff4d4f' }}
                prefix={<CloseCircleOutlined />}
              />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Statistic
                title="成功率"
                value={toolStats.successRate}
                suffix="%"
                valueStyle={{ color: '#52c41a' }}
              />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Statistic
                title="失败率"
                value={toolStats.failRate}
                suffix="%"
                valueStyle={{ color: toolStats.failRate > 10 ? '#ff4d4f' : '#faad14' }}
              />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Statistic
                title="平均响应"
                value={toolStats.avgDurationMs ?? '-'}
                suffix={toolStats.avgDurationMs !== null ? 'ms' : ''}
              />
            </Col>
          </Row>
        )}
      </Card>

      <Row gutter={[16, 16]}>
        {/* 高风险动作待确认 */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <WarningOutlined style={{ color: '#faad14' }} />
                <span>高风险动作待确认</span>
                {pendingApprovalCount > 0 && (
                  <Tag color="orange">{pendingApprovalCount}</Tag>
                )}
              </Space>
            }
            extra={<Link href="/approvals">查看全部</Link>}
          >
            {pendingApprovals.length === 0 ? (
              <Empty description="暂无待确认事项" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <List
                size="small"
                dataSource={pendingApprovals}
                renderItem={(item) => (
                  <List.Item
                    key={item.id}
                    actions={[
                      <Link key="detail" href={`/approvals/${item.id}`}>
                        处理
                      </Link>,
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space>
                          <span>{item.actionType}</span>
                          <Tag color={RISK_TAG_COLOR[item.riskLevel] ?? 'default'}>
                            {item.riskLevel}
                          </Tag>
                        </Space>
                      }
                      description={
                        <span className="text-xs text-gray-400">
                          {item.initiatorName ?? '系统'} · {formatTime(item.createdAt)}
                        </span>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        {/* 最近异常任务 */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                <span>最近异常任务</span>
                {recentFailedTaskCount > 0 && (
                  <Tag color="red">{recentFailedTaskCount}</Tag>
                )}
              </Space>
            }
            extra={<Link href="/tasks">查看全部</Link>}
          >
            {recentFailedTasks.length === 0 ? (
              <Empty description="暂无异常任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <List
                size="small"
                dataSource={recentFailedTasks}
                renderItem={(item) => (
                  <List.Item key={item.id}>
                    <List.Item.Meta
                      title={
                        <Space>
                          <span>{item.title ?? item.id.slice(0, 8)}</span>
                          <Tag color={item.status === 'failed' ? 'red' : 'orange'}>
                            {STATUS_LABEL[item.status] ?? item.status}
                          </Tag>
                          {item.capabilityType && (
                            <Tag>{item.capabilityType}</Tag>
                          )}
                        </Space>
                      }
                      description={
                        <span className="text-xs text-gray-400">
                          {item.failReason
                            ? truncateText(item.failReason, 60)
                            : '无失败原因'}
                          {' · '}
                          {formatTime(item.createdAt)}
                        </span>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* 快捷入口 */}
      <Card title="快捷入口" className="mt-4">
        <Row gutter={[16, 16]}>
          {filteredQuickLinks.map((link) => (
            <Col xs={12} sm={8} md={4} key={link.href}>
              <Link href={link.href}>
                <Card
                  hoverable
                  className="text-center"
                  styles={{ body: { padding: '20px 12px' } }}
                >
                  <div className="mb-2 text-2xl text-blue-500">{link.icon}</div>
                  <div className="text-sm">{link.label}</div>
                </Card>
              </Link>
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function truncateText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function getMenuKeyForPath(path: string): string | undefined {
  const map: Record<string, string> = {
    '/sessions/debug': 'session',
    '/tools': 'tool',
    '/connectors': 'connector',
    '/audit': 'audit',
    '/skills': 'skill',
    '/routing/capabilities': 'routing',
  };
  return map[path];
}
