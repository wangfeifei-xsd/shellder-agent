'use client';

import { SendOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import {
  ellipsisTextColumn,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import {
  CAPABILITY_TYPE_META,
  CapabilityType,
  RoutingCandidate,
  RoutingTestResult,
  testRouting,
} from '@/lib/capability';

export default function RoutingTestPage() {
  const { message } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();

  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RoutingTestResult | undefined>();

  const activeTenantName = useMemo(
    () => tenants.find((t) => t.id === activeTenantId)?.name,
    [tenants, activeTenantId],
  );

  const handleTest = async () => {
    if (!activeTenantId) { message.warning('请先选择租户'); return; }
    if (!input.trim()) { message.warning('请输入测试语句'); return; }
    setRunning(true);
    try {
      const res = await testRouting({ tenantId: activeTenantId, input: input.trim() });
      setResult(res);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '路由测试失败');
    } finally {
      setRunning(false);
    }
  };

  const candidateColumns: ColumnsType<RoutingCandidate> = [
    ellipsisTextColumn<RoutingCandidate>('能力名称', 'capabilityName', 180),
    withNowrap<RoutingCandidate>({
      title: '类型',
      dataIndex: 'type',
      width: 100,
      render: (t: string) => {
        const meta = CAPABILITY_TYPE_META[t as CapabilityType];
        return meta ? <Tag color={meta.color}>{meta.label}</Tag> : t;
      },
    }),
    ellipsisTextColumn<RoutingCandidate>('得分', 'score', 80),
    withNowrap<RoutingCandidate>({
      title: '可调用工具数',
      dataIndex: 'toolIds',
      width: 100,
      render: (ids: string[]) => ids?.length ?? 0,
    }),
  ];

  return (
    <>
      <div className="mb-4">
        <Typography.Title level={3} className="!mb-0">路由测试</Typography.Title>
      </div>

      {!activeTenantId ? (
        <Alert type="warning" showIcon message="请先在顶栏选择「当前操作租户」" />
      ) : (
        <>
          <Alert
            className="mb-4"
            type="info"
            showIcon
            message={`当前租户：${activeTenantName ?? activeTenantId}`}
            description="输入测试语句，验证路由引擎将其路由到哪类能力，查看命中理由、候选能力、是否需确认。"
          />

          <Card className="mb-4">
            <Space direction="vertical" className="w-full" size="middle">
              <Input.TextArea
                rows={3}
                placeholder="输入测试语句，如：帮我查一下今天的订单数量"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); void handleTest(); } }}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={running}
                onClick={handleTest}
              >
                执行路由测试
              </Button>
            </Space>
          </Card>

          {result && (
            <Card title="路由结果">
              <Descriptions column={2} bordered size="small">
                <Descriptions.Item label="命中能力类型">
                  {(() => {
                    const meta = CAPABILITY_TYPE_META[result.capabilityType as CapabilityType];
                    return meta
                      ? <Tag color={meta.color}>{meta.label}</Tag>
                      : result.capabilityType;
                  })()}
                </Descriptions.Item>
                <Descriptions.Item label="能力名称">{result.capabilityName}</Descriptions.Item>
                <Descriptions.Item label="需人工确认" span={2}>
                  {result.needConfirmation
                    ? <Tag color="orange">是</Tag>
                    : <Typography.Text type="secondary">否</Typography.Text>}
                </Descriptions.Item>
                <Descriptions.Item label="路由理由" span={2}>{result.reason}</Descriptions.Item>
              </Descriptions>

              {result.candidates.length > 0 && (
                <>
                  <Typography.Title level={5} className="!mt-4">候选能力</Typography.Title>
                  <Table<RoutingCandidate>
                    rowKey="capabilityId"
                    size="small"
                    columns={candidateColumns}
                    dataSource={result.candidates}
                    pagination={false}
                    locale={{ emptyText: <Empty description="无候选" /> }}
                    {...tableEllipsisLayout}
                  />
                </>
              )}
            </Card>
          )}
        </>
      )}
    </>
  );
}
