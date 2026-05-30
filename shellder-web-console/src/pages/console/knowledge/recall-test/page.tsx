'use client';

import { ExperimentOutlined, SearchOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Empty,
  Input,
  InputNumber,
  Space,
  Tag,
  Typography,
} from 'antd';
import { App } from 'antd';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import { KnowledgeProxyErrorAlert } from '@/components/console/KnowledgeProxyErrorAlert';
import {
  DialogueRecallTestResponse,
  dialogueQaPreview,
  isKnowledgeProxyError,
} from '@/lib/knowledge-proxy';
import { isLlmError } from '@/lib/llm-settings';

export default function KnowledgeRecallTestPage() {
  const { message } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();

  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(6);
  const [bm25TopN, setBm25TopN] = useState(10);
  const [vectorTopN, setVectorTopN] = useState(10);
  const [wikiPrefix, setWikiPrefix] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<DialogueRecallTestResponse | undefined>();
  const [proxyError, setProxyError] = useState<unknown>();

  const activeTenantName = useMemo(
    () => tenants.find((t) => t.id === activeTenantId)?.name,
    [tenants, activeTenantId],
  );

  const handleTest = async () => {
    if (!activeTenantId) { message.warning('请先选择租户'); return; }
    if (!query.trim()) { message.warning('请输入问题'); return; }
    setSearching(true);
    setProxyError(undefined);
    setResult(undefined);
    try {
      const res = await dialogueQaPreview(activeTenantId, {
        query: query.trim(),
        top_k_chunks: topK,
        bm25_top_n: bm25TopN,
        vector_top_n: vectorTopN,
        wiki_prefix: wikiPrefix.trim() || undefined,
        system_prompt: systemPrompt.trim() || undefined,
      });
      setResult(res);
    } catch (err) {
      if (isKnowledgeProxyError(err) || isLlmError(err)) setProxyError(err);
      else message.error(err instanceof Error ? err.message : '问答测试失败');
    } finally {
      setSearching(false);
    }
  };

  return (
    <>
      <div className="mb-4">
        <Typography.Title level={3} className="!mb-0">
          <ExperimentOutlined className="mr-2" />问答测试
        </Typography.Title>
      </div>

      {!activeTenantId ? (
        <Alert type="warning" showIcon message="请先在顶栏选择「当前操作租户」"
          description="问答测试按租户隔离：Step1 pathy 召回 → Step2 平台 LLM 生成回答（与 Runtime 一致）。" />
      ) : (
        <>
          <Alert className="mb-4" type="info" showIcon
            message={`当前租户：${activeTenantName ?? activeTenantId}`}
            description={
              <>
                两阶段与问答型 Runtime 相同：pathy <code>dialogue/recall</code> 仅召回，
                最终回答由<Link to="/settings/llm"> 平台模型接入 </Link>配置的 LLM 生成。
                未配置 LLM 时将返回明确错误，不会回退 pathy recall-test。
              </>
            }
          />
          {proxyError && <KnowledgeProxyErrorAlert error={proxyError} className="mb-4" />}

          <Space className="mb-4" direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Typography.Text type="secondary" className="block mb-1">问题</Typography.Text>
              <Input.TextArea rows={3} value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="输入要测试的问题…" style={{ maxWidth: 640 }} />
            </div>

            <Collapse ghost items={[{
              key: 'advanced',
              label: '高级参数',
              children: (
                <Space wrap align="start">
                  <div>
                    <Typography.Text type="secondary" className="block mb-1">TopK 分块</Typography.Text>
                    <InputNumber min={1} max={32} value={topK} onChange={(v) => setTopK(v ?? 6)} />
                  </div>
                  <div>
                    <Typography.Text type="secondary" className="block mb-1">BM25 候选</Typography.Text>
                    <InputNumber min={1} max={100} value={bm25TopN} onChange={(v) => setBm25TopN(v ?? 10)} />
                  </div>
                  <div>
                    <Typography.Text type="secondary" className="block mb-1">向量候选</Typography.Text>
                    <InputNumber min={1} max={100} value={vectorTopN} onChange={(v) => setVectorTopN(v ?? 10)} />
                  </div>
                  <div>
                    <Typography.Text type="secondary" className="block mb-1">Wiki 前缀</Typography.Text>
                    <Input value={wikiPrefix} onChange={(e) => setWikiPrefix(e.target.value)}
                      placeholder="如 notes/" style={{ width: 200 }} />
                  </div>
                  <div>
                    <Typography.Text type="secondary" className="block mb-1">System Prompt 覆盖</Typography.Text>
                    <Input.TextArea rows={2} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
                      placeholder="可选；留空使用平台默认 QA 提示词" style={{ width: 320 }} />
                  </div>
                </Space>
              ),
            }]} />

            <Button type="primary" icon={<SearchOutlined />} loading={searching} onClick={handleTest}>
              开始测试
            </Button>
          </Space>

          {result && (
            <div className="space-y-4">
              {result.assistant_reply && (
                <Card title="平台 LLM 回答" size="small">
                  {result.model && (
                    <Typography.Text type="secondary" className="block mb-2">模型：{result.model}</Typography.Text>
                  )}
                  <div className="whitespace-pre-wrap">{result.assistant_reply}</div>
                </Card>
              )}

              <Typography.Title level={5}>
                召回命中（{result.recall_hits?.length ?? 0} 条）
                {result.recall_method && (
                  <Tag className="ml-2" color="blue">{result.recall_method}</Tag>
                )}
                {result.files_scanned != null && (
                  <Typography.Text type="secondary" className="ml-2 text-sm font-normal">
                    扫描 {result.files_scanned} 个文件
                  </Typography.Text>
                )}
              </Typography.Title>

              {(result.recall_hits?.length ?? 0) === 0 ? (
                <Empty description="未召回任何片段（仍由平台 LLM 生成礼貌说明）" />
              ) : (
                <div className="space-y-3">
                  {result.recall_hits.map((hit, i) => (
                    <Card key={`${hit.path}-${i}`} size="small" title={
                      <Space>
                        <Tag color="blue">#{i + 1}</Tag>
                        <span>{hit.path}</span>
                        <Typography.Text type="secondary">score: {hit.score.toFixed(4)}</Typography.Text>
                        {hit.heading_path && (
                          <Typography.Text type="secondary">{hit.heading_path}</Typography.Text>
                        )}
                      </Space>
                    }>
                      <pre className="text-sm whitespace-pre-wrap m-0">{hit.snippet}</pre>
                    </Card>
                  ))}
                </div>
              )}

              {result.injected_context && (
                <Collapse items={[{
                  key: 'context',
                  label: `注入上下文${result.context_truncated ? '（已截断）' : ''}`,
                  children: (
                    <pre className="text-sm whitespace-pre-wrap m-0 max-h-96 overflow-auto">
                      {result.injected_context}
                    </pre>
                  ),
                }]} />
              )}

              {result.message && (
                <Alert type="info" showIcon message={result.message} />
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
