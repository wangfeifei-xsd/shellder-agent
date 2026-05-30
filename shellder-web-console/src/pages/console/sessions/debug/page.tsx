'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  App,
  Breadcrumb,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Space,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import {
  BugOutlined,
  ClearOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import {
  CAPABILITY_TYPE_META,
  CapabilityType,
  MESSAGE_TYPE_META,
  MessageItem,
  MessageType,
  SESSION_STATUS_META,
  SessionItem,
  buildSseUrl,
  createDebugSession,
  getSession,
  listSessionMessages,
  sendMessage,
} from '@/lib/session';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

interface SseEventData {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export default function DebugConsolePage() {
  const { message: antMessage } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();
  const [searchParams] = useSearchParams();
  const initialSessionId = searchParams.get('sessionId');

  const [debugSession, setDebugSession] = useState<SessionItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [sseEvents, setSseEvents] = useState<SseEventData[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [scenario, setScenario] = useState('');

  const sseRef = useRef<EventSource | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeTenantName = tenants.find((t) => t.id === activeTenantId)?.name;

  useEffect(() => {
    if (initialSessionId) {
      getSession(initialSessionId)
        .then((detail) => {
          setDebugSession(detail);
          setMessages(detail.messages);
        })
        .catch((err) => {
          antMessage.error(err instanceof Error ? err.message : '加载会话失败');
        });
    }
  }, [initialSessionId, antMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      sseRef.current?.close();
    };
  }, []);

  const handleCreateDebug = async () => {
    if (!activeTenantId) {
      antMessage.warning('请先在顶栏选择「当前操作租户」');
      return;
    }
    setCreating(true);
    try {
      const session = await createDebugSession({
        tenantId: activeTenantId,
        scenario: scenario || undefined,
      });
      setDebugSession(session);
      setMessages([]);
      setSseEvents([]);
      antMessage.success('调试会话已创建');
    } catch (err) {
      antMessage.error(err instanceof Error ? err.message : '创建调试会话失败');
    } finally {
      setCreating(false);
    }
  };

  const refreshMessages = useCallback(async () => {
    if (!debugSession) return;
    try {
      const res = await listSessionMessages(debugSession.id, { pageSize: 100 });
      setMessages(res.items);
    } catch {
      // ignore
    }
  }, [debugSession]);

  const handleSend = async () => {
    if (!debugSession || !inputText.trim()) return;
    setSending(true);

    sseRef.current?.close();

    const token = typeof window !== 'undefined'
      ? window.localStorage.getItem('shellder.accessToken')
      : null;
    const sseUrl = buildSseUrl(debugSession.id);

    const eventSource = new EventSource(
      `${sseUrl}${sseUrl.includes('?') ? '&' : '?'}token=${token ?? ''}`,
    );
    sseRef.current = eventSource;

    eventSource.onopen = () => {
      setSseEvents((prev) => [
        ...prev,
        { event: 'connected', data: {}, timestamp: new Date().toISOString() },
      ]);
    };

    const handleSseEvent = (type: string) => (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        setSseEvents((prev) => [
          ...prev,
          { event: type, data, timestamp: new Date().toISOString() },
        ]);

        if (type === 'done' || type === 'error') {
          eventSource.close();
          void refreshMessages();
          setSending(false);
        }
      } catch {
        // ignore parse errors
      }
    };

    for (const type of ['delta', 'tool_start', 'tool_end', 'confirm_required', 'done', 'error']) {
      eventSource.addEventListener(type, handleSseEvent(type));
    }

    eventSource.onerror = () => {
      setSseEvents((prev) => [
        ...prev,
        { event: 'sse_error', data: { message: 'SSE 连接断开' }, timestamp: new Date().toISOString() },
      ]);
      eventSource.close();
      void refreshMessages();
      setSending(false);
    };

    try {
      const result = await sendMessage(debugSession.id, {
        content: inputText.trim(),
        mode: 'stream',
      });

      setMessages((prev) => [
        ...prev,
        {
          id: result.messageId,
          type: 'user' as MessageType,
          role: 'user' as const,
          content: { text: inputText.trim() },
          seq: prev.length + 1,
          createdAt: new Date().toISOString(),
        },
      ]);
      setInputText('');
    } catch (err) {
      antMessage.error(err instanceof Error ? err.message : '发送消息失败');
      eventSource.close();
      setSending(false);
    }
  };

  const handleClearEvents = () => setSseEvents([]);

  return (
    <>
      <Breadcrumb
        className="mb-4"
        items={[
          { title: <Link to="/sessions">会话管理</Link> },
          { title: '调试台' },
        ]}
      />

      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">
          <BugOutlined className="mr-2" />
          调试台
        </Typography.Title>
      </div>

      {!activeTenantId ? (
        <Alert
          type="warning"
          showIcon
          message="请先在顶栏选择「当前操作租户」"
          description="调试台需要指定租户上下文。"
        />
      ) : (
        <div className="flex gap-4" style={{ minHeight: 'calc(100vh - 240px)' }}>
          {/* 左侧：会话 & 消息 */}
          <div className="flex flex-1 flex-col">
            {!debugSession ? (
              <Card>
                <Typography.Title level={5}>创建调试会话</Typography.Title>
                <Alert
                  className="mb-3"
                  type="info"
                  showIcon
                  message={`当前租户：${activeTenantName ?? activeTenantId}`}
                />
                <Space direction="vertical" className="w-full">
                  <Input
                    placeholder="场景描述（可选）"
                    value={scenario}
                    onChange={(e) => setScenario(e.target.value)}
                  />
                  <Button
                    type="primary"
                    icon={<BugOutlined />}
                    loading={creating}
                    onClick={handleCreateDebug}
                  >
                    创建调试会话
                  </Button>
                </Space>
              </Card>
            ) : (
              <>
                {/* 会话信息 */}
                <Card size="small" className="mb-3">
                  <Descriptions column={4} size="small">
                    <Descriptions.Item label="会话">
                      <Link to={`/sessions/${debugSession.id}`}>
                        {debugSession.title ?? debugSession.id.slice(0, 8)}
                      </Link>
                    </Descriptions.Item>
                    <Descriptions.Item label="状态">
                      <Tag color={SESSION_STATUS_META[debugSession.status].color}>
                        {SESSION_STATUS_META[debugSession.status].label}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="能力类型">
                      {debugSession.capabilityType ? (
                        <Tag
                          color={
                            CAPABILITY_TYPE_META[debugSession.capabilityType]?.color
                          }
                        >
                          {CAPABILITY_TYPE_META[debugSession.capabilityType]?.label}
                        </Tag>
                      ) : (
                        '—'
                      )}
                    </Descriptions.Item>
                    <Descriptions.Item label="租户">{activeTenantName ?? activeTenantId}</Descriptions.Item>
                  </Descriptions>
                </Card>

                {/* 消息区域 */}
                <Card
                  className="mb-3 flex-1 overflow-auto"
                  bodyStyle={{ maxHeight: 400, overflowY: 'auto' }}
                  size="small"
                  title={`消息（${messages.length}）`}
                >
                  {messages.length === 0 ? (
                    <Empty description="发送消息开始调试" />
                  ) : (
                    <div>
                      {messages.map((m) => (
                        <DebugMessageBubble key={m.id} msg={m} />
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </Card>

                {/* 输入区域 */}
                <Space.Compact className="w-full">
                  <Input
                    placeholder="输入消息..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onPressEnter={handleSend}
                    disabled={sending}
                  />
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    loading={sending}
                    onClick={handleSend}
                    disabled={!inputText.trim()}
                  >
                    发送
                  </Button>
                  <Button onClick={handleCreateDebug} loading={creating}>
                    新建会话
                  </Button>
                </Space.Compact>
              </>
            )}
          </div>

          {/* 右侧：SSE 事件轨迹 */}
          {debugSession && (
            <div className="w-96 flex-shrink-0">
              <Card
                size="small"
                title="SSE 事件轨迹"
                extra={
                  <Button size="small" icon={<ClearOutlined />} onClick={handleClearEvents}>
                    清空
                  </Button>
                }
                bodyStyle={{ maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}
              >
                {sseEvents.length === 0 ? (
                  <Empty description="发送消息后查看事件" />
                ) : (
                  <Timeline
                    items={sseEvents.map((ev, i) => ({
                      color: eventColor(ev.event),
                      children: <SseEventItem key={i} ev={ev} />,
                    }))}
                  />
                )}
              </Card>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function eventColor(event: string) {
  switch (event) {
    case 'delta': return 'green';
    case 'tool_start': return 'orange';
    case 'tool_end': return 'orange';
    case 'confirm_required': return 'red';
    case 'done': return 'blue';
    case 'error':
    case 'sse_error': return 'red';
    default: return 'gray';
  }
}

const EVENT_LABELS: Record<string, string> = {
  connected: '已连接',
  delta: '文本流',
  tool_start: 'Tool 开始',
  tool_end: 'Tool 结束',
  confirm_required: '需确认',
  done: '完成',
  error: '错误',
  sse_error: 'SSE 断开',
};

function SseEventItem({ ev }: { ev: SseEventData }) {
  return (
    <div className="text-xs">
      <Space size="small" className="mb-1">
        <Tag color={eventColor(ev.event)}>{EVENT_LABELS[ev.event] ?? ev.event}</Tag>
        <Typography.Text type="secondary">
          {new Date(ev.timestamp).toLocaleTimeString('zh-CN')}
        </Typography.Text>
      </Space>
      {ev.event === 'delta' && ev.data.text ? (
        <div className="rounded bg-green-50 px-2 py-1">{String(ev.data.text)}</div>
      ) : null}
      {ev.event === 'tool_start' ? (
        <div className="rounded bg-orange-50 px-2 py-1">
          <strong>{String(ev.data.toolName ?? '')}</strong>
          {ev.data.input ? (
            <pre className="mt-1 max-h-20 overflow-auto text-[10px]">
              {JSON.stringify(ev.data.input, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
      {ev.event === 'tool_end' ? (
        <div className="rounded bg-orange-50 px-2 py-1">
          <strong>{String(ev.data.toolName ?? '')}</strong>
          <Tag
            className="ml-2"
            color={ev.data.status === 'success' ? 'green' : 'red'}
          >
            {String(ev.data.status ?? '')}
          </Tag>
          {ev.data.durationMs ? (
            <Typography.Text type="secondary"> {String(ev.data.durationMs)}ms</Typography.Text>
          ) : null}
          {ev.data.output ? (
            <pre className="mt-1 max-h-20 overflow-auto text-[10px]">
              {JSON.stringify(ev.data.output, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
      {ev.event === 'confirm_required' ? (
        <div className="rounded bg-red-50 px-2 py-1">
          原因：{String(ev.data.reason ?? '—')}
        </div>
      ) : null}
      {ev.event === 'done' ? (
        <div className="rounded bg-blue-50 px-2 py-1">
          {ev.data.capabilityType ? (
            <Tag>
              {CAPABILITY_TYPE_META[ev.data.capabilityType as CapabilityType]?.label ??
                String(ev.data.capabilityType)}
            </Tag>
          ) : null}
          {ev.data.summary ? <span>{String(ev.data.summary)}</span> : null}
        </div>
      ) : null}
      {(ev.event === 'error' || ev.event === 'sse_error') && (
        <div className="rounded bg-red-50 px-2 py-1 text-red-600">
          {String(ev.data.message ?? ev.data.code ?? '未知错误')}
        </div>
      )}
    </div>
  );
}

function DebugMessageBubble({ msg }: { msg: MessageItem }) {
  const content = msg.content as Record<string, unknown>;
  const text = typeof content.text === 'string' ? content.text : null;
  const isUser = msg.type === 'user';

  return (
    <div className={`mb-3 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          isUser ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'
        }`}
      >
        {!isUser && (
          <div className="mb-1">
            <Tag color={MESSAGE_TYPE_META[msg.type]?.color}>
              {MESSAGE_TYPE_META[msg.type]?.label ?? msg.type}
            </Tag>
          </div>
        )}
        <div className="whitespace-pre-wrap break-all">
          {text ?? JSON.stringify(content, null, 2)}
        </div>
        <div className={`mt-1 text-[10px] ${isUser ? 'text-blue-200' : 'text-gray-400'}`}>
          {fmt(msg.createdAt)}
        </div>
      </div>
    </div>
  );
}
