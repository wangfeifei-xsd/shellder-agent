'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Descriptions,
  Input,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ellipsisTextColumn,
  renderOptionalText,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import {
  PromptTemplateDetail,
  PromptVersionItem,
  PromptVersionState,
  createPromptDraft,
  getPromptTemplate,
  listPromptBindings,
  listPromptVersions,
  publishPromptVersion,
  renderPrompt,
  renderPromptTestLlm,
  rollbackPromptVersion,
  updatePromptVersion,
  createPromptBinding,
  deletePromptBinding,
  PromptBinding,
  PromptBindType,
} from '@/lib/prompt';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export default function PromptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { message } = App.useApp();
  const [detail, setDetail] = useState<PromptTemplateDetail | null>(null);
  const [versions, setVersions] = useState<PromptVersionItem[]>([]);
  const [bindings, setBindings] = useState<PromptBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftContent, setDraftContent] = useState('');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [varsText, setVarsText] = useState('{}');
  const [renderResult, setRenderResult] = useState('');
  const [llmResult, setLlmResult] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [d, v, b] = await Promise.all([
        getPromptTemplate(id),
        listPromptVersions(id),
        listPromptBindings({ promptKey: undefined }),
      ]);
      setDetail(d);
      setVersions(v.items);
      const draft = v.items.find((x) => x.state === 'draft');
      setDraftId(draft?.id ?? null);
      setDraftContent(draft?.content ?? '');
      setBindings(b.items.filter((x) => x.promptKey === d.promptKey));
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [id, message]);

  useEffect(() => {
    load();
  }, [load]);

  const parseVars = (): Record<string, unknown> => {
    try {
      return JSON.parse(varsText || '{}') as Record<string, unknown>;
    } catch {
      throw new Error('变量 JSON 格式无效');
    }
  };

  const handleSaveDraft = async () => {
    if (!draftId) return;
    setBusy(true);
    try {
      await updatePromptVersion(draftId, { content: draftContent });
      message.success('草稿已保存');
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateDraft = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await createPromptDraft(id);
      message.success('已创建 draft');
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async () => {
    if (!draftId) return;
    setBusy(true);
    try {
      await publishPromptVersion(draftId);
      message.success('已发布');
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '发布失败');
    } finally {
      setBusy(false);
    }
  };

  const handleRollback = async (versionId: string) => {
    setBusy(true);
    try {
      await rollbackPromptVersion(versionId);
      message.success('已回滚为 published');
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '回滚失败');
    } finally {
      setBusy(false);
    }
  };

  const handleRender = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const variables = parseVars();
      const res = await renderPrompt({
        promptKey: detail.promptKey,
        tenantId: detail.tenantId ?? undefined,
        channel: 'published',
        variables,
      });
      setRenderResult(res.content);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '渲染失败');
    } finally {
      setBusy(false);
    }
  };

  const handleTestLlm = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const variables = parseVars();
      const res = await renderPromptTestLlm({
        promptKey: detail.promptKey,
        tenantId: detail.tenantId ?? undefined,
        variables,
      });
      setRenderResult(res.render.content);
      setLlmResult(res.llm.text);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '试跑失败');
    } finally {
      setBusy(false);
    }
  };

  const versionColumns: ColumnsType<PromptVersionItem> = [
    ellipsisTextColumn<PromptVersionItem>('版本', 'version', 72),
    withNowrap<PromptVersionItem>({
      title: '状态',
      dataIndex: 'state',
      width: 100,
      render: (s: PromptVersionState) => {
        const color = s === 'published' ? 'green' : s === 'draft' ? 'blue' : 'default';
        return <Tag color={color}>{s}</Tag>;
      },
    }),
    ellipsisTextColumn<PromptVersionItem>('说明', 'changelog', 200),
    withNowrap<PromptVersionItem>({
      title: '发布时间',
      dataIndex: 'publishedAt',
      width: 168,
      render: (v: string | null) => (v ? new Date(v).toLocaleString('zh-CN') : '—'),
    }),
    withNowrap<PromptVersionItem>({
      title: '操作',
      width: 100,
      render: (_, r) =>
        r.state === 'deprecated' ? (
          <Button type="link" size="small" disabled={busy} onClick={() => handleRollback(r.id)}>
            回滚
          </Button>
        ) : null,
    }),
  ];

  if (!detail && loading) {
    return <Card loading />;
  }
  if (!detail) {
    return <Text type="secondary">模板不存在</Text>;
  }

  return (
    <div className="space-y-4 p-1">
      <Space>
        <Link to="/prompts">
          <Button type="text" icon={<ArrowLeftOutlined />}>
            返回列表
          </Button>
        </Link>
        <Title level={4} className="!mb-0">
          {detail.name}
        </Title>
        <Tag>{detail.promptKey}</Tag>
      </Space>

      <Tabs
        items={[
          {
            key: 'info',
            label: '基本信息',
            children: (
              <Descriptions bordered column={1} size="small">
                <Descriptions.Item label="逻辑键">{detail.promptKey}</Descriptions.Item>
                <Descriptions.Item label="分类">{detail.category}</Descriptions.Item>
                <Descriptions.Item label="角色">{detail.role}</Descriptions.Item>
                <Descriptions.Item label="作用域">{detail.scope}</Descriptions.Item>
                <Descriptions.Item label="说明">{detail.description ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="已发布">
                  {detail.publishedVersion ? `v${detail.publishedVersion.version}` : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="变量 Schema">
                  <pre className="m-0 text-xs">
                    {JSON.stringify(detail.variableSchema ?? {}, null, 2)}
                  </pre>
                </Descriptions.Item>
              </Descriptions>
            ),
          },
          {
            key: 'versions',
            label: '版本列表',
            children: (
              <div className="space-y-4">
                <Space wrap>
                  <Button onClick={handleCreateDraft} loading={busy} disabled={!!draftId}>
                    新建 draft（自 published 复制）
                  </Button>
                  {draftId && (
                    <>
                      <Button type="primary" onClick={handleSaveDraft} loading={busy}>
                        保存草稿
                      </Button>
                      <Button type="primary" danger onClick={handlePublish} loading={busy}>
                        发布
                      </Button>
                    </>
                  )}
                </Space>
                {draftId && (
                  <TextArea
                    rows={16}
                    value={draftContent}
                    onChange={(e) => setDraftContent(e.target.value)}
                    placeholder="编辑 draft 正文…"
                  />
                )}
                <Table
                  rowKey="id"
                  size="small"
                  columns={versionColumns}
                  dataSource={versions}
                  pagination={false}
                  {...tableEllipsisLayout}
                />
              </div>
            ),
          },
          {
            key: 'test',
            label: '试跑',
            children: (
              <div className="space-y-3 max-w-3xl">
                <Text type="secondary">录入 Mustache 变量 JSON，可先「仅渲染」或「渲染并调 LLM」。</Text>
                <TextArea rows={6} value={varsText} onChange={(e) => setVarsText(e.target.value)} />
                <Space>
                  <Button onClick={handleRender} loading={busy}>
                    仅渲染
                  </Button>
                  <Button type="primary" onClick={handleTestLlm} loading={busy}>
                    渲染并调 LLM
                  </Button>
                </Space>
                {renderResult && (
                  <Card size="small" title="渲染结果">
                    <Paragraph className="whitespace-pre-wrap text-sm">{renderResult}</Paragraph>
                  </Card>
                )}
                {llmResult && (
                  <Card size="small" title="LLM 回复">
                    <Paragraph className="whitespace-pre-wrap text-sm">{llmResult}</Paragraph>
                  </Card>
                )}
              </div>
            ),
          },
          {
            key: 'bindings',
            label: '绑定配置',
            children: (
              <BindingsPanel
                promptKey={detail.promptKey}
                bindings={bindings}
                onRefresh={load}
                busy={busy}
                setBusy={setBusy}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

function BindingsPanel({
  promptKey,
  bindings,
  onRefresh,
  busy,
  setBusy,
}: {
  promptKey: string;
  bindings: PromptBinding[];
  onRefresh: () => Promise<void>;
  busy: boolean;
  setBusy: (v: boolean) => void;
}) {
  const { message } = App.useApp();
  const [bindType, setBindType] = useState<PromptBindType>('default');
  const [bindId, setBindId] = useState('');

  const handleCreate = async () => {
    setBusy(true);
    try {
      await createPromptBinding({
        bindType,
        bindId: bindId.trim() || undefined,
        promptKey,
        priority: 0,
      });
      message.success('绑定已创建');
      await onRefresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    setBusy(true);
    try {
      await deletePromptBinding(id);
      message.success('已删除');
      await onRefresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '删除失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Space wrap>
        <Select
          style={{ width: 140 }}
          value={bindType}
          onChange={setBindType}
          options={[
            { value: 'default', label: 'default' },
            { value: 'capability', label: 'capability' },
            { value: 'skill', label: 'skill' },
            { value: 'tool', label: 'tool' },
            { value: 'connector', label: 'connector' },
          ]}
        />
        <Input placeholder="bind_id（可选）" style={{ width: 220 }} value={bindId} onChange={(e) => setBindId(e.target.value)} />
        <Button type="primary" onClick={handleCreate} loading={busy}>
          新建绑定
        </Button>
      </Space>
      <Table
        rowKey="id"
        size="small"
        dataSource={bindings}
        pagination={false}
        {...tableEllipsisLayout}
        columns={[
          ellipsisTextColumn<PromptBinding>('类型', 'bindType', 100),
          withNowrap<PromptBinding>({
            title: 'bind_id',
            dataIndex: 'bindId',
            render: (v: string | null) => renderOptionalText(v),
          }),
          withNowrap<PromptBinding>({ title: '优先级', dataIndex: 'priority', width: 80 }),
          withNowrap<PromptBinding>({
            title: '操作',
            width: 80,
            render: (_, r) => (
              <Button type="link" danger size="small" disabled={busy} onClick={() => handleDelete(r.id)}>
                删除
              </Button>
            ),
          }),
        ]}
      />
    </div>
  );
}
