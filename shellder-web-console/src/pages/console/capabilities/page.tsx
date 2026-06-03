'use client';

import {
  Alert,
  App,
  Button,
  Card,
  Collapse,
  Descriptions,
  Empty,
  Input,
  Row,
  Col,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import {
  MessageOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  NodeIndexOutlined,
  SendOutlined,
  LoadingOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ellipsisTextColumn,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import { Link } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import type { CapabilityResult, CapabilityTypeKey } from '@/lib/copilot';
import { extractMessageText } from '@/lib/copilot';
import {
  fetchCapabilityDemoCopilotToken,
  runCopilotStreamRound,
} from '@/lib/copilot-runtime';

const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;

interface CopilotConfigOption {
  id: string;
  name: string;
  status: string;
  app?: { clientId: string; name: string };
}

const CAPABILITY_META: Record<
  CapabilityTypeKey,
  { label: string; color: string; icon: React.ReactNode; desc: string }
> = {
  qa: {
    label: '问答型',
    color: 'cyan',
    icon: <MessageOutlined />,
    desc: '基于知识库检索与生成，返回答案及引用依据',
  },
  query: {
    label: '查询型',
    color: 'geekblue',
    icon: <SearchOutlined />,
    desc: '只读 SQL 查询，结构化表格结果',
  },
  action: {
    label: '操作型',
    color: 'orange',
    icon: <ThunderboltOutlined />,
    desc: '调用外部工具或接口，单步读写与副作用',
  },
  workflow: {
    label: '流程型',
    color: 'purple',
    icon: <NodeIndexOutlined />,
    desc: '多步编排，串联查询、操作与通知',
  },
};

export default function CapabilitiesPage() {
  const { message } = App.useApp();
  const { activeTenantId } = useActiveTenant();

  const [copilotConfigs, setCopilotConfigs] = useState<CopilotConfigOption[]>([]);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [copilotConfigId, setCopilotConfigId] = useState<string | null>(null);

  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streamText, setStreamText] = useState('');
  const [result, setResult] = useState<CapabilityResult | null>(null);
  const [routedType, setRoutedType] = useState<CapabilityTypeKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{
    approvalId: string;
    reason: string;
    toolName?: string;
  } | null>(null);

  const loadCopilotConfigs = useCallback(async () => {
    if (!activeTenantId) {
      setCopilotConfigs([]);
      setCopilotConfigId(null);
      return;
    }
    setConfigsLoading(true);
    try {
      const list = await apiFetch<CopilotConfigOption[]>(
        `/api/v1/copilot/configs?tenantId=${encodeURIComponent(activeTenantId)}`,
      );
      const enabled = list.filter((c) => c.status === 'enabled');
      setCopilotConfigs(enabled);
      setCopilotConfigId((prev) => {
        if (prev && enabled.some((c) => c.id === prev)) return prev;
        return enabled[0]?.id ?? null;
      });
    } catch {
      setCopilotConfigs([]);
      setCopilotConfigId(null);
    } finally {
      setConfigsLoading(false);
    }
  }, [activeTenantId]);

  useEffect(() => {
    setSessionId(null);
    setResult(null);
    setStreamText('');
    setError(null);
    setPendingConfirm(null);
    void loadCopilotConfigs();
  }, [loadCopilotConfigs]);

  const handleSend = useCallback(async () => {
    if (!inputText.trim()) {
      message.warning('请输入测试内容');
      return;
    }
    if (!activeTenantId) {
      message.warning('请先选择操作租户');
      return;
    }
    if (!copilotConfigId) {
      message.warning('请先配置并选择 Copilot 接入');
      return;
    }

    setLoading(true);
    setResult(null);
    setStreamText('');
    setError(null);
    setPendingConfirm(null);

    try {
      const tokenRes = await fetchCapabilityDemoCopilotToken({
        tenantId: activeTenantId,
        copilotConfigId,
      });

      const round = await runCopilotStreamRound({
        token: tokenRes.accessToken,
        content: inputText.trim(),
        sessionId,
        onDelta: (chunk) => setStreamText((prev) => prev + chunk),
      });

      setSessionId(round.sessionId);

      if (round.pendingConfirm) {
        setPendingConfirm(round.pendingConfirm);
      }

      if (round.error) {
        setError(round.error);
        message.error(round.error);
      }

      if (round.capabilityResult) {
        setResult(round.capabilityResult);
        setRoutedType(round.capabilityResult.capabilityType);
        if (round.capabilityResult.status === 'failed') {
          const errText =
            round.capabilityResult.error ??
            (typeof round.capabilityResult.data?.text === 'string'
              ? round.capabilityResult.data.text
              : undefined);
          if (errText) message.error(errText);
        }
      } else if (round.streamText && !round.error) {
        setError('未解析到 CapabilityResult，请检查会话消息结构');
      }

      if (
        round.sessionCapabilityType &&
        CAPABILITY_META[round.sessionCapabilityType as CapabilityTypeKey]
      ) {
        setRoutedType(round.sessionCapabilityType as CapabilityTypeKey);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      message.error(`执行失败：${errMsg}`);
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  }, [inputText, activeTenantId, copilotConfigId, sessionId, message]);

  const displayText =
    result && typeof result.data?.text === 'string'
      ? result.data.text
      : streamText || (result ? extractMessageText(result as unknown as Record<string, unknown>) : '');

  const queryRows = result?.data?.rows as Record<string, unknown>[] | undefined;
  const queryRowCount = result?.data?.rowCount as number | undefined;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Title level={3}>四类业务能力</Title>
      <Paragraph type="secondary">
        与嵌入式 Copilot 使用相同的 <Text code>/copilot/v1</Text> API 与{' '}
        <Text code>CapabilityResult</Text> 业务结构；路由引擎自动识别能力类型。本页为管理端对照视图，样式可与嵌入不同。
      </Paragraph>

      <Card className="mb-4" size="small" title="Copilot 接入（与嵌入一致）">
        {!activeTenantId ? (
          <Alert type="warning" showIcon message="请先在顶栏选择操作租户" />
        ) : configsLoading ? (
          <Spin size="small" />
        ) : copilotConfigs.length === 0 ? (
          <Alert
            type="info"
            showIcon
            message="当前租户暂无已启用的 Copilot 配置"
            description={
              <Link to="/copilot-admin">
                <LinkOutlined /> 前往 Copilot 管理创建配置
              </Link>
            }
          />
        ) : (
          <Select
            className="w-full max-w-md"
            placeholder="选择 Copilot 配置"
            value={copilotConfigId ?? undefined}
            onChange={setCopilotConfigId}
            options={copilotConfigs.map((c) => ({
              value: c.id,
              label: `${c.name}${c.app?.clientId ? ` (${c.app.clientId})` : ''}`,
            }))}
          />
        )}
      </Card>

      <Row gutter={[16, 16]} className="mb-6" align="stretch">
        {(Object.entries(CAPABILITY_META) as [CapabilityTypeKey, (typeof CAPABILITY_META)['qa']][]).map(
          ([type, meta]) => (
            <Col key={type} xs={24} sm={12} md={6} className="flex">
              <Card
                className={`flex h-full min-h-[120px] w-full flex-col ${
                  routedType === type ? 'border-blue-500 border-2' : 'opacity-80'
                }`}
                styles={{
                  body: {
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px',
                  },
                }}
              >
                <Space direction="vertical" size={6} className="w-full text-center">
                  <Tag color={meta.color} className="mx-auto">
                    {meta.icon} {meta.label}
                  </Tag>
                  <Text type="secondary" className="block text-xs leading-relaxed">
                    {meta.desc}
                  </Text>
                </Space>
              </Card>
            </Col>
          ),
        )}
      </Row>

      <Card className="mb-6">
        <TextArea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="输入测试内容（由路由引擎自动识别能力类型）..."
          autoSize={{ minRows: 2, maxRows: 4 }}
          disabled={loading || !copilotConfigId}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button
            onClick={() => {
              setSessionId(null);
              setResult(null);
              setStreamText('');
              setRoutedType(null);
              setError(null);
              setPendingConfirm(null);
            }}
          >
            新会话
          </Button>
          <Button
            type="primary"
            icon={loading ? <LoadingOutlined /> : <SendOutlined />}
            onClick={() => void handleSend()}
            loading={loading}
            disabled={!copilotConfigId || !activeTenantId}
          >
            发送
          </Button>
        </div>
      </Card>

      {(loading || result || streamText || error || pendingConfirm) && (
        <Card title="执行结果" className="mb-6">
          {error && <Alert type="error" message={error} className="mb-4" />}

          {pendingConfirm && (
            <Alert
              type="warning"
              showIcon
              className="mb-4"
              message={pendingConfirm.toolName ? `待确认：${pendingConfirm.toolName}` : '待确认操作'}
              description={
                <>
                  {pendingConfirm.reason}
                  <br />
                  <Text type="secondary">approvalId: {pendingConfirm.approvalId}</Text>
                </>
              }
            />
          )}

          {loading && (
            <div className="mb-4">
              <Spin indicator={<LoadingOutlined />} /> <Text type="secondary">执行中（SSE stream）...</Text>
            </div>
          )}

          {streamText && (
            <Card type="inner" title="流式输出（delta）" className="mb-4">
              <Paragraph className="whitespace-pre-wrap">{streamText}</Paragraph>
            </Card>
          )}

          {result && (
            <>
              <Descriptions bordered size="small" column={2} className="mb-4">
                <Descriptions.Item label="能力类型（路由）">
                  <Tag color={CAPABILITY_META[result.capabilityType]?.color}>
                    {CAPABILITY_META[result.capabilityType]?.label ?? result.capabilityType}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="执行状态">
                  <Tag
                    color={
                      result.status === 'success'
                        ? 'green'
                        : result.status === 'failed'
                          ? 'red'
                          : 'orange'
                    }
                  >
                    {result.status}
                  </Tag>
                </Descriptions.Item>
                {sessionId && (
                  <Descriptions.Item label="会话 ID" span={2}>
                    <Text code copyable>
                      {sessionId}
                    </Text>
                  </Descriptions.Item>
                )}
              </Descriptions>

              {displayText && (
                <Card type="inner" title="回答正文（data.text）" className="mb-4">
                  <Paragraph className="whitespace-pre-wrap">{displayText}</Paragraph>
                </Card>
              )}

              {result.citations && result.citations.length > 0 && (
                <Card type="inner" title="引用依据（citations）" className="mb-4">
                  <Table
                    dataSource={result.citations}
                    rowKey={(_, i) => String(i)}
                    size="small"
                    pagination={false}
                    {...tableEllipsisLayout}
                    columns={[
                      ellipsisTextColumn<{ documentTitle?: string; content: string; score?: number }>(
                        '文档',
                        'documentTitle',
                        160,
                      ),
                      ellipsisTextColumn<{ documentTitle?: string; content: string; score?: number }>(
                        '内容',
                        'content',
                        240,
                      ),
                      withNowrap<{ documentTitle?: string; content: string; score?: number }>({
                        title: '相关度',
                        dataIndex: 'score',
                        width: 80,
                        render: (v: number | undefined) => v?.toFixed(2) ?? '—',
                      }),
                    ]}
                  />
                </Card>
              )}

              {result.steps && result.steps.length > 0 && (
                <Card type="inner" title="流程步骤（steps）">
                  <Timeline
                    items={result.steps.map((step) => ({
                      color:
                        step.status === 'completed'
                          ? 'green'
                          : step.status === 'failed'
                            ? 'red'
                            : 'gray',
                      children: (
                        <div>
                          <Text strong>
                            步骤 {step.seq}: {step.name}
                          </Text>
                          <br />
                          <Text type="secondary">
                            状态: {step.status}
                            {step.durationMs != null && ` | 耗时: ${step.durationMs}ms`}
                            {step.error && ` | 错误: ${step.error}`}
                          </Text>
                        </div>
                      ),
                    }))}
                  />
                </Card>
              )}

              {Array.isArray(queryRows) && queryRows.length > 0 && (
                <Card type="inner" title="查询结果（data.rows）" className="mb-4">
                  <Text type="secondary">共 {queryRowCount ?? queryRows.length} 条</Text>
                  <Table
                    dataSource={queryRows.slice(0, 20)}
                    rowKey={(_, i) => String(i)}
                    size="small"
                    pagination={false}
                    {...tableEllipsisLayout}
                    columns={
                      queryRows[0]
                        ? Object.keys(queryRows[0]).map((col) =>
                            withNowrap<Record<string, unknown>>({
                              title: col,
                              dataIndex: col,
                              ellipsis: true,
                              width: 140,
                            }),
                          )
                        : []
                    }
                  />
                </Card>
              )}
            </>
          )}

          {!result && !loading && streamText && !error && (
            <Empty description="流式已结束，但未解析到 CapabilityResult" />
          )}
        </Card>
      )}

      {!loading && !result && !streamText && !error && (
        <Card>
          <Empty description="选择 Copilot 配置后输入测试内容并发送" />
        </Card>
      )}

      <Collapse
        ghost
        className="mt-2"
        items={[
          {
            key: 'api',
            label: 'API 对照说明',
            children: (
              <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
                <li>
                  换票：<Text code>POST /api/v1/capabilities/demo/copilot-token</Text>（响应同嵌入换票）
                </li>
                <li>
                  会话：<Text code>POST /copilot/v1/sessions</Text> body <Text code>{'{ title? }'}</Text>
                </li>
                <li>
                  消息：<Text code>POST /copilot/v1/sessions/:id/messages</Text> body{' '}
                  <Text code>{'{ content, mode: "stream" }'}</Text>
                </li>
                <li>
                  结果：<Text code>GET /copilot/v1/sessions/:id</Text> → 助手消息 content = CapabilityResult
                </li>
              </ul>
            ),
          },
        ]}
      />
    </div>
  );
}
