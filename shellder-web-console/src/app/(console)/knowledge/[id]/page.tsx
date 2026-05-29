'use client';

import {
  ArrowLeftOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  DOC_STATUS_META,
  DOC_STATUS_OPTIONS,
  DS_TYPE_META,
  DS_TYPE_OPTIONS,
  KbDataSource,
  KbDataSourceType,
  KbDocument,
  KbDocumentStatus,
  KbEmbeddingTask,
  KnowledgeBaseDetail,
  RetrieveResult,
  TASK_STATUS_META,
  addDataSource,
  deleteDocument,
  getKnowledgeBase,
  listDataSources,
  listDocuments,
  listEmbeddingTasks,
  removeDataSource,
  retrieveKnowledge,
  uploadDocument,
} from '@/lib/knowledge';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

export default function KnowledgeDetailPage() {
  const params = useParams();
  const kbId = params.id as string;
  const { message, modal } = App.useApp();

  const [kb, setKb] = useState<KnowledgeBaseDetail | undefined>();
  const [loading, setLoading] = useState(true);

  const loadKb = useCallback(async () => {
    setLoading(true);
    try { setKb(await getKnowledgeBase(kbId)); }
    catch (err) { message.error(err instanceof Error ? err.message : '加载知识库失败'); }
    finally { setLoading(false); }
  }, [kbId, message]);

  useEffect(() => { void loadKb(); }, [loadKb]);

  if (loading) return <div className="p-8 text-center"><Typography.Text type="secondary">加载中…</Typography.Text></div>;
  if (!kb) return <Alert type="error" showIcon message="知识库不存在或无权限" />;

  return (
    <>
      <div className="mb-4 flex items-center gap-4">
        <Link href="/knowledge"><Button icon={<ArrowLeftOutlined />}>返回列表</Button></Link>
        <Typography.Title level={3} className="!mb-0">{kb.name}</Typography.Title>
        <Tag color={kb.status === 'active' ? 'green' : 'default'}>{kb.status === 'active' ? '正常' : '已禁用'}</Tag>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-4">
        <Card><Statistic title="文档数" value={kb.documentCount} /></Card>
        <Card><Statistic title="分块数" value={kb.chunkCount} /></Card>
        <Card><Statistic title="数据源数" value={kb.dataSourceCount} /></Card>
        <Card><Statistic title="Embedding 模型" valueStyle={{ fontSize: 14 }} value={kb.embeddingModel} /></Card>
      </div>

      <Tabs items={[
        { key: 'documents', label: '文档管理', children: <DocumentsTab kbId={kbId} kb={kb} onRefresh={loadKb} /> },
        { key: 'sources', label: '数据源', children: <DataSourcesTab kbId={kbId} kb={kb} /> },
        { key: 'retrieve', label: '检索测试', children: <RetrieveTab kbId={kbId} /> },
        { key: 'tasks', label: '向量化任务', children: <EmbeddingTasksTab kbId={kbId} /> },
        {
          key: 'config',
          label: '配置',
          children: (
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="分块策略">{kb.chunkStrategy}</Descriptions.Item>
              <Descriptions.Item label="分块大小">{kb.chunkSize} 字符</Descriptions.Item>
              <Descriptions.Item label="重叠大小">{kb.chunkOverlap} 字符</Descriptions.Item>
              <Descriptions.Item label="相似度算法">{kb.similarityMetric}</Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>{kb.description || '—'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{fmt(kb.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{fmt(kb.updatedAt)}</Descriptions.Item>
            </Descriptions>
          ),
        },
      ]} />
    </>
  );
}

// ── 文档管理 Tab ────────────────────────────────────────────

function DocumentsTab({ kbId, kb, onRefresh }: { kbId: string; kb: KnowledgeBaseDetail; onRefresh: () => void }) {
  const { message, modal } = App.useApp();
  const [docs, setDocs] = useState<KbDocument[]>([]);
  const [docLoading, setDocLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadContent, setUploadContent] = useState('');
  const [uploading, setUploading] = useState(false);

  const loadDocs = useCallback(async () => {
    setDocLoading(true);
    try {
      const res = await listDocuments(kbId, { status: statusFilter, keyword: keyword || undefined, pageSize: 200 });
      setDocs(res.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载文档列表失败');
    } finally { setDocLoading(false); }
  }, [kbId, statusFilter, keyword, message]);

  useEffect(() => { void loadDocs(); }, [loadDocs]);

  const handleUpload = async () => {
    if (!uploadTitle.trim()) { message.warning('请输入文档标题'); return; }
    if (!uploadContent.trim()) { message.warning('请输入文档内容'); return; }
    setUploading(true);
    try {
      await uploadDocument(kbId, {
        title: uploadTitle.trim(),
        content: uploadContent,
        mimeType: 'text/plain',
        fileSize: new Blob([uploadContent]).size,
      });
      message.success('文档上传成功，正在处理…');
      setUploadOpen(false);
      setUploadTitle('');
      setUploadContent('');
      void loadDocs();
      onRefresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '上传失败');
    } finally { setUploading(false); }
  };

  const handleDeleteDoc = (doc: KbDocument) => {
    modal.confirm({
      title: `确认删除文档「${doc.title}」？`,
      content: '删除后关联分块将被清理。',
      okButtonProps: { danger: true },
      onOk: async () => {
        try { await deleteDocument(kbId, doc.id); message.success('已删除'); void loadDocs(); onRefresh(); }
        catch (err) { message.error(err instanceof Error ? err.message : '删除失败'); }
      },
    });
  };

  const docColumns: ColumnsType<KbDocument> = [
    { title: '文档标题', dataIndex: 'title', ellipsis: true },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (s: KbDocumentStatus) => <Tag color={DOC_STATUS_META[s]?.color}>{DOC_STATUS_META[s]?.label ?? s}</Tag>,
    },
    { title: '字符数', dataIndex: 'charCount', width: 80, align: 'right' },
    { title: '分块数', dataIndex: 'chunkCount', width: 80, align: 'right' },
    { title: '类型', dataIndex: 'mimeType', width: 120, render: (v: string | null) => v || '—' },
    { title: '创建时间', dataIndex: 'createdAt', width: 160, render: (v: string) => fmt(v) },
    { title: '错误信息', dataIndex: 'errorMsg', ellipsis: true, render: (v: string | null) => v || '—' },
    {
      title: '操作', key: 'actions', width: 80,
      render: (_, row) => (
        <a className="text-red-500" onClick={() => handleDeleteDoc(row)}>
          <DeleteOutlined /> 删除
        </a>
      ),
    },
  ];

  return (
    <>
      <Space className="mb-4" wrap>
        <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>上传文档</Button>
        <Input.Search allowClear placeholder="搜索标题" style={{ width: 220 }} onSearch={setKeyword} />
        <Select allowClear placeholder="状态" style={{ width: 120 }} options={DOC_STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
        <Button icon={<ReloadOutlined />} onClick={() => void loadDocs()}>刷新</Button>
      </Space>
      <Table<KbDocument> rowKey="id" loading={docLoading} columns={docColumns} dataSource={docs}
        pagination={false} locale={{ emptyText: <Empty description="暂无文档" /> }}
      />

      <Modal title="上传文档" open={uploadOpen} onCancel={() => setUploadOpen(false)} width={640}
        footer={[
          <Button key="cancel" onClick={() => setUploadOpen(false)}>取消</Button>,
          <Button key="ok" type="primary" loading={uploading} onClick={handleUpload}>上传</Button>,
        ]}
      >
        <Alert className="mb-3" type="info" showIcon message="V1 支持文本内容直接粘贴上传，文件上传功能将在后续版本支持。" />
        <Form layout="vertical">
          <Form.Item label="文档标题" required>
            <Input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="如：产品使用手册" />
          </Form.Item>
          <Form.Item label="文档内容" required>
            <Input.TextArea rows={10} value={uploadContent} onChange={(e) => setUploadContent(e.target.value)}
              placeholder="粘贴文档内容（支持 txt / md 格式文本）…"
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ── 数据源管理 Tab ──────────────────────────────────────────

function DataSourcesTab({ kbId, kb }: { kbId: string; kb: KnowledgeBaseDetail }) {
  const { message, modal } = App.useApp();
  const [sources, setSources] = useState<KbDataSource[]>([]);
  const [dsLoading, setDsLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addType, setAddType] = useState<KbDataSourceType>('file');
  const [adding, setAdding] = useState(false);

  const loadSources = useCallback(async () => {
    setDsLoading(true);
    try { setSources(await listDataSources(kbId)); }
    catch (err) { message.error(err instanceof Error ? err.message : '加载数据源失败'); }
    finally { setDsLoading(false); }
  }, [kbId, message]);

  useEffect(() => { void loadSources(); }, [loadSources]);

  const handleAdd = async () => {
    if (!addName.trim()) { message.warning('请输入数据源名称'); return; }
    setAdding(true);
    try {
      await addDataSource(kbId, { name: addName.trim(), type: addType });
      message.success('数据源已添加');
      setAddOpen(false);
      setAddName('');
      void loadSources();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '添加失败');
    } finally { setAdding(false); }
  };

  const handleRemove = (ds: KbDataSource) => {
    modal.confirm({
      title: `确认移除数据源「${ds.name}」？`,
      okButtonProps: { danger: true },
      onOk: async () => {
        try { await removeDataSource(kbId, ds.id); message.success('已移除'); void loadSources(); }
        catch (err) { message.error(err instanceof Error ? err.message : '移除失败'); }
      },
    });
  };

  const dsColumns: ColumnsType<KbDataSource> = [
    { title: '名称', dataIndex: 'name' },
    {
      title: '类型', dataIndex: 'type', width: 100,
      render: (t: KbDataSourceType) => <Tag color={DS_TYPE_META[t]?.color}>{DS_TYPE_META[t]?.label ?? t}</Tag>,
    },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag>{v}</Tag> },
    { title: '同步 Cron', dataIndex: 'syncCron', width: 120, render: (v: string | null) => v || '—' },
    { title: '最近同步', dataIndex: 'lastSyncAt', width: 160, render: (v: string | null) => fmt(v) },
    { title: '创建时间', dataIndex: 'createdAt', width: 160, render: (v: string) => fmt(v) },
    {
      title: '操作', key: 'actions', width: 80,
      render: (_, row) => <a className="text-red-500" onClick={() => handleRemove(row)}>移除</a>,
    },
  ];

  return (
    <>
      <Space className="mb-4">
        <Button icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>添加数据源</Button>
        <Button icon={<ReloadOutlined />} onClick={() => void loadSources()}>刷新</Button>
      </Space>
      <Table<KbDataSource> rowKey="id" loading={dsLoading} columns={dsColumns} dataSource={sources}
        pagination={false} locale={{ emptyText: <Empty description="暂无数据源" /> }}
      />
      <Modal title="添加数据源" open={addOpen} onCancel={() => setAddOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setAddOpen(false)}>取消</Button>,
          <Button key="ok" type="primary" loading={adding} onClick={handleAdd}>确定</Button>,
        ]}
      >
        <Form layout="vertical">
          <Form.Item label="数据源名称" required>
            <Input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="如：产品文档库" />
          </Form.Item>
          <Form.Item label="类型">
            <Select value={addType} onChange={setAddType} options={DS_TYPE_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ── 检索测试 Tab ────────────────────────────────────────────

function RetrieveTab({ kbId }: { kbId: string }) {
  const { message } = App.useApp();
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(5);
  const [threshold, setThreshold] = useState(0);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<RetrieveResult | undefined>();

  const handleSearch = async () => {
    if (!query.trim()) { message.warning('请输入检索内容'); return; }
    setSearching(true);
    try {
      setResult(await retrieveKnowledge(kbId, { query: query.trim(), topK, threshold }));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '检索失败');
    } finally { setSearching(false); }
  };

  return (
    <>
      <Alert className="mb-4" type="info" showIcon
        message="输入检索语句，从知识库中检索相似的文档分块。V1 使用文本匹配，集成 Embedding 模型后支持向量语义检索。"
      />
      <Space className="mb-4" wrap align="end">
        <div>
          <Typography.Text type="secondary" className="block mb-1">检索内容</Typography.Text>
          <Input.TextArea rows={2} style={{ width: 400 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="输入要检索的内容…" />
        </div>
        <div>
          <Typography.Text type="secondary" className="block mb-1">TopK</Typography.Text>
          <InputNumber min={1} max={100} value={topK} onChange={(v) => setTopK(v ?? 5)} style={{ width: 80 }} />
        </div>
        <div>
          <Typography.Text type="secondary" className="block mb-1">阈值</Typography.Text>
          <InputNumber min={0} max={1} step={0.1} value={threshold} onChange={(v) => setThreshold(v ?? 0)} style={{ width: 80 }} />
        </div>
        <Button type="primary" icon={<SearchOutlined />} loading={searching} onClick={handleSearch}>检索</Button>
      </Space>

      {result && (
        <>
          <Typography.Title level={5}>检索结果（{result.results.length} 条）</Typography.Title>
          {result.results.length === 0 ? (
            <Empty description="未找到匹配内容" />
          ) : (
            <div className="space-y-3">
              {result.results.map((r, i) => (
                <Card key={r.chunkId} size="small" title={
                  <Space>
                    <Tag color="blue">#{i + 1}</Tag>
                    <span>{r.documentTitle}</span>
                    <Typography.Text type="secondary">分块 {r.chunkIndex}</Typography.Text>
                    <Typography.Text type="secondary">{r.tokenCount} tokens</Typography.Text>
                  </Space>
                }>
                  <pre className="text-sm whitespace-pre-wrap m-0">{r.content}</pre>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

// ── 向量化任务 Tab ──────────────────────────────────────────

function EmbeddingTasksTab({ kbId }: { kbId: string }) {
  const { message } = App.useApp();
  const [tasks, setTasks] = useState<KbEmbeddingTask[]>([]);
  const [taskLoading, setTaskLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const loadTasks = useCallback(async () => {
    setTaskLoading(true);
    try {
      const res = await listEmbeddingTasks(kbId, { status: statusFilter, pageSize: 100 });
      setTasks(res.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载任务列表失败');
    } finally { setTaskLoading(false); }
  }, [kbId, statusFilter, message]);

  useEffect(() => { void loadTasks(); }, [loadTasks]);

  const taskColumns: ColumnsType<KbEmbeddingTask> = [
    { title: '文档', dataIndex: ['document', 'title'], render: (v: string | undefined) => v || '—' },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (s: string) => <Tag color={TASK_STATUS_META[s as keyof typeof TASK_STATUS_META]?.color}>
        {TASK_STATUS_META[s as keyof typeof TASK_STATUS_META]?.label ?? s}
      </Tag>,
    },
    {
      title: '进度', key: 'progress', width: 120,
      render: (_, row) => row.totalChunks > 0
        ? `${row.processedChunks}/${row.totalChunks}（${Math.round(row.processedChunks / row.totalChunks * 100)}%）`
        : '—',
    },
    { title: '错误信息', dataIndex: 'errorMsg', ellipsis: true, render: (v: string | null) => v || '—' },
    { title: '开始时间', dataIndex: 'startedAt', width: 160, render: (v: string | null) => fmt(v) },
    { title: '完成时间', dataIndex: 'finishedAt', width: 160, render: (v: string | null) => fmt(v) },
    { title: '创建时间', dataIndex: 'createdAt', width: 160, render: (v: string) => fmt(v) },
  ];

  const taskStatusOptions = [
    { value: 'queued', label: '排队中' },
    { value: 'running', label: '运行中' },
    { value: 'done', label: '完成' },
    { value: 'failed', label: '失败' },
  ];

  return (
    <>
      <Space className="mb-4">
        <Select allowClear placeholder="状态" style={{ width: 120 }} options={taskStatusOptions} value={statusFilter} onChange={setStatusFilter} />
        <Button icon={<ReloadOutlined />} onClick={() => void loadTasks()}>刷新</Button>
      </Space>
      <Table<KbEmbeddingTask> rowKey="id" loading={taskLoading} columns={taskColumns} dataSource={tasks}
        pagination={false} locale={{ emptyText: <Empty description="暂无向量化任务" /> }}
      />
    </>
  );
}
