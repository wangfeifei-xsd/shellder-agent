'use client';

import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Row,
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
} from '@ant-design/icons';
import { useCallback, useRef, useState } from 'react';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import { apiFetch, API_BASE_URL } from '@/lib/api';

const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;

type CapabilityType = 'qa' | 'query' | 'action' | 'workflow';

interface CapabilityResult {
  capabilityType: CapabilityType;
  data: Record<string, unknown>;
  citations?: { documentTitle?: string; content: string; score?: number }[];
  steps?: { seq: number; name: string; status: string; durationMs?: number; error?: string }[];
  status: 'success' | 'failed' | 'partial' | 'pending_confirm';
  error?: string;
}

interface DemoSession {
  sessionId: string;
  capabilityType?: string;
  result?: CapabilityResult;
  streaming: boolean;
  chunks: string[];
  error?: string;
}

const CAPABILITY_META: Record<CapabilityType, { label: string; color: string; icon: React.ReactNode; desc: string }> = {
  qa: { label: '问答型', color: 'cyan', icon: <MessageOutlined />, desc: '基于知识库回答问题，返回引用依据' },
  query: { label: '查询型', color: 'geekblue', icon: <SearchOutlined />, desc: '执行只读 SQL 查询，返回结构化数据' },
  action: { label: '操作型', color: 'orange', icon: <ThunderboltOutlined />, desc: '调用外部 HTTP 执行单步操作' },
  workflow: { label: '流程型', color: 'purple', icon: <NodeIndexOutlined />, desc: '多步骤编排，串联查询/操作/通知' },
};

export default function CapabilitiesPage() {
  const { message } = App.useApp();
  const { activeTenantId } = useActiveTenant();
  const [selectedType, setSelectedType] = useState<CapabilityType>('qa');
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<DemoSession | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const handleSend = useCallback(async () => {
    if (!inputText.trim()) {
      message.warning('请输入测试内容');
      return;
    }
    if (!activeTenantId) {
      message.warning('请先选择操作租户');
      return;
    }

    setLoading(true);
    setSession(null);

    try {
      const sessionRes = await apiFetch<{ id: string }>('/api/v1/sessions', {
        method: 'POST',
        body: { tenantId: activeTenantId, capabilityType: selectedType },
      });

      const sessionId = sessionRes.id;
      const newSession: DemoSession = {
        sessionId,
        streaming: true,
        chunks: [],
      };
      setSession(newSession);

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const token = typeof window !== 'undefined'
        ? window.localStorage.getItem('shellder.accessToken') ?? ''
        : '';

      const evtUrl = `${API_BASE_URL}/api/v1/sessions/${sessionId}/stream?token=${encodeURIComponent(token)}`;
      const eventSource = new EventSource(evtUrl);
      eventSourceRef.current = eventSource;

      const chunks: string[] = [];

      eventSource.addEventListener('delta', (e) => {
        const data = JSON.parse(e.data);
        chunks.push(data.text ?? '');
        setSession((prev) => prev ? { ...prev, chunks: [...chunks] } : prev);
      });

      eventSource.addEventListener('done', (e) => {
        const data = JSON.parse(e.data);
        setSession((prev) => prev ? { ...prev, streaming: false, capabilityType: data.capabilityType } : prev);
        eventSource.close();
        setLoading(false);
      });

      eventSource.addEventListener('error', (e) => {
        if (eventSource.readyState === EventSource.CLOSED) return;
        try {
          const data = JSON.parse((e as MessageEvent).data ?? '{}');
          setSession((prev) => prev ? { ...prev, streaming: false, error: data.message } : prev);
        } catch {
          setSession((prev) => prev ? { ...prev, streaming: false, error: '连接异常' } : prev);
        }
        eventSource.close();
        setLoading(false);
      });

      eventSource.onerror = () => {
        eventSource.close();
        setSession((prev) => prev ? { ...prev, streaming: false } : prev);
        setLoading(false);
      };

      const sendRes = await apiFetch<{ messageId: string; capabilityType?: string; reply?: unknown }>(
        `/api/v1/sessions/${sessionId}/messages`,
        {
          method: 'POST',
          body: { content: inputText, mode: 'sync' },
        },
      );

      if (sendRes.reply && typeof sendRes.reply === 'object') {
        const reply = sendRes.reply as CapabilityResult;
        setSession((prev) => prev ? {
          ...prev,
          streaming: false,
          capabilityType: sendRes.capabilityType,
          result: reply,
        } : prev);
      }

      eventSource.close();
      setLoading(false);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      message.error(`执行失败：${errMsg}`);
      setSession((prev) => prev ? { ...prev, streaming: false, error: errMsg } : prev);
      setLoading(false);
    }
  }, [inputText, activeTenantId, selectedType, message]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Title level={3}>四类业务能力</Title>
      <Paragraph type="secondary">
        演示与测试平台四类能力：问答型、查询型、操作型、流程型。选择能力类型后输入测试内容即可触发端到端执行。
      </Paragraph>

      <Row gutter={[16, 16]} className="mb-6">
        {(Object.entries(CAPABILITY_META) as [CapabilityType, typeof CAPABILITY_META['qa']][]).map(
          ([type, meta]) => (
            <Col key={type} xs={24} sm={12} md={6}>
              <Card
                hoverable
                className={selectedType === type ? 'border-blue-500 border-2' : ''}
                onClick={() => setSelectedType(type)}
              >
                <Space direction="vertical" size={4} className="w-full text-center">
                  <Tag color={meta.color} className="text-base px-3 py-1">
                    {meta.icon} {meta.label}
                  </Tag>
                  <Text type="secondary" className="text-xs">{meta.desc}</Text>
                </Space>
              </Card>
            </Col>
          ),
        )}
      </Row>

      <Card className="mb-6">
        <Space.Compact className="w-full">
          <Select
            value={selectedType}
            onChange={setSelectedType}
            options={Object.entries(CAPABILITY_META).map(([k, v]) => ({
              value: k,
              label: `${v.label}`,
            }))}
            className="w-36"
          />
          <TextArea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="输入测试内容..."
            autoSize={{ minRows: 1, maxRows: 4 }}
            className="flex-1"
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button
            type="primary"
            icon={loading ? <LoadingOutlined /> : <SendOutlined />}
            onClick={handleSend}
            loading={loading}
          >
            发送
          </Button>
        </Space.Compact>
      </Card>

      {session && (
        <Card title="执行结果" className="mb-6">
          {session.error && (
            <Alert type="error" message={session.error} className="mb-4" />
          )}

          {session.streaming && (
            <div className="mb-4">
              <Spin indicator={<LoadingOutlined />} /> <Text type="secondary">执行中...</Text>
            </div>
          )}

          {session.chunks.length > 0 && (
            <Card type="inner" title="输出内容" className="mb-4">
              <Paragraph className="whitespace-pre-wrap">{session.chunks.join('')}</Paragraph>
            </Card>
          )}

          {session.result && (
            <>
              <Descriptions bordered size="small" column={2} className="mb-4">
                <Descriptions.Item label="能力类型">
                  <Tag color={CAPABILITY_META[session.result.capabilityType]?.color}>
                    {CAPABILITY_META[session.result.capabilityType]?.label}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="执行状态">
                  <Tag color={session.result.status === 'success' ? 'green' : session.result.status === 'failed' ? 'red' : 'orange'}>
                    {session.result.status}
                  </Tag>
                </Descriptions.Item>
              </Descriptions>

              {session.result.citations && session.result.citations.length > 0 && (
                <Card type="inner" title="引用依据" className="mb-4">
                  <Table
                    dataSource={session.result.citations}
                    rowKey={(_, i) => String(i)}
                    size="small"
                    pagination={false}
                    columns={[
                      { title: '文档', dataIndex: 'documentTitle', width: 160 },
                      { title: '内容', dataIndex: 'content', ellipsis: true },
                      { title: '相关度', dataIndex: 'score', width: 80, render: (v) => v?.toFixed(2) ?? '—' },
                    ]}
                  />
                </Card>
              )}

              {session.result.steps && session.result.steps.length > 0 && (
                <Card type="inner" title="流程步骤">
                  <Timeline
                    items={session.result.steps.map((step) => ({
                      color: step.status === 'completed' ? 'green' : step.status === 'failed' ? 'red' : 'gray',
                      children: (
                        <div>
                          <Text strong>步骤 {step.seq}: {step.name}</Text>
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

              {session.result.data && (session.result.data as any).rows && (
                <Card type="inner" title="查询结果" className="mb-4">
                  <Text type="secondary">共 {(session.result.data as any).rowCount} 条</Text>
                  <Table
                    dataSource={(session.result.data as any).rows?.slice(0, 20)}
                    rowKey={(_, i) => String(i)}
                    size="small"
                    scroll={{ x: true }}
                    pagination={false}
                    columns={
                      (session.result.data as any).rows?.[0]
                        ? Object.keys((session.result.data as any).rows[0]).map((col) => ({
                            title: col,
                            dataIndex: col,
                            ellipsis: true,
                          }))
                        : []
                    }
                  />
                </Card>
              )}
            </>
          )}

          {!session.result && !session.streaming && session.chunks.length === 0 && !session.error && (
            <Empty description="无执行结果" />
          )}
        </Card>
      )}

      {!session && (
        <Card>
          <Empty description="输入测试内容并发送以触发能力执行" />
        </Card>
      )}
    </div>
  );
}
