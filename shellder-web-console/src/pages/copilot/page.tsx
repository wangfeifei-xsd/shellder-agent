'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avatar, Button, Input, Spin, Tag, Tabs, Badge, Empty, List, Timeline, Modal, Popconfirm, message, Alert, Tooltip } from 'antd';
import {
  SendOutlined,
  HistoryOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
  RobotOutlined,
  UserOutlined,
  BookOutlined,
  MessageOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  NodeIndexOutlined,
  FormatPainterOutlined,
  ProfileOutlined,
  DeleteOutlined,
  EditOutlined,
  SafetyCertificateOutlined,
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
  copilotDeleteSession,
  copilotUpdateSession,
  copilotListConfirmations,
  copilotSubmitConfirmation,
  copilotBuildSseUrl,
  copilotGetTask,
  extractMessageText,
  extractCitations,
  isHiddenCopilotChatMessage,
  findLatestRoutingResult,
  resolveCopilotRoutingMode,
  resolveShowCapabilitySelector,
  type CopilotRoutingMode,
  type CopilotRoutingResultContent,
} from '@/lib/copilot';
import {
  useThinkingStatusText,
  hasSubstantiveStreamText,
  shouldIgnoreInterimStreamDelta,
} from '@/lib/copilot-thinking-status';
import {
  COPILOT_INIT_MESSAGE_TYPE,
  COPILOT_READY_MESSAGE_TYPE,
  isAllowedCopilotParentOrigin,
  pickCopilotTokenExchangeParams,
  pickCopilotTokenExchangeParamsFromSearchParams,
  resolveCopilotPostMessageTarget,
  type CopilotTokenExchangeParams,
} from '@/lib/copilot-init';
import { CopilotQaRecallMedia } from '@/components/copilot/CopilotQaRecallMedia';

const { TextArea } = Input;
const STREAMING_MSG_ID = '__streaming__';

const CAPABILITY_META: Record<
  CapabilityTypeKey,
  {
    label: string;
    activeClass: string;
    idleClass: string;
    hoverClass: string;
    icon: React.ReactNode;
  }
> = {
  qa: {
    label: '问答',
    activeClass: 'border-emerald-500 bg-emerald-500 text-white shadow-sm',
    idleClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    hoverClass: 'hover:border-emerald-300 hover:bg-emerald-100',
    icon: <MessageOutlined />,
  },
  query: {
    label: '查询',
    activeClass: 'border-sky-500 bg-sky-500 text-white shadow-sm',
    idleClass: 'border-sky-200 bg-sky-50 text-sky-700',
    hoverClass: 'hover:border-sky-300 hover:bg-sky-100',
    icon: <SearchOutlined />,
  },
  action: {
    label: '操作',
    activeClass: 'border-amber-500 bg-amber-500 text-white shadow-sm',
    idleClass: 'border-amber-200 bg-amber-50 text-amber-700',
    hoverClass: 'hover:border-amber-300 hover:bg-amber-100',
    icon: <ThunderboltOutlined />,
  },
  workflow: {
    label: '流程',
    activeClass: 'border-violet-500 bg-violet-500 text-white shadow-sm',
    idleClass: 'border-violet-200 bg-violet-50 text-violet-700',
    hoverClass: 'hover:border-violet-300 hover:bg-violet-100',
    icon: <NodeIndexOutlined />,
  },
};

const CAPABILITY_OPTIONS = (
  Object.entries(CAPABILITY_META) as [CapabilityTypeKey, (typeof CAPABILITY_META)['qa']][]
).map(([value, meta]) => ({ value, ...meta }));

type CopilotTab = 'chat' | 'history' | 'confirmations' | 'tasks';

interface PendingInlineConfirm {
  approvalId: string;
  messageId?: string;
  reason: string;
  toolName?: string;
}

async function resolvePendingApprovalId(
  authToken: string,
  sessionId: string | null,
  hint?: PendingInlineConfirm | null,
): Promise<string | null> {
  if (hint?.approvalId) return hint.approvalId;
  if (!sessionId) return null;
  const items = await copilotListConfirmations(authToken, 'pending');
  return items.find((c) => c.sessionId === sessionId)?.id ?? null;
}

function isCapabilityTypeKey(value: string): value is CapabilityTypeKey {
  return value === 'qa' || value === 'query' || value === 'action' || value === 'workflow';
}

/** 自动路由后同步 Tab；定向锁定时以 Session 为准，避免覆盖用户已选能力 */
function resolveCapabilityTypeForSelector(
  detail: { capabilityType: string | null; messages: CopilotMessage[] },
  currentSelection: CapabilityTypeKey | null,
): CapabilityTypeKey | null {
  const cap = detail.capabilityType;
  if (!cap || !isCapabilityTypeKey(cap)) return null;

  const routing = findLatestRoutingResult(detail.messages);
  const wasPinned = routing?.typeStage?.pinned ?? routing?.pinnedCapability;
  if (wasPinned || !currentSelection) return cap;
  return currentSelection;
}

interface PendingCapabilityClarify {
  detectedType: CapabilityTypeKey;
  detectedName: string;
  confidence: number;
  reason: string;
}

/**
 * 嵌入式 Copilot 主页面
 * URL: /#/copilot?clientId=xxx&clientSecret=xxx&tenantId=xxx
 * 也可通过 postMessage 传入凭证。
 */
export default function CopilotPage() {
  const [searchParams] = useSearchParams();
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
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [pendingClarify, setPendingClarify] = useState<PendingCapabilityClarify | null>(null);

  const routingMode: CopilotRoutingMode = resolveCopilotRoutingMode(config);
  const showCapabilitySelector = resolveShowCapabilitySelector(config, routingMode);

  const checkLowConfidenceClarify = useCallback(
    (msgs: CopilotMessage[]) => {
      if (config?.features?.clarifyOnLowConfidence === false) return;
      const threshold = config?.features?.confidenceThreshold ?? 0.4;
      const routing = findLatestRoutingResult(msgs);
      if (!routing?.typeStage || routing.typeStage.pinned) return;
      if (routing.typeStage.confidence >= threshold) return;
      const detected = routing.capabilityType;
      if (
        detected !== 'qa' &&
        detected !== 'query' &&
        detected !== 'action' &&
        detected !== 'workflow'
      ) {
        return;
      }
      setPendingClarify({
        detectedType: detected,
        detectedName: routing.capabilityName ?? CAPABILITY_META[detected].label,
        confidence: routing.typeStage.confidence,
        reason: routing.typeStage.reason,
      });
    },
    [config],
  );

  const syncSelectedCapabilityFromSession = useCallback(
    (detail: { capabilityType: string | null; messages: CopilotMessage[] }) => {
      const next = resolveCapabilityTypeForSelector(detail, selectedCapabilityType);
      if (next) setSelectedCapabilityType(next);
    },
    [selectedCapabilityType],
  );

  const [sessions, setSessions] = useState<CopilotSession[]>([]);
  const [confirmations, setConfirmations] = useState<CopilotConfirmation[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    const fromUrl = pickCopilotTokenExchangeParamsFromSearchParams(searchParams);
    if (fromUrl) {
      void doExchangeToken(fromUrl);
    }

    const handler = (event: MessageEvent) => {
      if (!isAllowedCopilotParentOrigin(event.origin)) return;
      if (event.data?.type !== COPILOT_INIT_MESSAGE_TYPE) return;
      const params = pickCopilotTokenExchangeParams(
        event.data as Record<string, unknown>,
      );
      if (params) {
        void doExchangeToken(params);
      }
    };
    window.addEventListener('message', handler);
    if (!fromUrl) {
      setLoading(false);
      if (window.parent !== window) {
        window.parent.postMessage(
          { type: COPILOT_READY_MESSAGE_TYPE },
          resolveCopilotPostMessageTarget(),
        );
      }
    }
    return () => window.removeEventListener('message', handler);
  }, [searchParams]);

  const doExchangeToken = async (params: CopilotTokenExchangeParams) => {
    try {
      setLoading(true);
      const result = await copilotExchangeToken(params);
      setToken(result.accessToken);
      setConfig(result.config);
      setError(null);
      setSessionId(null);
      setMessages([]);
      setSessionTasks([]);
      setInlineConfirm(null);
      setSelectedCapabilityType(null);
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

  const hydrateInlineConfirm = useCallback(
    async (sid: string, authToken: string, base?: PendingInlineConfirm | null) => {
      try {
        const items = await copilotListConfirmations(authToken, 'pending');
        const pending = items.find((c) => c.sessionId === sid);
        if (!pending) return;
        setInlineConfirm((prev) => {
          const seed = base ?? prev;
          if (!seed && !pending) return null;
          return {
            approvalId: seed?.approvalId || pending.id,
            messageId: seed?.messageId,
            reason: seed?.reason ?? pending.impactScope ?? '需要人工确认',
            toolName: seed?.toolName ?? pending.actionType,
          };
        });
      } catch {
        // 列表拉取失败时保留 SSE 已展示的状态
      }
    },
    [],
  );

  const ensureSession = useCallback(async () => {
    const authToken = tokenRef.current;
    if (!authToken) return null;
    if (sessionId) return sessionId;

    if (routingMode === 'pinned' && !selectedCapabilityType) {
      message.warning('pinned 模式下请先选择能力类型');
      return null;
    }

    // auto / hybrid：未选择时首条自动路由；已选择时写入 Session 作为定向锁定
    const createOptions = selectedCapabilityType
      ? { capabilityType: selectedCapabilityType }
      : undefined;

    const session = await copilotCreateSession(authToken, createOptions);
    setSessionId(session.id);
    if (session.capabilityType && isCapabilityTypeKey(session.capabilityType)) {
      setSelectedCapabilityType(session.capabilityType);
    }
    return session.id;
  }, [sessionId, selectedCapabilityType, routingMode]);

  const connectSSE = useCallback(
    (sid: string, authToken: string, onRuntimeEvent?: (type: string, data: Record<string, unknown>) => void) => {
      closeSse();

      const es = new EventSource(copilotBuildSseUrl(sid, authToken));
      eventSourceRef.current = es;

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
    if (!sessionId && routingMode === 'pinned' && !selectedCapabilityType) {
      message.warning('pinned 模式下请先选择能力类型');
      return;
    }

    const text = inputValue.trim();
    setInputValue('');
    setSending(true);
    setInlineConfirm(null);

    const userMsg: CopilotMessage = {
      id: `temp-${Date.now()}`,
      type: 'user',
      role: 'user',
      content: { text },
      seq: 0,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => {
      const base = prev.filter((m) => m.id !== STREAMING_MSG_ID);
      const nextSeq = base.length + 1;
      return [
        ...base,
        { ...userMsg, seq: nextSeq },
        {
          id: STREAMING_MSG_ID,
          type: 'system',
          role: 'assistant',
          content: { text: '' },
          seq: nextSeq + 1,
          createdAt: new Date().toISOString(),
        },
      ];
    });
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

    const rollbackOptimistic = () => {
      setMessages((prev) =>
        prev.filter((m) => m.id !== userMsg.id && m.id !== STREAMING_MSG_ID),
      );
      setStreaming(false);
    };

    try {
      const sid = await ensureSession();
      if (!sid) {
        rollbackOptimistic();
        return;
      }

      connectSSE(sid, authToken, (type, data) => {
        if (type === 'delta' && typeof data.text === 'string') {
          if (!shouldIgnoreInterimStreamDelta(data.text, streamText)) {
            upsertStreaming(data.text);
          }
        }
        if (type === 'confirm_required') {
          const pending: PendingInlineConfirm = {
            approvalId: String(data.approvalId ?? ''),
            messageId: data.messageId ? String(data.messageId) : undefined,
            reason: String(data.reason ?? '需要人工确认'),
            toolName: data.toolName ? String(data.toolName) : undefined,
          };
          setInlineConfirm(pending);
          if (!pending.approvalId) {
            void hydrateInlineConfirm(sid, authToken, pending);
          }
          setStreaming(false);
        }
        if (type === 'done') {
          setStreaming(false);
          void refreshSessionDetail(sid, authToken)
            .then((detail) => {
              checkLowConfidenceClarify(detail.messages);
              syncSelectedCapabilityFromSession(detail);
              if (detail.status === 'pending_confirm') {
                void hydrateInlineConfirm(sid, authToken);
              }
            })
            .catch(() => {});
        }
        if (type === 'error') {
          setStreaming(false);
          if (!streamText) {
            setMessages((prev) => prev.filter((m) => m.id !== STREAMING_MSG_ID));
          }
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
        const detail = await refreshSessionDetail(sid, authToken);
        checkLowConfidenceClarify(detail.messages);
        syncSelectedCapabilityFromSession(detail);
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '发送失败');
      setMessages((prev) => prev.filter((m) => m.id !== STREAMING_MSG_ID));
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
      if (cap && isCapabilityTypeKey(cap)) {
        setSelectedCapabilityType(cap);
      }
      setActiveTab('chat');
      setInlineConfirm(null);
      connectSSE(sid, authToken, (type, data) => {
        if (type === 'confirm_required') {
          const pending: PendingInlineConfirm = {
            approvalId: String(data.approvalId ?? ''),
            messageId: data.messageId ? String(data.messageId) : undefined,
            reason: String(data.reason ?? '需要人工确认'),
            toolName: data.toolName ? String(data.toolName) : undefined,
          };
          setInlineConfirm(pending);
          if (!pending.approvalId) {
            void hydrateInlineConfirm(sid, authToken, pending);
          }
        }
        if (type === 'done') {
          void refreshSessionDetail(sid, authToken)
            .then((detail) => {
              if (detail.status === 'pending_confirm') {
                void hydrateInlineConfirm(sid, authToken);
              }
            })
            .catch(() => {});
        }
      });
      if (detail.status === 'pending_confirm') {
        void loadConfirmations();
        void hydrateInlineConfirm(sid, authToken);
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

  const resetCurrentSession = useCallback((options?: { resetCapabilityType?: boolean }) => {
    closeSse();
    setSessionId(null);
    setMessages([]);
    setSessionTasks([]);
    setInlineConfirm(null);
    setInputValue('');
    setStreaming(false);
    setSending(false);
    if (options?.resetCapabilityType) {
      setSelectedCapabilityType(null);
    }
  }, [closeSse]);

  const handleClearSession = useCallback(() => {
    resetCurrentSession();
    setPendingClarify(null);
    message.success('已清除当前会话，可开始新对话');
  }, [resetCurrentSession]);

  const handleDeleteSession = async (sid: string) => {
    const authToken = tokenRef.current;
    if (!authToken) return;
    try {
      await copilotDeleteSession(authToken, sid);
      setSessions((prev) => prev.filter((s) => s.id !== sid));
      if (sessionId === sid) {
        resetCurrentSession({ resetCapabilityType: true });
      }
      message.success('已删除');
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleRenameSession = async (sid: string, title: string) => {
    const authToken = tokenRef.current;
    if (!authToken) return;
    try {
      const updated = await copilotUpdateSession(authToken, sid, { title });
      setSessions((prev) =>
        prev.map((s) => (s.id === sid ? { ...s, title: updated.title } : s)),
      );
      message.success('已重命名');
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '重命名失败');
      throw e;
    }
  };

  const handleConfirm = async (id: string, action: 'approve' | 'reject') => {
    const authToken = tokenRef.current;
    if (!authToken) return;
    setConfirmSubmitting(true);
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
    } finally {
      setConfirmSubmitting(false);
    }
  };

  const handleInlineConfirm = async (action: 'approve' | 'reject') => {
    const authToken = tokenRef.current;
    if (!authToken) {
      message.error('未获取到 Copilot 凭证');
      return;
    }
    try {
      const approvalId = await resolvePendingApprovalId(authToken, sessionId, inlineConfirm);
      if (!approvalId) {
        message.error('未找到待确认记录，请刷新页面或在「待确认」页操作');
        return;
      }
      await handleConfirm(approvalId, action);
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
    const isEmbedded = typeof window !== 'undefined' && window.parent !== window;
    if (isEmbedded) {
      return (
        <div className="flex h-full items-center justify-center">
          <Spin tip="正在等待父页面传入凭证…" />
        </div>
      );
    }
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
    { key: 'chat', label: <span><MessageOutlined /> 对话</span> },
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
      ? [{ key: 'tasks', label: <span><ProfileOutlined /> 任务</span> }]
      : []),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b px-4">
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as CopilotTab)}
          items={tabItems}
          size="small"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeTab === 'chat' && (
          <ChatPanel
            token={token}
            messages={messages}
            inputValue={inputValue}
            sessionId={sessionId}
            selectedCapabilityType={selectedCapabilityType}
            routingMode={routingMode}
            showCapabilitySelector={showCapabilitySelector}
            sending={sending}
            streaming={streaming}
            config={config}
            inlineConfirm={inlineConfirm}
            confirmSubmitting={confirmSubmitting}
            pendingClarify={pendingClarify}
            onDismissClarify={() => setPendingClarify(null)}
            onClarifyReset={() => {
              setPendingClarify(null);
              resetCurrentSession({ resetCapabilityType: true });
            }}
            onInlineConfirm={(action) => {
              void handleInlineConfirm(action);
            }}
            onInputChange={setInputValue}
            onCapabilityTypeChange={(type) => {
              if (sessionId) {
                closeSse();
                setSessionId(null);
                setMessages([]);
                setSessionTasks([]);
                setInlineConfirm(null);
                setPendingClarify(null);
              }
              setSelectedCapabilityType(type);
            }}
            onClearSession={handleClearSession}
            onSend={() => void handleSend()}
            messagesEndRef={messagesEndRef}
          />
        )}
        {activeTab === 'history' && (
          <HistoryPanel
            sessions={sessions}
            onResume={(id) => void resumeSession(id)}
            onDelete={(id) => void handleDeleteSession(id)}
            onRename={(id, title) => handleRenameSession(id, title)}
          />
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
  token,
  messages,
  inputValue,
  sessionId,
  selectedCapabilityType,
  routingMode,
  showCapabilitySelector,
  sending,
  streaming,
  config,
  inlineConfirm,
  confirmSubmitting,
  pendingClarify,
  onDismissClarify,
  onClarifyReset,
  onInlineConfirm,
  onInputChange,
  onCapabilityTypeChange,
  onClearSession,
  onSend,
  messagesEndRef,
}: {
  token: string;
  messages: CopilotMessage[];
  inputValue: string;
  sessionId: string | null;
  selectedCapabilityType: CapabilityTypeKey | null;
  routingMode: CopilotRoutingMode;
  showCapabilitySelector: boolean;
  sending: boolean;
  streaming: boolean;
  config: CopilotConfig | null;
  inlineConfirm: PendingInlineConfirm | null;
  confirmSubmitting: boolean;
  pendingClarify: PendingCapabilityClarify | null;
  onDismissClarify: () => void;
  onClarifyReset: () => void;
  onInlineConfirm: (action: 'approve' | 'reject') => void;
  onInputChange: (v: string) => void;
  onCapabilityTypeChange: (v: CapabilityTypeKey) => void;
  onClearSession: () => void;
  onSend: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  const hasConversation = messages.length > 0 || !!sessionId;
  const routingResult = findLatestRoutingResult(messages);
  const requiresCapabilityBeforeSend =
    routingMode === 'pinned' && !sessionId && !selectedCapabilityType;
  const selectorLocked =
    routingMode === 'pinned' || (routingMode !== 'hybrid' && !!sessionId);
  const showCapabilityPicker =
    showCapabilitySelector ||
    routingMode === 'pinned' ||
    routingMode === 'hybrid' ||
    (routingMode === 'auto' && !sessionId);

  return (
    <div className="flex h-full flex-col">
      {hasConversation && (
        <div className="flex shrink-0 items-center justify-end border-b border-gray-100 px-2 py-1">
          <Tooltip title="清除会话">
            <span className="inline-flex">
              <button
                type="button"
                disabled={sending || streaming}
                onClick={() => {
                  Modal.confirm({
                    title: '清除当前会话？',
                    content: '将清空当前对话记录；下次发送将创建新会话。',
                    okText: '清除',
                    cancelText: '取消',
                    onOk: onClearSession,
                  });
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <FormatPainterOutlined className="text-sm" />
              </button>
            </span>
          </Tooltip>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && config?.welcomeMessage && (
          <div className="flex gap-3 items-start">
            <ChatAvatar role="assistant" />
            <div className="rounded-2xl rounded-tl-sm bg-slate-50 px-3.5 py-2.5 text-sm max-w-[85%] text-slate-700 shadow-sm ring-1 ring-slate-100">
              {config.welcomeMessage}
            </div>
          </div>
        )}
        {routingResult && (
          <RoutingResultBanner routing={routingResult} />
        )}
        {messages
          .filter((msg) => !isHiddenCopilotChatMessage(msg))
          .filter((msg) => !(inlineConfirm && msg.type === 'confirmation'))
          .map((msg) => (
          <MessageBubble
            key={msg.id}
            token={token}
            message={msg}
            capabilityType={selectedCapabilityType}
          />
        ))}
        {inlineConfirm && (
          <InlineConfirmCard
            toolName={inlineConfirm.toolName}
            reason={inlineConfirm.reason}
            confirmSubmitting={confirmSubmitting}
            onReject={() => onInlineConfirm('reject')}
            onConfirm={() => onInlineConfirm('approve')}
          />
        )}
        <div ref={messagesEndRef} />
      </div>

      <Modal
        title="能力类型识别置信度较低"
        open={!!pendingClarify}
        onCancel={onDismissClarify}
        footer={[
          <Button key="reset" onClick={onClarifyReset}>
            重新选择能力
          </Button>,
          <Button key="ok" type="primary" onClick={onDismissClarify}>
            继续使用
          </Button>,
        ]}
      >
        {pendingClarify && (
          <div className="space-y-2 text-sm">
            <p>
              系统识别为
              <Tag color="blue" className="mx-1">
                {pendingClarify.detectedName}
              </Tag>
              （置信度 {(pendingClarify.confidence * 100).toFixed(0)}%）
            </p>
            <p className="text-gray-500">{pendingClarify.reason}</p>
            <p className="text-gray-500">
              若识别有误，可清除会话并手动指定能力类型后重新提问。
            </p>
          </div>
        )}
      </Modal>

      <div className="border-t bg-gray-50/80 p-3">
        {showCapabilityPicker && (
          <div className="mb-2">
            <CapabilityTypeSelector
              selected={selectedCapabilityType}
              locked={selectorLocked}
              readOnly={routingMode === 'pinned' && !!sessionId}
              onChange={onCapabilityTypeChange}
            />
            {requiresCapabilityBeforeSend && (
              <p className="mt-1 text-center text-[11px] text-amber-600">
                发送前请先选择能力类型
              </p>
            )}
          </div>
        )}
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
            disabled={sending || !!inlineConfirm || requiresCapabilityBeforeSend}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={onSend}
            loading={sending}
            disabled={
              !inputValue.trim() || !!inlineConfirm || requiresCapabilityBeforeSend
            }
          />
        </div>
      </div>
    </div>
  );
}

function RoutingResultBanner({ routing }: { routing: CopilotRoutingResultContent }) {
  const type = routing.capabilityType as CapabilityTypeKey | undefined;
  const meta = type ? CAPABILITY_META[type] : undefined;
  const ruleName = routing.intraStage?.ruleName;

  return (
    <Alert
      type="info"
      showIcon
      className="text-xs"
      message={
        <span>
          识别为
          {meta ? (
            <Tag color="blue" className="mx-1">
              {meta.label}
            </Tag>
          ) : (
            routing.capabilityName ?? routing.capabilityType
          )}
          {ruleName ? ` · 规则「${ruleName}」` : null}
          {routing.typeStage && !routing.typeStage.pinned
            ? ` · 置信度 ${(routing.typeStage.confidence * 100).toFixed(0)}%`
            : null}
        </span>
      }
    />
  );
}

function ChatAvatar({ role }: { role: 'user' | 'assistant' }) {
  const isUser = role === 'user';
  return (
    <Avatar
      size={36}
      className="shrink-0 shadow-sm"
      style={{
        background: isUser
          ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
          : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
      }}
      icon={isUser ? <UserOutlined className="text-sm" /> : <RobotOutlined className="text-sm" />}
    />
  );
}

function InlineConfirmCard({
  toolName,
  reason,
  confirmSubmitting,
  onConfirm,
  onReject,
}: {
  toolName?: string;
  reason: string;
  confirmSubmitting: boolean;
  onConfirm: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <ChatAvatar role="assistant" />
      <div className="min-w-0 max-w-[calc(100%-3rem)] flex-1">
        <div className="overflow-hidden rounded-2xl rounded-tl-sm bg-white shadow-sm ring-1 ring-amber-200/70">
          <div className="flex items-start gap-3 border-b border-amber-100/80 bg-gradient-to-br from-amber-50 via-white to-orange-50/40 px-4 py-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 shadow-sm">
              <SafetyCertificateOutlined className="text-lg" />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-800">需要您的确认</span>
                <Tag
                  bordered={false}
                  className="m-0 rounded-md bg-amber-100 px-1.5 py-0 text-[11px] leading-5 text-amber-700"
                >
                  待确认
                </Tag>
              </div>
              <p className="mt-1.5 text-[15px] font-medium leading-snug text-slate-900">
                {toolName ?? '待确认操作'}
              </p>
            </div>
          </div>
          {reason ? (
            <p className="border-b border-slate-100 px-4 py-2.5 text-xs leading-relaxed text-slate-500">
              {reason}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2 bg-slate-50/80 px-4 py-3">
            <Button size="small" disabled={confirmSubmitting} onClick={onReject}>
              取消
            </Button>
            <Button
              size="small"
              type="primary"
              loading={confirmSubmitting}
              onClick={onConfirm}
            >
              确认执行
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CapabilityTypeSelector({
  selected,
  locked,
  readOnly,
  onChange,
}: {
  selected: CapabilityTypeKey | null;
  locked: boolean;
  readOnly?: boolean;
  onChange: (v: CapabilityTypeKey) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1">
      {CAPABILITY_OPTIONS.map((opt) => {
        const isActive = selected === opt.value;
        const disabled = readOnly || (locked && !isActive);
        const tooltipTitle = disabled
          ? readOnly
            ? `${opt.label}（只读）`
            : `${opt.label}（清除会话后可切换）`
          : opt.label;
        return (
          <Tooltip key={opt.value} title={tooltipTitle}>
            <span className="inline-flex w-full">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(opt.value)}
                className={[
                  'flex w-full flex-col items-center justify-center gap-0.5 rounded-lg border px-0.5 py-1.5 text-xs transition-all',
                  'disabled:cursor-not-allowed disabled:opacity-45',
                  isActive ? opt.activeClass : [opt.idleClass, opt.hoverClass].join(' '),
                ].join(' ')}
              >
                <span className="text-sm leading-none">{opt.icon}</span>
                <span className="text-[10px] leading-none">{opt.label}</span>
              </button>
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}

function MessageBubble({
  token,
  message: msg,
  capabilityType,
}: {
  token: string;
  message: CopilotMessage;
  capabilityType: CapabilityTypeKey | null;
}) {
  const isUser = msg.role === 'user';
  const text = extractMessageText(msg.content);
  const citations = extractCitations(msg.content);
  const isTypingPlaceholder =
    msg.id === STREAMING_MSG_ID && !hasSubstantiveStreamText(text);
  const thinkingText = useThinkingStatusText(isTypingPlaceholder, capabilityType);

  return (
    <div className={`flex gap-3 items-start ${isUser ? 'flex-row-reverse' : ''}`}>
      <ChatAvatar role={isUser ? 'user' : 'assistant'} />
      <div
        className={`rounded-2xl px-3.5 py-2.5 text-sm max-w-[calc(100%-3rem)] shadow-sm ${
          isUser
            ? 'rounded-tr-sm bg-emerald-500 text-white'
            : 'rounded-tl-sm bg-white text-slate-800 ring-1 ring-slate-100'
        }`}
      >
        {isTypingPlaceholder ? (
          <span className="inline-flex items-center gap-2 text-slate-400">
            <LoadingOutlined />
            <span className="text-xs">{thinkingText}</span>
          </span>
        ) : (
          <div className="whitespace-pre-wrap">{text}</div>
        )}
        {msg.type === 'confirmation' && (
          <Tag color="warning" className="mt-1">
            待确认
          </Tag>
        )}
        {!isUser && !isTypingPlaceholder && (
          <CopilotQaRecallMedia token={token} content={msg.content} />
        )}
        {citations.length > 0 && (
          <div className="mt-2 border-t border-slate-100 pt-2">
            <div className="flex items-center gap-1 text-xs text-slate-500 mb-1">
              <BookOutlined /> 引用来源
            </div>
            <ul className="space-y-1 text-xs text-slate-600">
              {citations.map((c: CopilotCitation, i: number) => (
                <li key={i} className="rounded-lg bg-slate-50 px-2 py-1">
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
  onDelete,
  onRename,
}: {
  sessions: CopilotSession[];
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
}) {
  const [renameTarget, setRenameTarget] = useState<CopilotSession | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [renaming, setRenaming] = useState(false);

  const openRename = (session: CopilotSession, event: React.MouseEvent) => {
    event.stopPropagation();
    setRenameTarget(session);
    setRenameTitle(session.title || '');
  };

  const submitRename = async () => {
    if (!renameTarget) return;
    const trimmed = renameTitle.trim();
    if (!trimmed) {
      message.warning('会话名称不能为空');
      return;
    }
    setRenaming(true);
    try {
      await onRename(renameTarget.id, trimmed);
      setRenameTarget(null);
    } catch {
      // 错误提示由父组件处理
    } finally {
      setRenaming(false);
    }
  };

  if (sessions.length === 0) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto">
        <Empty description="暂无历史会话" />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain p-4">
      <List
        dataSource={sessions}
        renderItem={(s) => (
          <List.Item
            className="cursor-pointer hover:bg-gray-50 rounded px-2"
            onClick={() => onResume(s.id)}
            actions={[
              <Button
                key="rename"
                type="text"
                size="small"
                icon={<EditOutlined />}
                aria-label="重命名会话"
                onClick={(e) => openRename(s, e)}
              />,
              <Popconfirm
                key="delete"
                title={`确认删除「${s.title || '未命名会话'}」？`}
                description="将永久删除该会话下的消息；关联任务与待确认审批一并移除，不可恢复。"
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={(e) => {
                  e?.stopPropagation();
                  onDelete(s.id);
                }}
                onCancel={(e) => e?.stopPropagation()}
              >
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label="删除会话"
                  onClick={(e) => e.stopPropagation()}
                />
              </Popconfirm>,
            ]}
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
      <Modal
        title="重命名会话"
        open={!!renameTarget}
        onCancel={() => setRenameTarget(null)}
        onOk={() => void submitRename()}
        confirmLoading={renaming}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Input
          value={renameTitle}
          onChange={(e) => setRenameTitle(e.target.value)}
          maxLength={256}
          placeholder="请输入会话名称"
          onPressEnter={() => void submitRename()}
        />
      </Modal>
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
    return (
      <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto">
        <Empty description="暂无待确认事项" />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain space-y-3 p-4">
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
    return (
      <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto">
        <Empty description="当前会话暂无任务（流程型能力执行后可见）" />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain space-y-3 p-4">
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
