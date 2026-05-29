'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Input, Spin, Tag, Tabs, Badge, Empty, List, Timeline, Modal, message } from 'antd';
import {
  SendOutlined,
  HistoryOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  RobotOutlined,
  UserOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type {
  CopilotConfig,
  CopilotMessage,
  CopilotSession,
  CopilotConfirmation,
} from '@/lib/copilot';
import {
  copilotExchangeToken,
  copilotCreateSession,
  copilotSendMessage,
  copilotListSessions,
  copilotGetSession,
  copilotListConfirmations,
  copilotSubmitConfirmation,
  copilotBuildSseUrl,
  copilotGetTask,
} from '@/lib/copilot';

const { TextArea } = Input;

type CopilotTab = 'chat' | 'history' | 'confirmations' | 'tasks';

/**
 * 嵌入式 Copilot 主页面
 * URL: /copilot?clientId=xxx&clientSecret=xxx&tenantId=xxx
 * 也可通过 postMessage 传入凭证。
 */
export default function CopilotPage() {
  const [token, setToken] = useState<string | null>(null);
  const [config, setConfig] = useState<CopilotConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<CopilotTab>('chat');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);

  const [sessions, setSessions] = useState<CopilotSession[]>([]);
  const [confirmations, setConfirmations] = useState<CopilotConfirmation[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // 初始化：从 URL 参数或 postMessage 获取凭证并换票
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const clientId = params.get('clientId');
    const clientSecret = params.get('clientSecret');
    const tenantId = params.get('tenantId') ?? undefined;
    const externalTenantId = params.get('externalTenantId') ?? undefined;
    const externalUserId = params.get('externalUserId') ?? undefined;

    if (clientId && clientSecret) {
      doExchangeToken({ clientId, clientSecret, tenantId, externalTenantId, externalUserId });
    } else {
      // 监听 postMessage（iframe 嵌入场景）
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'copilot:init' && event.data.clientId) {
          doExchangeToken(event.data);
        }
      };
      window.addEventListener('message', handler);
      setLoading(false);
      return () => window.removeEventListener('message', handler);
    }
  }, []);

  const doExchangeToken = async (params: {
    clientId: string;
    clientSecret: string;
    tenantId?: string;
    externalTenantId?: string;
    externalUserId?: string;
  }) => {
    try {
      setLoading(true);
      const result = await copilotExchangeToken(params);
      setToken(result.accessToken);
      setConfig(result.config);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? '换票失败');
    } finally {
      setLoading(false);
    }
  };

  // 自动创建新会话
  const ensureSession = useCallback(async () => {
    if (!token) return null;
    if (sessionId) return sessionId;
    const session = await copilotCreateSession(token);
    setSessionId(session.id);
    return session.id;
  }, [token, sessionId]);

  // 连接 SSE
  const connectSSE = useCallback(
    (sid: string) => {
      if (!token || eventSourceRef.current) return;
      const url = `${copilotBuildSseUrl(sid)}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;
      setStreaming(true);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'message' && data.role === 'assistant') {
            setMessages((prev) => {
              const exists = prev.find((m) => m.id === data.id);
              if (exists) return prev;
              return [
                ...prev,
                {
                  id: data.id,
                  type: data.messageType,
                  role: data.role,
                  content: data.content,
                  seq: data.seq,
                  createdAt: data.createdAt,
                },
              ];
            });
          }
          if (data.type === 'session.snapshot_end') {
            setStreaming(false);
          }
        } catch {}
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        setStreaming(false);
        // 重连
        setTimeout(() => connectSSE(sid), 3000);
      };
    },
    [token],
  );

  // 发送消息
  const handleSend = async () => {
    if (!inputValue.trim() || !token) return;
    setSending(true);
    try {
      const sid = await ensureSession();
      if (!sid) return;

      const userMsg: CopilotMessage = {
        id: `temp-${Date.now()}`,
        type: 'user',
        role: 'user',
        content: { text: inputValue },
        seq: messages.length + 1,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInputValue('');

      const result = await copilotSendMessage(token, sid, inputValue);
      setMessages((prev) =>
        prev.map((m) => (m.id === userMsg.id ? { ...m, id: result.id, seq: result.seq } : m)),
      );

      // 连接 SSE 获取助手回复
      if (!eventSourceRef.current) {
        connectSSE(sid);
      }
    } catch (e: any) {
      message.error(e.message ?? '发送失败');
    } finally {
      setSending(false);
    }
  };

  // 加载历史会话列表
  const loadSessions = async () => {
    if (!token) return;
    try {
      const result = await copilotListSessions(token);
      setSessions(result.items);
    } catch {}
  };

  // 恢复历史会话
  const resumeSession = async (sid: string) => {
    if (!token) return;
    try {
      const detail = await copilotGetSession(token, sid);
      setSessionId(sid);
      setMessages(detail.messages);
      setActiveTab('chat');
      // 关闭旧 SSE
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      connectSSE(sid);
    } catch (e: any) {
      message.error(e.message ?? '恢复会话失败');
    }
  };

  // 加载待确认列表
  const loadConfirmations = async () => {
    if (!token) return;
    try {
      const items = await copilotListConfirmations(token, 'pending');
      setConfirmations(items);
    } catch {}
  };

  // 提交确认
  const handleConfirm = async (id: string, action: 'approve' | 'reject') => {
    if (!token) return;
    try {
      await copilotSubmitConfirmation(token, id, action);
      message.success(action === 'approve' ? '已确认执行' : '已取消执行');
      loadConfirmations();
    } catch (e: any) {
      message.error(e.message ?? '操作失败');
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (activeTab === 'history') loadSessions();
    if (activeTab === 'confirmations') loadConfirmations();
  }, [activeTab, token]);

  // 清理 SSE
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin tip="正在初始化 Copilot…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <ExclamationCircleOutlined className="text-4xl text-red-500" />
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <RobotOutlined className="text-5xl text-gray-400" />
        <p className="text-gray-500">
          等待初始化凭证…（通过 URL 参数或 postMessage 传入）
        </p>
      </div>
    );
  }

  const pendingCount = confirmations.filter((c) => c.status === 'pending').length;

  return (
    <div className="flex h-full flex-col">
      {/* 顶部 Tab */}
      <div className="border-b px-4">
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as CopilotTab)}
          items={[
            { key: 'chat', label: '对话' },
            { key: 'history', label: <span><HistoryOutlined /> 历史</span> },
            {
              key: 'confirmations',
              label: (
                <Badge count={pendingCount} size="small" offset={[6, 0]}>
                  <span><ExclamationCircleOutlined /> 待确认</span>
                </Badge>
              ),
            },
            { key: 'tasks', label: <span><LoadingOutlined /> 任务</span> },
          ]}
          size="small"
        />
      </div>

      {/* Tab 内容区 */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' && (
          <ChatPanel
            messages={messages}
            inputValue={inputValue}
            sending={sending}
            streaming={streaming}
            config={config}
            onInputChange={setInputValue}
            onSend={handleSend}
            messagesEndRef={messagesEndRef}
          />
        )}
        {activeTab === 'history' && (
          <HistoryPanel sessions={sessions} onResume={resumeSession} />
        )}
        {activeTab === 'confirmations' && (
          <ConfirmationPanel confirmations={confirmations} onAction={handleConfirm} />
        )}
        {activeTab === 'tasks' && <TaskPanel token={token} sessionId={sessionId} />}
      </div>
    </div>
  );
}

// ── 子组件 ───────────────────────────────────────────────────

function ChatPanel({
  messages,
  inputValue,
  sending,
  streaming,
  config,
  onInputChange,
  onSend,
  messagesEndRef,
}: {
  messages: CopilotMessage[];
  inputValue: string;
  sending: boolean;
  streaming: boolean;
  config: CopilotConfig | null;
  onInputChange: (v: string) => void;
  onSend: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && config?.welcomeMessage && (
          <div className="flex gap-2">
            <RobotOutlined className="mt-1 text-blue-500" />
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm max-w-[80%]">
              {config.welcomeMessage}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {streaming && (
          <div className="flex gap-2 items-center text-gray-400">
            <LoadingOutlined /> <span className="text-xs">正在处理…</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区 */}
      <div className="border-t p-3">
        <div className="flex gap-2">
          <TextArea
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder={config?.placeholder ?? '请输入您的问题…'}
            autoSize={{ minRows: 1, maxRows: 4 }}
            className="flex-1"
            disabled={sending}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={onSend}
            loading={sending}
            disabled={!inputValue.trim()}
          />
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message: msg }: { message: CopilotMessage }) {
  const isUser = msg.role === 'user';
  const text =
    typeof msg.content === 'string'
      ? msg.content
      : (msg.content as any)?.text ?? JSON.stringify(msg.content);

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      {isUser ? (
        <UserOutlined className="mt-1 text-green-500" />
      ) : (
        <RobotOutlined className="mt-1 text-blue-500" />
      )}
      <div
        className={`rounded-lg px-3 py-2 text-sm max-w-[80%] whitespace-pre-wrap ${
          isUser ? 'bg-green-50' : 'bg-blue-50'
        }`}
      >
        {text}
        {msg.type === 'confirmation' && (
          <Tag color="warning" className="mt-1">
            待确认
          </Tag>
        )}
      </div>
    </div>
  );
}

function HistoryPanel({
  sessions,
  onResume,
}: {
  sessions: CopilotSession[];
  onResume: (id: string) => void;
}) {
  if (sessions.length === 0) {
    return <Empty description="暂无历史会话" className="mt-12" />;
  }

  return (
    <div className="overflow-y-auto p-4">
      <List
        dataSource={sessions}
        renderItem={(s) => (
          <List.Item
            className="cursor-pointer hover:bg-gray-50 rounded px-2"
            onClick={() => onResume(s.id)}
          >
            <List.Item.Meta
              title={s.title || '未命名会话'}
              description={
                <span className="text-xs text-gray-400">
                  {s.capabilityType && <Tag>{s.capabilityType}</Tag>}
                  <Tag color={s.status === 'active' ? 'processing' : 'default'}>{s.status}</Tag>
                  {s.lastMessageAt && new Date(s.lastMessageAt).toLocaleString('zh-CN')}
                </span>
              }
            />
          </List.Item>
        )}
      />
    </div>
  );
}

function ConfirmationPanel({
  confirmations,
  onAction,
}: {
  confirmations: CopilotConfirmation[];
  onAction: (id: string, action: 'approve' | 'reject') => void;
}) {
  if (confirmations.length === 0) {
    return <Empty description="暂无待确认事项" className="mt-12" />;
  }

  return (
    <div className="overflow-y-auto p-4 space-y-3">
      {confirmations.map((c) => (
        <div key={c.id} className="rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">{c.actionType}</span>
            <Tag color={c.riskLevel === 'high' ? 'error' : c.riskLevel === 'medium' ? 'warning' : 'default'}>
              {c.riskLevel}
            </Tag>
          </div>
          {c.actionSummary && <p className="mt-1 text-xs text-gray-500">{c.actionSummary}</p>}
          {c.impactScope && (
            <p className="mt-1 text-xs text-orange-500">影响范围：{c.impactScope}</p>
          )}
          <div className="mt-2 flex gap-2 justify-end">
            <Button
              size="small"
              danger
              onClick={() => {
                Modal.confirm({
                  title: '确认取消执行？',
                  content: '取消后该操作将不会执行。',
                  onOk: () => onAction(c.id, 'reject'),
                });
              }}
            >
              取消执行
            </Button>
            <Button
              size="small"
              type="primary"
              onClick={() => {
                Modal.confirm({
                  title: '确认执行？',
                  content: `将执行高风险操作：${c.actionType}`,
                  onOk: () => onAction(c.id, 'approve'),
                });
              }}
            >
              确认执行
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskPanel({ token, sessionId }: { token: string; sessionId: string | null }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId || !token) return;
    setLoading(true);
    // 通过会话获取关联任务（复用 session detail API 中的 tasks）
    copilotGetSession(token, sessionId)
      .then((detail: any) => {
        if (detail.tasks) setTasks(detail.tasks);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId, token]);

  if (!sessionId) {
    return <Empty description="开始对话后可查看任务状态" className="mt-12" />;
  }
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin />
      </div>
    );
  }
  if (tasks.length === 0) {
    return <Empty description="当前会话暂无任务" className="mt-12" />;
  }

  return (
    <div className="overflow-y-auto p-4 space-y-3">
      {tasks.map((task: any) => (
        <TaskCard key={task.id} task={task} token={token} />
      ))}
    </div>
  );
}

function TaskCard({ task, token }: { task: any; token: string }) {
  const [detail, setDetail] = useState<any>(null);
  const [expanded, setExpanded] = useState(false);

  const loadDetail = async () => {
    if (detail) {
      setExpanded(!expanded);
      return;
    }
    try {
      const d = await copilotGetTask(token, task.id);
      setDetail(d);
      setExpanded(true);
    } catch {}
  };

  const statusColor =
    task.status === 'completed'
      ? 'success'
      : task.status === 'running'
        ? 'processing'
        : task.status === 'failed'
          ? 'error'
          : 'default';

  return (
    <div className="rounded-lg border p-3">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={loadDetail}
      >
        <span className="text-sm font-medium">{task.title || task.type}</span>
        <Tag color={statusColor}>{task.status}</Tag>
      </div>
      {expanded && detail?.steps && (
        <Timeline className="mt-3 ml-2" style={{ paddingLeft: 0 }}>
          {detail.steps.map((step: any) => (
            <Timeline.Item
              key={step.id}
              color={
                step.status === 'completed'
                  ? 'green'
                  : step.status === 'running'
                    ? 'blue'
                    : step.status === 'failed'
                      ? 'red'
                      : 'gray'
              }
              dot={
                step.status === 'running' ? <LoadingOutlined /> : undefined
              }
            >
              <span className="text-xs">
                {step.name || `步骤 ${step.seq}`}
                {step.durationMs != null && (
                  <span className="ml-2 text-gray-400">{step.durationMs}ms</span>
                )}
              </span>
            </Timeline.Item>
          ))}
        </Timeline>
      )}
    </div>
  );
}
