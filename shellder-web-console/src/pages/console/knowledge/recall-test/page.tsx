'use client';

import {
  App,
  Alert,
  Button,
  Card,
  Collapse,
  Form,
  Input,
  InputNumber,
  Segmented,
  Space,
  Table,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { InjectedContextMediaPanel } from '@/components/console/knowledge/InjectedContextMediaPanel';
import { RecallLaneSummary } from '@/components/console/knowledge/RecallLaneSummary';
import {
  useWikiPrefixTree,
  WikiPrefixFormItem,
} from '@/components/console/knowledge/WikiPrefixFormItem';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import { KnowledgeProxyErrorAlert } from '@/components/console/KnowledgeProxyErrorAlert';
import {
  DialogueRecallHit,
  DialogueRecallResponse,
  DialogueRecallTestResponse,
  dialogueQaPreview,
  dialogueRecall,
  isKnowledgeProxyError,
  knowledgeProxyErrorMessage,
} from '@/lib/knowledge-proxy';
import { isLlmError } from '@/lib/llm-settings';
import { listPromptTemplates } from '@/lib/prompt';

const { Paragraph, Text } = Typography;

const QA_DIALOGUE_SYSTEM_KEY = 'qa.dialogue.system';

type TestTab = 'recall' | 'qa';

const SCAN_DEFAULTS = {
  wiki_prefixes: [] as string[],
  max_files: 80,
  bm25_top_n: 10,
  vector_top_n: 10,
  top_k_chunks: 6,
  chunk_max_chars: 1200,
  context_budget_chars: 12000,
};

function RecallOnlyResult({
  res,
  tenantId,
}: {
  res: DialogueRecallResponse;
  tenantId: string;
}) {
  const injectedBundle = useMemo(
    () => ({
      injected_context: res.injected_context ?? '',
      merged_media: res.merged_media ?? [],
    }),
    [res.injected_context, res.merged_media],
  );

  return (
    <div style={{ marginTop: 16 }}>
      <Paragraph>
        <strong>召回方式：</strong>
        {res.recall_method}
        {res.files_scanned != null ? ` · 扫描文件：${res.files_scanned}` : ''}
        {res.context_truncated ? ' · 上下文已截断' : ''}
      </Paragraph>
      {res.bm25 && res.vector ? (
        <Space direction="vertical" size={4} style={{ width: '100%', marginBottom: 8 }}>
          <RecallLaneSummary title="BM25" lane={res.bm25} />
          <RecallLaneSummary title="向量" lane={res.vector} showEmbeddingModel />
        </Space>
      ) : null}
      {res.query_terms != null ? (
        <Paragraph type="secondary">
          参与打分的词项（已去停用词）：
          {res.query_terms.length ? res.query_terms.join('、') : '（无，可能仅含停用词或无法分词）'}
        </Paragraph>
      ) : null}
      <Paragraph strong style={{ marginTop: 8 }}>
        召回命中
      </Paragraph>
      <Table<DialogueRecallHit>
        size="small"
        pagination={false}
        rowKey={(_, i) => String(i)}
        dataSource={res.recall_hits ?? []}
        columns={[
          { title: '路径', dataIndex: 'path', key: 'path', ellipsis: true },
          {
            title: '标题路径',
            dataIndex: 'heading_path',
            key: 'heading_path',
            width: 160,
            ellipsis: true,
            render: (v: string | undefined) => (v?.trim() ? v : '—'),
          },
          { title: '得分', dataIndex: 'score', key: 'score', width: 100 },
          { title: '预览', dataIndex: 'snippet', key: 'snippet', ellipsis: true },
        ]}
      />
      {res.injected_context != null && (
        <Collapse
          style={{ marginTop: 12 }}
          items={[
            {
              key: 'ctx',
              label: 'injected_context（拼接后的纯文本参考资料）',
              children: <Input.TextArea value={res.injected_context} readOnly rows={10} />,
            },
          ]}
        />
      )}
      <InjectedContextMediaPanel tenantId={tenantId} recall={injectedBundle} variant="recall" />
      {res.message ? (
        <Paragraph type="secondary" style={{ marginTop: 8 }}>
          {res.message}
        </Paragraph>
      ) : null}
    </div>
  );
}

function QaTestResult({
  res,
  tenantId,
  publishedPromptVersion,
}: {
  res: DialogueRecallTestResponse;
  tenantId: string;
  publishedPromptVersion: number | null;
}) {
  const injectedBundle = useMemo(
    () => ({
      injected_context: res.injected_context ?? '',
      merged_media: res.merged_media ?? [],
    }),
    [res.injected_context, res.merged_media],
  );

  return (
    <div style={{ marginTop: 16 }}>
      <Paragraph>
        <strong>模型：</strong>
        {res.model ?? '—'} · 召回方式：{res.recall_method}
        {res.files_scanned != null ? ` · 扫描文件：${res.files_scanned}` : ''}
        {res.context_truncated ? ' · 上下文已截断' : ''}
        {res.prompt_version != null ? (
          <>
            {' '}
            · Prompt {res.prompt_key ?? QA_DIALOGUE_SYSTEM_KEY} v{res.prompt_version}
            {res.prompt_channel ? ` (${res.prompt_channel})` : ''}
          </>
        ) : publishedPromptVersion != null ? (
          <>
            {' '}
            · Prompt {QA_DIALOGUE_SYSTEM_KEY} v{publishedPromptVersion}
          </>
        ) : null}
        {res.elapsed_ms != null ? ` · LLM ${res.elapsed_ms}ms` : ''}
      </Paragraph>
      {res.bm25 && res.vector ? (
        <Space direction="vertical" size={4} style={{ width: '100%', marginBottom: 8 }}>
          <RecallLaneSummary title="BM25" lane={res.bm25} />
          <RecallLaneSummary title="向量" lane={res.vector} showEmbeddingModel />
        </Space>
      ) : null}
      {res.query_terms != null ? (
        <Paragraph type="secondary">
          参与打分的词项（已去停用词）：
          {res.query_terms.length ? res.query_terms.join('、') : '（无）'}
        </Paragraph>
      ) : null}
      <Paragraph strong style={{ marginTop: 8 }}>
        召回命中
      </Paragraph>
      <Table<DialogueRecallHit>
        size="small"
        pagination={false}
        rowKey={(_, i) => String(i)}
        dataSource={res.recall_hits ?? []}
        columns={[
          { title: '路径', dataIndex: 'path', key: 'path', ellipsis: true },
          {
            title: '标题路径',
            dataIndex: 'heading_path',
            key: 'heading_path',
            width: 160,
            ellipsis: true,
            render: (v: string | undefined) => (v?.trim() ? v : '—'),
          },
          { title: '得分', dataIndex: 'score', key: 'score', width: 100 },
          { title: '预览', dataIndex: 'snippet', key: 'snippet', ellipsis: true },
        ]}
      />
      {res.injected_context != null && (
        <Collapse
          style={{ marginTop: 12 }}
          items={[
            {
              key: 'ctx',
              label: 'injected_context（已拼入模型 user 消息的纯文本参考资料）',
              children: <Input.TextArea value={res.injected_context} readOnly rows={10} />,
            },
          ]}
        />
      )}
      <InjectedContextMediaPanel tenantId={tenantId} recall={injectedBundle} variant="qa" />
      {res.assistant_reply != null && (
        <>
          <Paragraph strong style={{ marginTop: 16 }}>
            平台 LLM 回答
          </Paragraph>
          <Input.TextArea value={res.assistant_reply} readOnly rows={10} />
        </>
      )}
      {res.message ? (
        <Paragraph type="secondary" style={{ marginTop: 8 }}>
          {res.message}
        </Paragraph>
      ) : null}
    </div>
  );
}

export default function KnowledgeRecallTestPage() {
  const { message } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();
  const [tab, setTab] = useState<TestTab>('recall');
  const [recallForm] = Form.useForm();
  const [qaForm] = Form.useForm();

  const [recallRes, setRecallRes] = useState<DialogueRecallResponse | null>(null);
  const [qaRes, setQaRes] = useState<DialogueRecallTestResponse | null>(null);
  const [recallBusy, setRecallBusy] = useState(false);
  const [qaBusy, setQaBusy] = useState(false);
  const [recallError, setRecallError] = useState<unknown>();
  const [qaError, setQaError] = useState<unknown>();
  const [publishedPromptVersion, setPublishedPromptVersion] = useState<number | null>(null);

  const activeTenantName = useMemo(
    () => tenants.find((t) => t.id === activeTenantId)?.name,
    [tenants, activeTenantId],
  );

  const { treeData: wikiPrefixTreeData, loading: wikiPrefixTreeLoading } =
    useWikiPrefixTree(activeTenantId);

  useEffect(() => {
    let cancelled = false;
    listPromptTemplates({ keyword: QA_DIALOGUE_SYSTEM_KEY, pageSize: 20 })
      .then((res) => {
        if (cancelled) return;
        const tpl = res.items.find((i) => i.promptKey === QA_DIALOGUE_SYSTEM_KEY);
        setPublishedPromptVersion(tpl?.publishedVersion ?? null);
      })
      .catch(() => {
        if (!cancelled) setPublishedPromptVersion(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onRecallOnly = async () => {
    if (!activeTenantId) {
      message.warning('请先选择租户');
      return;
    }
    const v = await recallForm.validateFields();
    setRecallBusy(true);
    setRecallError(undefined);
    setRecallRes(null);
    try {
      const data = await dialogueRecall(activeTenantId, {
        query: v.query as string,
        wiki_prefixes: (v.wiki_prefixes as string[] | undefined)?.length
          ? (v.wiki_prefixes as string[])
          : undefined,
        max_files: v.max_files,
        bm25_top_n: v.bm25_top_n,
        vector_top_n: v.vector_top_n,
        top_k_chunks: v.top_k_chunks,
        chunk_max_chars: v.chunk_max_chars,
        context_budget_chars: v.context_budget_chars,
      });
      setRecallRes(data);
      message.success('召回完成');
    } catch (err) {
      if (isKnowledgeProxyError(err)) setRecallError(err);
      else message.error(knowledgeProxyErrorMessage(err));
    } finally {
      setRecallBusy(false);
    }
  };

  const onQaTest = async () => {
    if (!activeTenantId) {
      message.warning('请先选择租户');
      return;
    }
    const v = await qaForm.validateFields();
    setQaBusy(true);
    setQaError(undefined);
    setQaRes(null);
    try {
      const data = await dialogueQaPreview(activeTenantId, {
        query: v.query as string,
        wiki_prefixes: (v.wiki_prefixes as string[] | undefined)?.length
          ? (v.wiki_prefixes as string[])
          : undefined,
        top_k_chunks: v.top_k_chunks,
        bm25_top_n: v.bm25_top_n,
        vector_top_n: v.vector_top_n,
      });
      setQaRes(data);
      message.success('知识型问答测试完成');
    } catch (err) {
      if (isKnowledgeProxyError(err) || isLlmError(err)) setQaError(err);
      else message.error(knowledgeProxyErrorMessage(err));
    } finally {
      setQaBusy(false);
    }
  };

  if (!activeTenantId) {
    return (
      <>
        <Typography.Title level={3} className="!mb-4">
          问答测试
        </Typography.Title>
        <Alert
          type="warning"
          showIcon
          message="请先在顶栏选择「当前操作租户」"
          description="召回与知识型问答测试均按租户 wiki 前缀隔离。"
        />
      </>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={3} className="!mb-0">
        问答测试
      </Typography.Title>
      <Alert type="info" showIcon message={`当前租户：${activeTenantName ?? activeTenantId}`} />

      <Segmented<TestTab>
        value={tab}
        onChange={setTab}
        options={[
          { label: '召回知识', value: 'recall' },
          { label: '知识型问答测试', value: 'qa' },
        ]}
      />

      <Card title={tab === 'recall' ? '召回知识' : '知识型问答测试（与 Runtime 一致）'}>
        {tab === 'recall' ? (
          recallError != null ? <KnowledgeProxyErrorAlert error={recallError} className="mb-4" /> : null
        ) : qaError != null ? (
          <KnowledgeProxyErrorAlert error={qaError} className="mb-4" />
        ) : null}

        {tab === 'recall' ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="说明"
            description={
              <span>
                在 <strong>wiki</strong> 编译层执行 <strong>BM25 + 向量</strong> 双路召回（各自 topN），合并去重后拼接为{' '}
                <Text code>injected_context</Text>（<strong>不调用 LLM</strong>，仅供核对）。接口：
                <Text code> POST /api/v1/knowledge/dialogue/recall</Text>。
              </span>
            }
          />
        ) : (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="流水线说明"
            description={
              <span>
                Step1：wiki <Text code>dialogue/recall</Text> 召回；Step2：平台{' '}
                <Link to="/settings/llm">模型接入</Link> 的 LLM 生成回答。System 来自已发布 Prompt{' '}
                <Text code>{QA_DIALOGUE_SYSTEM_KEY}</Text>
                {publishedPromptVersion != null && (
                  <>
                    （v{publishedPromptVersion}，见 <Link to="/prompts">Prompt 管理</Link>）
                  </>
                )}
                。接口：<Text code>POST /api/v1/knowledge/dialogue/qa-preview</Text>。
              </span>
            }
          />
        )}

        <div className={tab === 'recall' ? undefined : 'hidden'} aria-hidden={tab !== 'recall'}>
        <Form form={recallForm} layout="vertical" initialValues={SCAN_DEFAULTS}>
          <Form.Item
            name="query"
            label="自然语言输入"
            rules={[{ required: true, message: '请输入问句或指令' }]}
          >
            <Input.TextArea rows={4} placeholder="例如：知识库里关于 XXX 的说明是什么？" />
          </Form.Item>
          <Collapse
            bordered={false}
            style={{ marginBottom: 8, background: 'transparent' }}
            defaultActiveKey={[]}
            items={[
              {
                key: 'optional-scan',
                label: '可选参数（wiki 前缀、双路 topN、topK 与分块）',
                children: (
                  <>
                    <WikiPrefixFormItem
                      tenantId={activeTenantId}
                      treeData={wikiPrefixTreeData}
                      treeLoading={wikiPrefixTreeLoading}
                    />
                    <Space wrap style={{ width: '100%' }}>
                      <Form.Item name="max_files" label="最多扫描文件数" style={{ minWidth: 160 }}>
                        <InputNumber min={1} max={500} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name="bm25_top_n" label="BM25 候选 topN" style={{ minWidth: 160 }}>
                        <InputNumber min={1} max={100} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name="vector_top_n" label="向量候选 topN" style={{ minWidth: 160 }}>
                        <InputNumber min={1} max={100} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name="top_k_chunks" label="最终注入 topK" style={{ minWidth: 140 }}>
                        <InputNumber min={1} max={32} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name="chunk_max_chars" label="单片段最大字符" style={{ minWidth: 160 }}>
                        <InputNumber min={400} max={8000} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name="context_budget_chars" label="上下文总预算" style={{ minWidth: 160 }}>
                        <InputNumber min={2000} max={100000} step={1000} style={{ width: '100%' }} />
                      </Form.Item>
                    </Space>
                  </>
                ),
              },
            ]}
          />
          <Button type="primary" onClick={() => void onRecallOnly()} loading={recallBusy}>
            执行召回
          </Button>
        </Form>
        {recallRes && <RecallOnlyResult res={recallRes} tenantId={activeTenantId} />}
        </div>

        <div className={tab === 'qa' ? undefined : 'hidden'} aria-hidden={tab !== 'qa'}>
        <Form form={qaForm} layout="vertical" initialValues={SCAN_DEFAULTS}>
          <Form.Item
            name="query"
            label="自然语言输入"
            rules={[{ required: true, message: '请输入问句或指令' }]}
          >
            <Input.TextArea rows={4} placeholder="例如：根据知识库内容回答……" />
          </Form.Item>
          <Collapse
            bordered={false}
            style={{ marginBottom: 8, background: 'transparent' }}
            defaultActiveKey={[]}
            items={[
              {
                key: 'optional-recall',
                label: '可选参数（wiki 前缀、双路 topN、topK）',
                children: (
                  <>
                    <WikiPrefixFormItem
                      tenantId={activeTenantId}
                      treeData={wikiPrefixTreeData}
                      treeLoading={wikiPrefixTreeLoading}
                    />
                    <Space wrap style={{ width: '100%' }}>
                      <Form.Item name="bm25_top_n" label="BM25 候选 topN" style={{ minWidth: 160 }}>
                        <InputNumber min={1} max={100} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name="vector_top_n" label="向量候选 topN" style={{ minWidth: 160 }}>
                        <InputNumber min={1} max={100} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name="top_k_chunks" label="最终注入 topK" style={{ minWidth: 140 }}>
                        <InputNumber min={1} max={32} style={{ width: '100%' }} />
                      </Form.Item>
                    </Space>
                  </>
                ),
              },
            ]}
          />
          <Button type="primary" onClick={() => void onQaTest()} loading={qaBusy}>
            执行知识型测试
          </Button>
        </Form>
        {qaRes && (
          <QaTestResult
            res={qaRes}
            tenantId={activeTenantId}
            publishedPromptVersion={publishedPromptVersion}
          />
        )}
        </div>
      </Card>
    </Space>
  );
}
