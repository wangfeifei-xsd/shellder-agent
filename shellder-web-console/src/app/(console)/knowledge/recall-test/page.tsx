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
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import { KnowledgeProxyErrorAlert } from '@/components/console/KnowledgeProxyErrorAlert';
import {
  DialogueRecallTestResponse,
  dialogueRecallTest,
  isKnowledgeProxyError,
} from '@/lib/knowledge-proxy';

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
      const res = await dialogueRecallTest(activeTenantId, {
        query: query.trim(),
        top_k_chunks: topK,
        bm25_top_n: bm25TopN,
        vector_top_n: vectorTopN,
        wiki_prefix: wikiPrefix.trim() || undefined,
        system_prompt: systemPrompt.trim() || undefined,
      });
      setResult(res);
    } catch (err) {
      if (isKnowledgeProxyError(err)) setProxyError(err);
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
          description="问答测试按租户隔离，调用平台代理 pathy recall-test 接口（召回 + LLM 回答）。" />
      ) : (
        <>
          <Alert className="mb-4" type="info" showIcon
            message={`当前租户：${activeTenantName ?? activeTenantId}`}
            description="输入自然语言问题，查看召回命中列表与模型最终回答。与运行时共用 hybrid_bm25_vector 召回链路。"
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
                    <Typography.Text type="secondary" className="block mb-1">System Prompt</Typography.Text>
                    <Input.TextArea rows={2} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
                      placeholder="可选" style={{ width: 320 }} />
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
                <Card title="模型回答" size="small">
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
                <Empty description="未召回任何片段" />
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
