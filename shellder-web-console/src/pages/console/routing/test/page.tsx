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
  Select,
  Space,
  Switch,
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
  CAPABILITY_TYPE_OPTIONS,
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
  const [simulateDirected, setSimulateDirected] = useState(false);
  const [pinnedCapabilityType, setPinnedCapabilityType] = useState<CapabilityType>('query');

  const activeTenantName = useMemo(
    () => tenants.find((t) => t.id === activeTenantId)?.name,
    [tenants, activeTenantId],
  );

  const handleTest = async () => {
    if (!activeTenantId) { message.warning('请先选择租户'); return; }
    if (!input.trim()) { message.warning('请输入测试语句'); return; }
    if (simulateDirected && !pinnedCapabilityType) {
      message.warning('请选择模拟定向的能力类型');
      return;
    }
    setRunning(true);
    try {
      const res = await testRouting({
        tenantId: activeTenantId,
        input: input.trim(),
        ...(simulateDirected ? { pinnedCapabilityType } : {}),
      });
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

  const renderCapabilityTag = (type: string) => {
    const meta = CAPABILITY_TYPE_META[type as CapabilityType];
    return meta ? <Tag color={meta.color}>{meta.label}</Tag> : type;
  };

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
            description="输入测试语句，验证两阶段路由：Stage1 能力类型判定 + Stage2 能力内规则匹配。"
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
              <Space wrap>
                <Space>
                  <Switch
                    checked={simulateDirected}
                    onChange={setSimulateDirected}
                  />
                  <Typography.Text>模拟定向（跳过 Stage1）</Typography.Text>
                </Space>
                {simulateDirected && (
                  <Select
                    style={{ width: 160 }}
                    value={pinnedCapabilityType}
                    options={CAPABILITY_TYPE_OPTIONS}
                    onChange={setPinnedCapabilityType}
                    placeholder="选择能力类型"
                  />
                )}
              </Space>
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
              <Descriptions column={2} bordered size="small" className="mb-4">
                <Descriptions.Item label="最终能力类型">
                  {renderCapabilityTag(result.capabilityType)}
                </Descriptions.Item>
                <Descriptions.Item label="能力名称">{result.capabilityName}</Descriptions.Item>
                <Descriptions.Item label="需人工确认" span={2}>
                  {result.needConfirmation
                    ? <Tag color="orange">是</Tag>
                    : <Typography.Text type="secondary">否</Typography.Text>}
                </Descriptions.Item>
                <Descriptions.Item label="合并说明" span={2}>{result.reason}</Descriptions.Item>
              </Descriptions>

              {result.typeStage && (
                <>
                  <Typography.Title level={5}>Stage1 — 能力类型</Typography.Title>
                  <Descriptions column={2} bordered size="small" className="mb-4">
                    <Descriptions.Item label="判定方式">
                      {result.typeStage.pinned
                        ? <Tag color="purple">定向锁定</Tag>
                        : <Tag color="blue">自动路由</Tag>}
                    </Descriptions.Item>
                    <Descriptions.Item label="置信度">
                      {(result.typeStage.confidence * 100).toFixed(0)}%
                    </Descriptions.Item>
                    <Descriptions.Item label="说明" span={2}>
                      {result.typeStage.reason}
                    </Descriptions.Item>
                  </Descriptions>
                </>
              )}

              {result.intraStage && (
                <>
                  <Typography.Title level={5}>Stage2 — 能力内</Typography.Title>
                  <Descriptions column={2} bordered size="small" className="mb-4">
                    <Descriptions.Item label="命中规则">
                      {result.intraStage.ruleName
                        ? (
                          <Typography.Link href={`/console/routing/rules?ruleId=${result.intraStage.ruleId}`}>
                            {result.intraStage.ruleName}
                          </Typography.Link>
                        )
                        : <Typography.Text type="secondary">无</Typography.Text>}
                    </Descriptions.Item>
                    <Descriptions.Item label="Tool 类型">
                      {result.intraStage.toolKind ?? <Typography.Text type="secondary">—</Typography.Text>}
                    </Descriptions.Item>
                    {result.intraStage.signalToolCode && (
                      <Descriptions.Item label="信号 toolCode" span={2}>
                        {result.intraStage.signalToolCode}
                      </Descriptions.Item>
                    )}
                    <Descriptions.Item label="说明" span={2}>
                      {result.intraStage.reason}
                    </Descriptions.Item>
                    <Descriptions.Item label="Tool 数量">
                      {result.intraStage.toolIds.length}
                    </Descriptions.Item>
                    {result.intraStage.toolIds.length > 0 && (
                      <Descriptions.Item label="Tool IDs" span={2}>
                        {result.intraStage.toolIds.join(', ')}
                      </Descriptions.Item>
                    )}
                  </Descriptions>
                </>
              )}

              {result.candidates.length > 0 && (
                <>
                  <Typography.Title level={5} className="!mt-4">Stage1 候选能力</Typography.Title>
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
