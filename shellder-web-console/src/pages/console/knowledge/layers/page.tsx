'use client';

import { FileAddOutlined, UploadOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  Col,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd';
import type { UploadProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Key } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import { KnowledgeProxyErrorAlert } from '@/components/console/KnowledgeProxyErrorAlert';
import {
  joinUploadDirAndFileName,
  mapDataFolderToTreeSelect,
  prefixToBrowseDirKey,
  browseDirKeyToPrefix,
} from '@/components/console/knowledgeFolderTree';
import {
  SCHEMA_CREATE_TEMPLATE,
  UPLOAD_CHUNK_CHARS,
  defaultSchemaRelativePath,
  entryApiPath,
  expandUploadPaths,
  findHeadingLineIndex,
  lineCharRange,
  splitTextByMaxChars,
} from '@/lib/knowledge-layers-utils';
import { WikiBrowseTreeSelect } from '@/components/console/knowledge/WikiPrefixFormItem';
import {
  DialogueRecallHit,
  FileContentResponse,
  KnowledgeLayer,
  LayerEntry,
  TEXT_LAYERS,
  WikiEmbedResponse,
  DATA_TREE_DEFAULT_OPTS,
  deleteLayerFile,
  dialogueRecall,
  getDataTree,
  openMediaInNewTab,
  isKnowledgeProxyError,
  knowledgeProxyErrorMessage,
  listLayerEntries,
  polishText,
  readLayerFile,
  triggerLayerEmbed,
  uploadLayerFile,
  writeLayerFile,
} from '@/lib/knowledge-proxy';

type UploadCustomRequestOpt = Parameters<NonNullable<UploadProps['customRequest']>>[0];

const { Text } = Typography;
const LAYERS_BROWSER_TABLE_SCROLL_Y = 600;
const DEFAULT_LAYER: KnowledgeLayer = 'wiki';

function layerFromParam(value: string | null): KnowledgeLayer {
  if (value && TEXT_LAYERS.includes(value as KnowledgeLayer)) return value as KnowledgeLayer;
  return DEFAULT_LAYER;
}

export default function KnowledgeLayersPage() {
  const { message } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();
  const [searchParams, setSearchParams] = useSearchParams();

  const [layer, setLayer] = useState<KnowledgeLayer>(() => layerFromParam(searchParams.get('layer')));
  const [prefix, setPrefix] = useState('');
  const [entries, setEntries] = useState<LayerEntry[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [proxyError, setProxyError] = useState<unknown>();

  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [fileMeta, setFileMeta] = useState<FileContentResponse | null>(null);
  const [saving, setSaving] = useState(false);

  const [folderTree, setFolderTree] = useState<Awaited<ReturnType<typeof getDataTree>> | null>(null);
  const [folderTreeLoading, setFolderTreeLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [embeddingPath, setEmbeddingPath] = useState<string | null>(null);

  const [schemaModalOpen, setSchemaModalOpen] = useState(false);
  const [schemaRelPath, setSchemaRelPath] = useState('AGENTS.md');
  const [schemaDraft, setSchemaDraft] = useState(SCHEMA_CREATE_TEMPLATE);
  const [polishHint, setPolishHint] = useState('');
  const [polishing, setPolishing] = useState(false);
  const [savingSchema, setSavingSchema] = useState(false);

  const [wikiLocateQuery, setWikiLocateQuery] = useState('');
  const [wikiLocateOnlyCurrentDir, setWikiLocateOnlyCurrentDir] = useState(true);
  const [wikiLocateLoading, setWikiLocateLoading] = useState(false);
  const [wikiLocateHits, setWikiLocateHits] = useState<DialogueRecallHit[] | null>(null);
  const [wikiLocateMergedMedia, setWikiLocateMergedMedia] = useState<
    { code: string; mime: string }[]
  >([]);

  const pendingRecallHeadingRef = useRef<string | null>(null);
  const [recallHeadingBanner, setRecallHeadingBanner] = useState<string | null>(null);

  const browseDirKey = useMemo(() => prefixToBrowseDirKey(prefix), [prefix]);
  const uploadTreeSelectData = useMemo(
    () => (folderTree ? [mapDataFolderToTreeSelect(folderTree)] : []),
    [folderTree],
  );
  const displayedEntries = useMemo(
    () => (layer === 'schema' ? entries : entries.filter((e) => !e.is_dir)),
    [entries, layer],
  );

  const activeTenantName = useMemo(
    () => tenants.find((t) => t.id === activeTenantId)?.name,
    [tenants, activeTenantId],
  );

  const loadList = useCallback(async () => {
    if (!activeTenantId) {
      setEntries([]);
      return;
    }
    setListLoading(true);
    setProxyError(undefined);
    try {
      const res = await listLayerEntries(activeTenantId, layer, prefix);
      setEntries(res.entries ?? []);
    } catch (err) {
      if (isKnowledgeProxyError(err)) setProxyError(err);
      else message.error(knowledgeProxyErrorMessage(err));
      setEntries([]);
    } finally {
      setListLoading(false);
    }
  }, [activeTenantId, layer, message, prefix]);

  const loadFolderTree = useCallback(async () => {
    if (!activeTenantId || layer === 'schema') {
      setFolderTree(null);
      return;
    }
    setFolderTreeLoading(true);
    try {
      setFolderTree(await getDataTree(activeTenantId, layer, DATA_TREE_DEFAULT_OPTS));
    } catch (err) {
      if (!isKnowledgeProxyError(err)) {
        message.error(knowledgeProxyErrorMessage(err));
      }
      setFolderTree(null);
    } finally {
      setFolderTreeLoading(false);
    }
  }, [activeTenantId, layer, message]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadFolderTree();
  }, [loadFolderTree]);

  useEffect(() => {
    setSelectedRowKeys([]);
  }, [layer, prefix]);

  useEffect(() => {
    if (layer !== 'wiki') {
      setWikiLocateHits(null);
      setWikiLocateMergedMedia([]);
      setWikiLocateQuery('');
    }
  }, [layer]);

  useEffect(() => {
    setLayer(layerFromParam(searchParams.get('layer')));
  }, [searchParams]);

  const changeLayer = (next: KnowledgeLayer) => {
    if (next !== 'schema') setSchemaModalOpen(false);
    setLayer(next);
    setPrefix('');
    closeFileEditor();
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === DEFAULT_LAYER) p.delete('layer');
      else p.set('layer', next);
      return p;
    }, { replace: true });
  };

  const closeFileEditor = useCallback(() => {
    pendingRecallHeadingRef.current = null;
    setRecallHeadingBanner(null);
    setFilePath(null);
    setContent('');
    setFileMeta(null);
  }, []);

  const openFile = useCallback(
    async (path: string, opts?: { recallHeadingPath?: string | null }) => {
      if (!activeTenantId) return;
      pendingRecallHeadingRef.current = (opts?.recallHeadingPath ?? '').trim() || null;
      setRecallHeadingBanner(null);
      try {
        const data = await readLayerFile(activeTenantId, layer, path);
        setFilePath(path);
        setContent(data.content);
        setFileMeta(data);
      } catch (err) {
        pendingRecallHeadingRef.current = null;
        message.error(knowledgeProxyErrorMessage(err));
      }
    },
    [activeTenantId, layer, message],
  );

  useLayoutEffect(() => {
    const hp = pendingRecallHeadingRef.current;
    if (!filePath || !content || !hp) return;

    let cancelled = false;
    let attempts = 0;
    const tryApply = () => {
      if (cancelled) return;
      const ta = document.getElementById('layers-wiki-editor-ta') as HTMLTextAreaElement | null;
      if (!ta) {
        attempts += 1;
        if (attempts < 24) {
          requestAnimationFrame(tryApply);
        } else {
          pendingRecallHeadingRef.current = null;
          setRecallHeadingBanner(`无法在编辑器中找到文本框，请手动搜索标题：${hp}`);
        }
        return;
      }
      const lineIdx = findHeadingLineIndex(content, hp);
      pendingRecallHeadingRef.current = null;
      if (lineIdx < 0) {
        setRecallHeadingBanner(
          `未在正文找到与「${hp}」匹配的 ATX 标题行（# …），请手动定位后粘贴媒体标签。`,
        );
        return;
      }
      const { start, end } = lineCharRange(content, lineIdx);
      const lineText = content.replace(/\r\n/g, '\n').split('\n')[lineIdx] ?? '';
      const plain = lineText.replace(/^#{1,6}\s+/, '').trim().slice(0, 100);
      setRecallHeadingBanner(
        `已选中召回片段所在标题行（便于在附近插入 \`![[MEDIA:…]]\`）：${plain || lineText}`,
      );
      requestAnimationFrame(() => {
        if (cancelled) return;
        ta.focus();
        ta.setSelectionRange(start, end);
        const lh = parseFloat(getComputedStyle(ta).lineHeight) || 22;
        ta.scrollTop = Math.max(0, lineIdx * lh - ta.clientHeight / 2 + lh);
      });
    };
    requestAnimationFrame(tryApply);
    return () => {
      cancelled = true;
    };
  }, [content, filePath]);

  const saveFile = useCallback(async () => {
    if (!activeTenantId || !filePath) return;
    setSaving(true);
    try {
      const data = await writeLayerFile(activeTenantId, layer, filePath, content);
      setFileMeta(data);
      message.success('已保存');
      void loadList();
    } catch (err) {
      message.error(knowledgeProxyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [activeTenantId, content, filePath, layer, loadList, message]);

  const jumpToWikiHit = useCallback(
    (hit: DialogueRecallHit) => {
      const rel = hit.path;
      const slash = rel.lastIndexOf('/');
      const dirPrefix = slash >= 0 ? rel.slice(0, slash + 1) : '';
      setPrefix(dirPrefix);
      void openFile(rel, { recallHeadingPath: hit.heading_path ?? '' });
    },
    [openFile],
  );

  const runWikiLocate = useCallback(async () => {
    if (!activeTenantId) return;
    const q = wikiLocateQuery.trim();
    if (!q) {
      message.warning('请输入检索词');
      return;
    }
    setWikiLocateLoading(true);
    try {
      const wiki_prefixes =
        wikiLocateOnlyCurrentDir && browseDirKey ? [browseDirKey] : undefined;
      const data = await dialogueRecall(activeTenantId, {
        query: q,
        wiki_prefixes,
        max_files: 120,
        bm25_top_n: 20,
        vector_top_n: 20,
        top_k_chunks: 16,
        chunk_max_chars: 1200,
        context_budget_chars: 32000,
      });
      setWikiLocateHits(data.recall_hits);
      setWikiLocateMergedMedia(data.merged_media ?? []);
      message.success(`命中 ${data.recall_hits.length} 条片段`);
    } catch (err) {
      message.error(knowledgeProxyErrorMessage(err));
      setWikiLocateHits(null);
      setWikiLocateMergedMedia([]);
    } finally {
      setWikiLocateLoading(false);
    }
  }, [activeTenantId, browseDirKey, message, wikiLocateOnlyCurrentDir, wikiLocateQuery]);

  const enterDir = useCallback(
    (e: LayerEntry) => {
      if (!e.is_dir) {
        void openFile(e.path.replace(/\/$/, ''));
        return;
      }
      setPrefix(e.path);
      closeFileEditor();
    },
    [closeFileEditor, openFile],
  );

  const deleteEntry = useCallback(
    async (row: LayerEntry) => {
      if (!activeTenantId) return;
      const p = entryApiPath(row);
      try {
        await deleteLayerFile(activeTenantId, layer, p);
        message.success('已删除');
        if (filePath === p) closeFileEditor();
        void loadList();
      } catch (err) {
        message.error(knowledgeProxyErrorMessage(err));
      }
    },
    [activeTenantId, closeFileEditor, filePath, layer, loadList, message],
  );

  const deleteSelectedEntries = useCallback(async () => {
    if (!activeTenantId || selectedRowKeys.length === 0) return;
    setBatchDeleting(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const key of selectedRowKeys) {
        const p = String(key).replace(/\/$/, '');
        try {
          await deleteLayerFile(activeTenantId, layer, p);
          ok++;
          if (filePath === p) closeFileEditor();
        } catch {
          failed++;
        }
      }
      if (ok && !failed) message.success(`已删除 ${ok} 项`);
      else if (ok && failed) message.warning(`已删除 ${ok} 项，${failed} 项失败`);
      else message.error('删除失败');
      setSelectedRowKeys([]);
      void loadList();
    } finally {
      setBatchDeleting(false);
    }
  }, [activeTenantId, closeFileEditor, filePath, layer, loadList, message, selectedRowKeys]);

  const columns: ColumnsType<LayerEntry> = useMemo(
    () => [
      {
        title: '名称',
        dataIndex: 'name',
        width: 110,
        align: 'center',
        render: (v: string, row) => {
          const label = `${v}${row.is_dir ? '/' : ''}`;
          return (
            <Text ellipsis={{ tooltip: label }} style={{ maxWidth: 140, display: 'inline-block' }}>
              {label}
            </Text>
          );
        },
      },
      {
        title: '类型',
        width: 80,
        align: 'center',
        render: (_, row) => (row.is_dir ? '目录' : '文件'),
      },
      {
        title: '大小',
        width: 100,
        align: 'center',
        dataIndex: 'size',
        render: (s: number | undefined) => (s == null ? '—' : s),
      },
      {
        title: '嵌入状态',
        width: 80,
        align: 'center',
        render: (_, row) => {
          if (layer !== 'wiki' || row.is_dir) return '—';
          const tagStyle = { marginInlineEnd: 0, fontSize: 12, lineHeight: '18px', padding: '0 4px' };
          if (row.embedding_status === 'embedded') {
            return <Tag color="success" style={tagStyle}>已嵌入</Tag>;
          }
          if (row.embedding_status === 'stale') {
            return <Tag color="warning" style={tagStyle}>需重嵌入</Tag>;
          }
          return <Tag style={tagStyle}>未嵌入</Tag>;
        },
      },
      {
        title: '操作',
        width: 120,
        align: 'center',
        render: (_, row) => (
          <Space
            size={4}
            style={{
              justifyContent: 'center',
              width: '100%',
              flexWrap: 'nowrap',
              whiteSpace: 'nowrap',
            }}
          >
            {row.is_dir ? (
              <Button type="link" size="small" style={{ padding: 0 }} onClick={() => enterDir(row)}>
                进入
              </Button>
            ) : (
              <Button
                type="link"
                size="small"
                style={{ padding: 0 }}
                onClick={() => void openFile(row.path.replace(/\/$/, ''))}
              >
                详情
              </Button>
            )}
            {layer === 'wiki' && !row.is_dir ? (
              <Button
                type="link"
                size="small"
                loading={embeddingPath === row.path}
                disabled={row.embedding_status === 'embedded'}
                onClick={async () => {
                  if (!activeTenantId) return;
                  try {
                    setEmbeddingPath(row.path);
                    const p = row.path.replace(/\/$/, '');
                    const data = (await triggerLayerEmbed(
                      activeTenantId,
                      layer,
                      p,
                    )) as WikiEmbedResponse;
                    const n =
                      data.chunk_count ??
                      (data as { embed?: WikiEmbedResponse }).embed?.chunk_count;
                    message.success(n != null ? `已嵌入 ${n} 个 chunk` : '已嵌入');
                    void loadList();
                  } catch (err) {
                    message.error(knowledgeProxyErrorMessage(err));
                  } finally {
                    setEmbeddingPath(null);
                  }
                }}
                style={{ padding: 0 }}
              >
                嵌入
              </Button>
            ) : null}
            <Popconfirm
              title={row.is_dir ? '删除该目录？' : '删除该文件？'}
              description={<span style={{ wordBreak: 'break-all' }}>{entryApiPath(row)}</span>}
              onConfirm={() => void deleteEntry(row)}
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button type="link" danger size="small" style={{ padding: 0 }}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [activeTenantId, deleteEntry, embeddingPath, enterDir, layer, loadList, message, openFile],
  );

  const wikiLocateColumns: ColumnsType<DialogueRecallHit> = useMemo(
    () => [
      {
        title: '文件路径',
        dataIndex: 'path',
        key: 'path',
        ellipsis: true,
        width: 180,
        align: 'center',
      },
      {
        title: '标题路径',
        dataIndex: 'heading_path',
        key: 'heading_path',
        width: 160,
        ellipsis: true,
        align: 'center',
        render: (v: string | undefined) =>
          v && v.trim() ? <Text code>{v}</Text> : <Text type="secondary">（无）</Text>,
      },
      { title: '得分', dataIndex: 'score', key: 'score', width: 72, align: 'center' },
      { title: '片段预览', dataIndex: 'snippet', key: 'snippet', ellipsis: true, align: 'center' },
      {
        title: '操作',
        key: 'open',
        width: 100,
        align: 'center',
        render: (_, row) => (
          <Button type="link" size="small" onClick={() => jumpToWikiHit(row)}>
            打开编辑
          </Button>
        ),
      },
    ],
    [jumpToWikiHit],
  );

  const openSchemaCreate = useCallback(() => {
    setSchemaRelPath(defaultSchemaRelativePath(prefix));
    setSchemaDraft(SCHEMA_CREATE_TEMPLATE);
    setPolishHint('');
    setSchemaModalOpen(true);
  }, [prefix]);

  const polishSchemaDraft = useCallback(async () => {
    if (!activeTenantId) return;
    if (!schemaDraft.trim()) {
      message.warning('请先填写正文');
      return;
    }
    setPolishing(true);
    try {
      const data = await polishText(activeTenantId, {
        content: schemaDraft,
        instruction: polishHint.trim() || undefined,
      });
      setSchemaDraft(data.content);
      message.success(`已润色（${data.model}），请确认后保存`);
    } catch (err) {
      message.error(knowledgeProxyErrorMessage(err));
    } finally {
      setPolishing(false);
    }
  }, [activeTenantId, message, polishHint, schemaDraft]);

  const saveSchemaCreate = useCallback(async () => {
    if (!activeTenantId) return;
    const rel = schemaRelPath.trim() || 'AGENTS.md';
    setSavingSchema(true);
    try {
      await writeLayerFile(activeTenantId, 'schema', rel, schemaDraft);
      message.success(`已保存：schema/${rel}`);
      setSchemaModalOpen(false);
      void loadList();
    } catch (err) {
      message.error(knowledgeProxyErrorMessage(err));
    } finally {
      setSavingSchema(false);
    }
  }, [activeTenantId, loadList, message, schemaDraft, schemaRelPath]);

  const handleUpload = useCallback(
    async (opt: UploadCustomRequestOpt) => {
      if (!activeTenantId) return;
      const raw = opt.file as File;
      const rel = joinUploadDirAndFileName(browseDirKey, raw.name);
      setUploading(true);
      try {
        const text = await raw.text();
        const parts =
          layer === 'wiki'
            ? [text]
            : [...text].length <= UPLOAD_CHUNK_CHARS
              ? [text]
              : splitTextByMaxChars(text, UPLOAD_CHUNK_CHARS);
        const paths = expandUploadPaths(rel, parts.length);
        let lastData: FileContentResponse | null = null;
        const uploadedPaths: string[] = [];
        for (let i = 0; i < parts.length; i++) {
          const partName = paths[i].split('/').pop() || 'part.txt';
          const file = new File([parts[i]], partName, { type: 'text/plain;charset=utf-8' });
          const data = await uploadLayerFile(activeTenantId, layer, file, paths[i]);
          lastData = data;
          uploadedPaths.push(data.path);
        }
        opt.onSuccess?.(lastData!, new XMLHttpRequest());
        message.success(
          parts.length > 1
            ? `已上传 ${parts.length} 个文件（raw 层每 ${UPLOAD_CHUNK_CHARS} 字一段）：${uploadedPaths.join('、')}`
            : `已上传：${uploadedPaths[0]}`,
        );
        void loadList();
        void loadFolderTree();
      } catch (err) {
        opt.onError?.(err as Error);
        message.error(knowledgeProxyErrorMessage(err));
      } finally {
        setUploading(false);
      }
    },
    [activeTenantId, browseDirKey, layer, loadFolderTree, loadList, message],
  );

  const crumbs = useMemo(() => {
    const parts = prefix.split('/').filter(Boolean);
    const items: { title: string; onClick?: () => void }[] = [
      {
        title: '根',
        onClick: () => {
          setPrefix('');
          closeFileEditor();
        },
      },
    ];
    let acc = '';
    for (const p of parts) {
      acc = acc ? `${acc}/${p}` : p;
      const at = `${acc}/`;
      items.push({
        title: p,
        onClick: () => {
          setPrefix(at);
          closeFileEditor();
        },
      });
    }
    return items;
  }, [closeFileEditor, prefix]);

  if (!activeTenantId) {
    return (
      <>
        <Typography.Title level={3} className="!mb-4">
          知识层管理
        </Typography.Title>
        <Alert
          type="warning"
          showIcon
          message="请先在顶栏选择「当前操作租户」"
          description="知识层按租户隔离，需选定租户后浏览与维护 raw / wiki / schema 三层内容。"
        />
      </>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={3} className="!mb-0">
        知识层管理
      </Typography.Title>
      <Alert
        type="info"
        showIcon
        message={`当前租户：${activeTenantName ?? activeTenantId}`}
      />
      {proxyError != null ? <KnowledgeProxyErrorAlert error={proxyError} /> : null}
      <Alert
        type="info"
        showIcon
        message="使用流程"
        description={
          <ol style={{ margin: 0, paddingLeft: 20, marginBottom: 0 }}>
            <li>
              <strong>raw / wiki 层</strong>：卡片标题栏左侧选层与目录，右侧为查询 / 上传。点查询拉取列表。列表仅显示文件，子目录请用树或面包屑进入。
              <strong>raw 层</strong>上传时正文超过 <strong>2500 字</strong>会自动拆成多个文件；<strong>wiki 层</strong>上传不切片。
              在操作列点详情于弹窗中编辑、保存。<strong>wiki 层</strong>可使用下方「按片段定位到文件」插入 <code>![[MEDIA:…]]</code>。
            </li>
            <li>
              <strong>schema 规范层</strong>：标题栏右侧查询 / 创建；可先 AI 润色再保存到 <code>schema/</code>。
            </li>
          </ol>
        }
      />
      <Row gutter={16} align="stretch">
        <Col xs={24} lg={24} style={{ display: 'flex', minWidth: 0 }}>
          <Card
            title={
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'nowrap',
                  minWidth: 0,
                }}
              >
                <Select<KnowledgeLayer>
                  value={layer}
                  size="middle"
                  style={{ width: 130, flexShrink: 0 }}
                  onChange={(v) => changeLayer(v)}
                  options={[
                    { value: 'raw', label: 'raw 原始层' },
                    { value: 'wiki', label: 'wiki 编译层' },
                    { value: 'schema', label: 'schema 规范层' },
                  ]}
                />
                {layer !== 'schema' ? (
                  <WikiBrowseTreeSelect
                    size="middle"
                    style={{ width: 220, minWidth: 140, flexShrink: 1, maxWidth: '100%' }}
                    loading={folderTreeLoading}
                    disabled={uploading}
                    value={browseDirKey}
                    onChange={(v) => {
                      const key = typeof v === 'string' ? v : '';
                      setPrefix(browseDirKeyToPrefix(key));
                      closeFileEditor();
                    }}
                    treeData={uploadTreeSelectData}
                  />
                ) : null}
              </div>
            }
            style={{ flex: 1, width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}
            styles={{
              header: { paddingBlock: 14, paddingInline: 16, minHeight: 56, alignItems: 'center' },
              body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' },
            }}
            extra={
              layer === 'schema' ? (
                <Space size={10}>
                  <Button
                    type="primary"
                    size="middle"
                    onClick={() => {
                      void loadList();
                      void loadFolderTree();
                    }}
                  >
                    查询
                  </Button>
                  <Button type="primary" icon={<FileAddOutlined />} size="middle" onClick={openSchemaCreate}>
                    创建
                  </Button>
                </Space>
              ) : (
                <Space size={10}>
                  <Button
                    type="primary"
                    size="middle"
                    onClick={() => {
                      void loadList();
                      void loadFolderTree();
                    }}
                  >
                    查询
                  </Button>
                  <Upload
                    maxCount={1}
                    showUploadList={false}
                    customRequest={(opt) => void handleUpload(opt)}
                    disabled={uploading}
                  >
                    <Button type="primary" icon={<UploadOutlined />} loading={uploading} size="middle">
                      上传
                    </Button>
                  </Upload>
                </Space>
              )
            }
          >
            <Breadcrumb
              items={crumbs.map((c) => ({
                title: (
                  <a
                    onClick={(e) => {
                      e.preventDefault();
                      c.onClick?.();
                    }}
                  >
                    {c.title}
                  </a>
                ),
              }))}
              style={{ marginBottom: 12, flexShrink: 0 }}
            />
            {layer === 'wiki' && (
              <Card
                type="inner"
                size="small"
                title="按片段定位到文件（BM25 + 向量）"
                style={{ marginBottom: 12, flexShrink: 0 }}
              >
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    用语义或关键词检索 wiki 切片，命中后点「打开编辑」便于插入 <Text code>![[MEDIA:…]]</Text>
                  </Text>
                  <Space.Compact style={{ width: '100%', maxWidth: 640 }}>
                    <Input
                      placeholder="例如：白点病药浴、疾病大全 第二章…"
                      value={wikiLocateQuery}
                      onChange={(e) => setWikiLocateQuery(e.target.value)}
                      onPressEnter={() => void runWikiLocate()}
                      allowClear
                    />
                    <Button type="primary" loading={wikiLocateLoading} onClick={() => void runWikiLocate()}>
                      搜索定位
                    </Button>
                  </Space.Compact>
                  <Checkbox
                    checked={wikiLocateOnlyCurrentDir}
                    onChange={(e) => setWikiLocateOnlyCurrentDir(e.target.checked)}
                  >
                    仅扫描当前面包屑目录
                    {browseDirKey ? (
                      <Text type="secondary">
                        （<Text code>{browseDirKey}/</Text>）
                      </Text>
                    ) : (
                      <Text type="secondary">（当前在 wiki 根，即整库）</Text>
                    )}
                  </Checkbox>
                  {wikiLocateHits != null && wikiLocateMergedMedia.length > 0 && activeTenantId ? (
                    <div style={{ marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
                        本次命中中的媒体（合并去重）：
                      </Text>
                      <Space size={[4, 4]} wrap>
                        {wikiLocateMergedMedia.map((x) => (
                          <Tag
                            key={x.code}
                            style={{ cursor: 'pointer' }}
                            onClick={() => void openMediaInNewTab(activeTenantId, x.code)}
                          >
                            {x.code.slice(0, 8)}…
                          </Tag>
                        ))}
                      </Space>
                    </div>
                  ) : null}
                  {wikiLocateHits != null && (
                    <Table<DialogueRecallHit>
                      size="small"
                      rowKey={(row, i) => `${i}-${row.path}-${row.score}`}
                      columns={wikiLocateColumns}
                      dataSource={wikiLocateHits}
                      pagination={false}
                      locale={{ emptyText: '无命中，可换关键词或取消「仅当前目录」' }}
                      scroll={{ y: 220, x: 900 }}
                    />
                  )}
                </Space>
              </Card>
            )}
            {selectedRowKeys.length > 0 && (
              <Space wrap style={{ marginBottom: 12, flexShrink: 0 }}>
                <Popconfirm
                  title={`删除选中的 ${selectedRowKeys.length} 项？`}
                  description="删除后不可恢复（目录将递归删除）"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => void deleteSelectedEntries()}
                >
                  <Button danger loading={batchDeleting}>
                    删除选中（{selectedRowKeys.length}）
                  </Button>
                </Popconfirm>
                <Button disabled={batchDeleting} onClick={() => setSelectedRowKeys([])}>
                  取消选择
                </Button>
              </Space>
            )}
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <Table<LayerEntry>
                size="small"
                rowKey={(r) => r.path}
                loading={listLoading}
                columns={columns}
                dataSource={displayedEntries}
                pagination={false}
                scroll={{ x: 700, y: LAYERS_BROWSER_TABLE_SCROLL_Y }}
                rowSelection={{
                  selectedRowKeys,
                  onChange: setSelectedRowKeys,
                  preserveSelectedRowKeys: false,
                }}
              />
            </div>
          </Card>
        </Col>
      </Row>

      <Modal
        title={filePath ? `编辑：${filePath}` : '编辑'}
        open={filePath != null}
        onCancel={closeFileEditor}
        width={920}
        centered
        maskClosable={false}
        footer={
          <Space>
            <Button onClick={closeFileEditor}>关闭</Button>
            <Button type="primary" disabled={!filePath} loading={saving} onClick={() => void saveFile()}>
              保存
            </Button>
          </Space>
        }
      >
        {fileMeta ? (
          <Text type="secondary" style={{ display: 'block', marginBottom: 10 }}>
            UTF-8 · {fileMeta.size} 字节
          </Text>
        ) : null}
        {recallHeadingBanner ? (
          <Alert
            type="info"
            showIcon
            closable
            onClose={() => setRecallHeadingBanner(null)}
            message="召回定位"
            description={recallHeadingBanner}
            style={{ marginBottom: 10 }}
          />
        ) : null}
        <Input.TextArea
          id="layers-wiki-editor-ta"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="在列表操作列点击「详情」打开此弹窗进行编辑"
          style={{
            minHeight: 420,
            width: '100%',
            resize: 'vertical',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          }}
        />
      </Modal>

      <Modal
        title="创建规范文件（schema）"
        open={schemaModalOpen}
        onCancel={() => setSchemaModalOpen(false)}
        width={760}
        footer={
          <Space wrap>
            <Button onClick={() => setSchemaModalOpen(false)}>取消</Button>
            <Button loading={polishing} onClick={() => void polishSchemaDraft()}>
              AI 润色
            </Button>
            <Button type="primary" loading={savingSchema} onClick={() => void saveSchemaCreate()}>
              保存到 schema
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
              保存路径（相对 schema 层）
            </Text>
            <Input
              value={schemaRelPath}
              onChange={(e) => setSchemaRelPath(e.target.value)}
              placeholder="例如 AGENTS.md 或 notes/rule.md"
            />
          </div>
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
              润色说明（可选）
            </Text>
            <Input.TextArea
              rows={2}
              value={polishHint}
              onChange={(e) => setPolishHint(e.target.value)}
              placeholder="例如：语气正式一些…"
            />
          </div>
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
              正文
            </Text>
            <Input.TextArea
              rows={18}
              value={schemaDraft}
              onChange={(e) => setSchemaDraft(e.target.value)}
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              }}
            />
          </div>
        </Space>
      </Modal>
    </Space>
  );
}
