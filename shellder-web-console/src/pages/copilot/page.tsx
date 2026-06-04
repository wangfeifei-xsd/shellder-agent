'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Input, Spin, Tag, Tabs, Badge, Empty, List, Timeline, Modal, message, Alert } from 'antd';
import {
  SendOutlined,
  HistoryOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
  RobotOutlined,
  UserOutlined,
  BookOutlined,
} from '@ant-design/icons';
import type {
  CapabilityTypeKey,
  CopilotConfig,
  CopilotMessage,
  CopilotSession,
  CopilotConfirmation,
  CopilotSessionTask,
  CopilotCitation,
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
  extractMessageText,
  extractCitations,
} from '@/lib/copilot';

const { TextArea } = Input;
const STREAMING_MSG_ID = '__streaming__';
const CAPABILITY_OPTIONS: { value: CapabilityTypeKey; label: string }[] = [
  { value: 'qa', label: '问答' },
  { value: 'query', label: '查询' },
  { value: 'action', label: '操作' },
  { value: 'workflow', label: '流程' },
];

type CopilotTab = 'chat' | 'history' | 'confirmations' | 'tasks';

interface PendingInlineConfirm {
  approvalId: string;
  reason: string;
  toolName?: string;
}

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
  const [sessionTasks, setSessionTasks] = useState<CopilotSessionTask[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedCapabilityType, setSelectedCapabilityType] = useState<CapabilityTypeKey | null>(null);
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [inlineConfirm, setInlineConfirm] = useState<PendingInlineConfirm | null>(null);

  const [sessions, setSessions] = useState<CopilotSession[]>([]);
  const [confirmations, setConfirmations] = useState<CopilotConfirmation[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const clientId = params.get('clientId');
    const clientSecret = params.get('clientSecret');
    const tenantId = params.get('tenantId') ?? undefined;
    const externalTenantId = params.get('externalTenantId') ?? undefined;
    const externalUserId = params.get('externalUserId') ?? undefined;

    if (clientId && clientSecret) {
      void doExchangeToken({ clientId, clientSecret, tenantId, externalTenantId, externalUserId });
    } else {
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'copilot:init' && event.data.clientId) {
          void doExchangeToken(event.data);
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '换票失败');
    } finally {
      setLoading(false);
    }
  };

  const closeSse = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setStreaming(false);
  }, []);

  const refreshSessionDetail = useCallback(async (sid: string, authToken: string) => {
    const detail = await copilotGetSession(authToken, sid);
    setMessages(detail.messages);
    setSessionTasks(detail.tasks ?? []);
    return detail;
  }, []);

  const ensureSession = useCallback(async () => {
    const authToken = tokenRef.current;
    if (!authToken) return null;
    if (sessionId) return sessionId;
    if (!selectedCapabilityType) {
      message.warning('请先手动选择能力类型（查询/问答/操作/流程）');
      return null;
    }
    const session = await copilotCreateSession(authToken, {
      capabilityType: selectedCapabilityType,
    });
    setSessionId(session.id);
    return session.id;
  }, [sessionId, selectedCapabilityType]);

  const connectSSE = useCallback(
    (sid: string, authToken: string, onRuntimeEvent?: (type: string, data: Record<string, unknown>) => void) => {
      closeSse();

      const es = new EventSource(copilotBuildSseUrl(sid, authToken));
      eventSourceRef.current = es;

      es.addEventListener('session.connected', () => {
        setStreaming(false);
      });

      es.addEventListener('session.snapshot_end', () => {
        setStreaming(false);
      });

      const runtimeTypes = ['delta', 'tool_start', 'tool_end', 'confirm_required', 'done', 'error'];
      for (const type of runtimeTypes) {
        es.addEventListener(type, (ev) => {
          try {
            const data = JSON.parse(ev.data) as Record<string, unknown>;
            onRuntimeEvent?.(type, data);
          } catch {
            // ignore
          }
        });
      }

      es.onerror = () => {
        if (eventSourceRef.current !== es) return;
        closeSse();
        setTimeout(() => {
          if (tokenRef.current && sid) {
            connectSSE(sid, tokenRef.current, onRuntimeEvent);
          }
        }, 3000);
      };

      return es;
    },
    [closeSse],
  );

  const handleSend = async () => {
    const authToken = tokenRef.current;
    if (!inputValue.trim() || !authToken) return;

    const text = inputValue.trim();
    setSending(true);
    setInlineConfirm(null);

    try {
      const sid = await ensureSession();
      if (!sid) return;

      const userMsg: CopilotMessage = {
        id: `temp-${Date.now()}`,
        type: 'user',
        role: 'user',
        content: { text },
        seq: messages.length + 1,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInputValue('');
      setStreaming(true);

      let streamText = '';
      const upsertStreaming = (chunk: string) => {
        streamText += chunk;
        setMessages((prev) => {
          const without = prev.filter((m) => m.id !== STREAMING_MSG_ID);
          return [
            ...without,
            {
              id: STREAMING_MSG_ID,
              type: 'system',
              role: 'assistant',
              content: { text: streamText },
              seq: without.length + 1,
              createdAt: new Date().toISOString(),
            },
          ];
        });
      };

      connectSSE(sid, authToken, (type, data) => {
        if (type === 'delta' && typeof data.text === 'string') {
          upsertStreaming(data.text);
        }
        if (type === 'confirm_required') {
          setInlineConfirm({
            approvalId: String(data.approvalId ?? ''),
            reason: String(data.reason ?? '需要人工确认'),
            toolName: data.toolName ? String(data.toolName) : undefined,
          });
          setStreaming(false);
        }
        if (type === 'done') {
          setStreaming(false);
          void refreshSessionDetail(sid, authToken).catch(() => {});
        }
        if (type === 'error') {
          setStreaming(false);
          message.error(String(data.message ?? '处理失败'));
        }
      });

      const result = await copilotSendMessage(authToken, sid, text, 'stream');
      setMessages((prev) =>
        prev.map((m) =>
          m.id === userMsg.id ? { ...m, id: result.messageId, seq: m.seq } : m,
        ),
      );

      if (result.reply && !streamText) {
        setStreaming(false);
        await refreshSessionDetail(sid, authToken);
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '发送失败');
      setStreaming(false);
      closeSse();
    } finally {
      setSending(false);
    }
  };

  const loadSessions = async () => {
    const authToken = tokenRef.current;
    if (!authToken) return;
    try {
      const result = await copilotListSessions(authToken);
      setSessions(result.items);
    } catch {
      // ignore
    }
  };

  const resumeSession = async (sid: string) => {
    const authToken = tokenRef.current;
    if (!authToken) return;
    try {
      const detail = await refreshSessionDetail(sid, authToken);
      setSessionId(sid);
      const cap = detail.capabilityType;
      if (cap === 'qa' || cap === 'query' || cap === 'action' || cap === 'workflow') {
        setSelectedCapabilityType(cap);
      }
      setActiveTab('chat');
      setInlineConfirm(null);
      connectSSE(sid, authToken, (type, data) => {
        if (type === 'confirm_required') {
          setInlineConfirm({
            approvalId: String(data.approvalId ?? ''),
            reason: String(data.reason ?? '需要人工确认'),
            toolName: data.toolName ? String(data.toolName) : undefined,
          });
        }
        if (type === 'done') {
          void refreshSessionDetail(sid, authToken).catch(() => {});
        }
      });
      if (detail.status === 'pending_confirm') {
        void loadConfirmations();
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '恢复会话失败');
    }
  };

  const loadConfirmations = async () => {
    const authToken = tokenRef.current;
    if (!authToken) return;
    try {
      const items = await copilotListConfirmations(authToken, 'pending');
      setConfirmations(items);
    } catch {
      // ignore
    }
  };

  const handleConfirm = async (id: string, action: 'approve' | 'reject') => {
    const authToken = tokenRef.current;
    if (!authToken) return;
    try {
      await copilotSubmitConfirmation(authToken, id, action);
      message.success(action === 'approve' ? '已确认执行' : '已取消执行');
      setInlineConfirm(null);
      loadConfirmations();
      if (sessionId) {
        await refreshSessionDetail(sessionId, authToken);
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, inlineConfirm]);

  useEffect(() => {
    if (activeTab === 'history') void loadSessions();
    if (activeTab === 'confirmations') void loadConfirmations();
  }, [activeTab, token]);

  useEffect(() => () => closeSse(), [closeSse]);

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
  const showHistory = config?.features?.enableHistory !== false;
  const showConfirmations = config?.features?.enableConfirmation !== false;
  const showTasks = config?.features?.enableTask !== false;

  const tabItems = [
    { key: 'chat', label: '对话' },
    ...(showHistory
      ? [{ key: 'history', label: <span><HistoryOutlined /> 历史</span> }]
      : []),
    ...(showConfirmations
      ? [{
          key: 'confirmations',
          label: (
            <Badge count={pendingCount} size="small" offset={[6, 0]}>
              <span><ExclamationCircleOutlined /> 待确认</span>
            </Badge>
          ),
        }]
      : []),
    ...(showTasks
      ? [{ key: 'tasks', label: <span><LoadingOutlined /> 任务</span> }]
      : []),
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4">
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as CopilotTab)}
          items={tabItems}
          size="small"
        />
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' && (
          <ChatPanel
            messages={messages}
            inputValue={inputValue}
            sessionId={sessionId}
            selectedCapabilityType={selectedCapabilityType}
            sending={sending}
            streaming={streaming}
            config={config}
            inlineConfirm={inlineConfirm}
            onInlineConfirm={(action) => {
              if (inlineConfirm?.approvalId) {
                void handleConfirm(inlineConfirm.approvalId, action);
              }
            }}
            onInputChange={setInputValue}
            onCapabilityTypeChange={setSelectedCapabilityType}
            onSend={() => void handleSend()}
            messagesEndRef={messagesEndRef}
          />
        )}
        {activeTab === 'history' && (
          <HistoryPanel sessions={sessions} onResume={(id) => void resumeSession(id)} />
        )}
        {activeTab === 'confirmations' && (
          <ConfirmationPanel
            confirmations={confirmations}
            onAction={(id, action) => void handleConfirm(id, action)}
          />
        )}
        {activeTab === 'tasks' && (
          <TaskPanel token={token} tasks={sessionTasks} />
        )}
      </div>
    </div>
  );
}

function ChatPanel({
  messages,
  inputValue,
  sessionId,
  selectedCapabilityType,
  sending,
  streaming,
  config,
  inlineConfirm,
  onInlineConfirm,
  onInputChange,
  onCapabilityTypeChange,
  onSend,
  messagesEndRef,
}: {
  messages: CopilotMessage[];
  inputValue: string;
  sessionId: string | null;
  selectedCapabilityType: CapabilityTypeKey | null;
  sending: boolean;
  streaming: boolean;
  config: CopilotConfig | null;
  inlineConfirm: PendingInlineConfirm | null;
  onInlineConfirm: (action: 'approve' | 'reject') => void;
  onInputChange: (v: string) => void;
  onCapabilityTypeChange: (v: CapabilityTypeKey) => void;
  onSend: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="flex h-full flex-col">
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
        {streaming && !messages.some((m) => m.id === STREAMING_MSG_ID) && (
          <div className="flex gap-2 items-center text-gray-400">
            <LoadingOutlined /> <span className="text-xs">正在处理…</span>
          </div>
        )}
        {inlineConfirm && (
          <Alert
            type="warning"
            showIcon
            message={inlineConfirm.toolName ? `待确认：${inlineConfirm.toolName}` : '待确认操作'}
            description={inlineConfirm.reason}
            action={
              <div className="flex gap-2">
                <Button size="small" danger onClick={() => onInlineConfirm('reject')}>
                  取消
                </Button>
                <Button size="small" type="primary" onClick={() => onInlineConfirm('approve')}>
                  确认执行
                </Button>
              </div>
            }
          />
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t p-3">
        <div className="mb-2 flex flex-wrap gap-2">
          {CAPABILITY_OPTIONS.map((opt) => (
            <Tag
              key={opt.value}
              color={selectedCapabilityType === opt.value ? 'processing' : 'default'}
              className="cursor-pointer"
              onClick={() => onCapabilityTypeChange(opt.value)}
            >
              {opt.label}
            </Tag>
          ))}
        </div>
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
            disabled={sending || !!inlineConfirm || (!sessionId && !selectedCapabilityType)}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={onSend}
            loading={sending}
            disabled={!inputValue.trim() || !!inlineConfirm || (!sessionId && !selectedCapabilityType)}
          />
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message: msg }: { message: CopilotMessage }) {
  const isUser = msg.role === 'user';
  const text = extractMessageText(msg.content);
  const citations = extractCitations(msg.content);

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      {isUser ? (
        <UserOutlined className="mt-1 text-green-500" />
      ) : (
        <RobotOutlined className="mt-1 text-blue-500" />
      )}
      <div
        className={`rounded-lg px-3 py-2 text-sm max-w-[80%] ${
          isUser ? 'bg-green-50' : 'bg-blue-50'
        }`}
      >
        <div className="whitespace-pre-wrap">{text}</div>
        {msg.type === 'confirmation' && (
          <Tag color="warning" className="mt-1">
            待确认
          </Tag>
        )}
        {citations.length > 0 && (
          <div className="mt-2 border-t border-blue-100 pt-2">
            <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
              <BookOutlined /> 引用来源
            </div>
            <ul className="space-y-1 text-xs text-gray-600">
              {citations.map((c: CopilotCitation, i: number) => (
                <li key={i} className="rounded bg-white/60 px-2 py-1">
                  {c.documentTitle && (
                    <span className="font-medium text-blue-600">{c.documentTitle}</span>
                  )}
                  {c.score != null && (
                    <span className="ml-1 text-gray-400">({(c.score * 100).toFixed(0)}%)</span>
                  )}
                  <div className="text-gray-500 line-clamp-2">{c.content}</div>
                </li>
              ))}
            </ul>
          </div>
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

function TaskPanel({ token, tasks }: { token: string; tasks: CopilotSessionTask[] }) {
  if (tasks.length === 0) {
    return <Empty description="当前会话暂无任务（流程型能力执行后可见）" className="mt-12" />;
  }

  return (
    <div className="overflow-y-auto p-4 space-y-3">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} token={token} />
      ))}
    </div>
  );
}

function TaskCard({ task, token }: { task: CopilotSessionTask; token: string }) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof copilotGetTask>> | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [polling, setPolling] = useState(false);

  const loadDetail = async () => {
    try {
      const d = await copilotGetTask(token, task.id);
      setDetail(d);
      setExpanded(true);
      setPolling(d.status === 'running' || d.status === 'pending');
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!polling || !expanded) return;
    const timer = setInterval(async () => {
      try {
        const d = await copilotGetTask(token, task.id);
        setDetail(d);
        if (d.status !== 'running' && d.status !== 'pending') {
          setPolling(false);
        }
      } catch {
        setPolling(false);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [polling, expanded, token, task.id]);

  const statusColor =
    task.status === 'completed'
      ? 'success'
      : task.status === 'running'
        ? 'processing'
        : task.status === 'failed'
          ? 'error'
          : 'default';

  const displayStatus = detail?.status ?? task.status;

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => void loadDetail()}>
        <span className="text-sm font-medium">{task.title || task.type}</span>
        <Tag color={statusColor}>{displayStatus}</Tag>
      </div>
      {task.currentNode && (
        <p className="mt-1 text-xs text-gray-400">当前节点：{task.currentNode}</p>
      )}
      {expanded && detail?.steps && (
        <Timeline className="mt-3 ml-2" style={{ paddingLeft: 0 }}>
          {detail.steps.map((step) => (
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
              dot={step.status === 'running' ? <LoadingOutlined /> : undefined}
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
      {detail?.failReason && (
        <Alert type="error" message={detail.failReason} className="mt-2" showIcon />
      )}
    </div>
  );
}
