'use client';

import {
  DeleteOutlined,
  EditOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Breadcrumb,
  Button,
  Input,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  EllipsisCell,
  ellipsisTextColumn,
  renderEllipsisLink,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import { KnowledgeProxyErrorAlert } from '@/components/console/KnowledgeProxyErrorAlert';
import {
  KnowledgeLayer,
  LAYER_LABELS,
  LayerEntry,
  TEXT_LAYERS,
  deleteLayerFile,
  isKnowledgeProxyError,
  listLayerEntries,
  readLayerFile,
  uploadLayerFile,
  writeLayerFile,
} from '@/lib/knowledge-proxy';

const EMBEDDING_META: Record<string, { label: string; color: string }> = {
  embedded: { label: '已嵌入', color: 'green' },
  stale: { label: '待更新', color: 'orange' },
  not_embedded: { label: '未嵌入', color: 'default' },
};

function formatSize(n?: number) {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const DEFAULT_LAYER: KnowledgeLayer = 'wiki';

function layerFromParam(value: string | null): KnowledgeLayer {
  if (value && TEXT_LAYERS.includes(value as KnowledgeLayer)) return value as KnowledgeLayer;
  return DEFAULT_LAYER;
}

export default function KnowledgeLayersPage() {
  const { message, modal } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();
  const [searchParams, setSearchParams] = useSearchParams();
  const [layer, setLayer] = useState<KnowledgeLayer>(() => layerFromParam(searchParams.get('layer')));
  const [prefix, setPrefix] = useState('');
  const [entries, setEntries] = useState<LayerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [proxyError, setProxyError] = useState<unknown>();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPath, setEditorPath] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [isNewFile, setIsNewFile] = useState(false);

  const activeTenantName = useMemo(
    () => tenants.find((t) => t.id === activeTenantId)?.name,
    [tenants, activeTenantId],
  );

  const load = useCallback(async () => {
    if (!activeTenantId) { setEntries([]); return; }
    setLoading(true);
    setProxyError(undefined);
    try {
      const res = await listLayerEntries(activeTenantId, layer, prefix);
      setEntries(res.entries ?? []);
    } catch (err) {
      if (isKnowledgeProxyError(err)) setProxyError(err);
      else message.error(err instanceof Error ? err.message : '加载目录失败');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, layer, prefix, message]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setLayer(layerFromParam(searchParams.get('layer')));
  }, [searchParams]);

  const changeLayer = (next: KnowledgeLayer) => {
    setLayer(next);
    setPrefix('');
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === DEFAULT_LAYER) p.delete('layer');
      else p.set('layer', next);
      return p;
    }, { replace: true });
  };

  const breadcrumbs = useMemo(() => {
    const parts = prefix ? prefix.replace(/\/$/, '').split('/') : [];
    const items = [{ title: LAYER_LABELS[layer as keyof typeof LAYER_LABELS] ?? layer }];
    let acc = '';
    for (const p of parts) {
      acc += `${p}/`;
      items.push({ title: p });
    }
    return items;
  }, [layer, prefix]);

  const navigateTo = (newPrefix: string) => setPrefix(newPrefix);

  const openFile = async (path: string) => {
    if (!activeTenantId) return;
    setEditorPath(path);
    setIsNewFile(false);
    setEditorOpen(true);
    setEditorLoading(true);
    try {
      const res = await readLayerFile(activeTenantId, layer, path);
      setEditorContent(res.content);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '读取文件失败');
      setEditorOpen(false);
    } finally {
      setEditorLoading(false);
    }
  };

  const openNewFile = () => {
    const base = prefix || '';
    setEditorPath(base);
    setEditorContent('');
    setIsNewFile(true);
    setEditorOpen(true);
  };

  const saveFile = async () => {
    if (!activeTenantId) return;
    let path = editorPath.trim();
    if (!path) { message.warning('请输入文件路径'); return; }
    if (isNewFile && !path.includes('.')) {
      path = `${path.replace(/\/$/, '')}.md`;
    }
    setEditorSaving(true);
    try {
      await writeLayerFile(activeTenantId, layer, path, editorContent);
      message.success('保存成功');
      setEditorOpen(false);
      if (isNewFile) setPrefix(path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '');
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setEditorSaving(false);
    }
  };

  const handleDelete = (entry: LayerEntry) => {
    if (!activeTenantId) return;
    modal.confirm({
      title: `确认删除「${entry.path}」？`,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteLayerFile(activeTenantId, layer, entry.path);
          message.success('已删除');
          void load();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  const handleUpload = async (file: File) => {
    if (!activeTenantId) return false;
    try {
      const targetPath = prefix ? `${prefix}${file.name}` : file.name;
      await uploadLayerFile(activeTenantId, layer, file, targetPath);
      message.success(`已上传 ${file.name}`);
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '上传失败');
    }
    return false;
  };

  const columns: ColumnsType<LayerEntry> = [
    withNowrap<LayerEntry>({
      title: '名称',
      dataIndex: 'name',
      width: 200,
      render: (name: string, row) =>
        row.is_dir ? (
          <EllipsisCell tooltip={name}>
            <a onClick={() => navigateTo(row.path.endsWith('/') ? row.path : `${row.path}/`)}>
              <FolderOpenOutlined className="mr-1" />
              {name}
            </a>
          </EllipsisCell>
        ) : (
          renderEllipsisLink(name, () => openFile(row.path))
        ),
    }),
    ellipsisTextColumn<LayerEntry>('路径', 'path', 240),
    withNowrap<LayerEntry>({
      title: '大小',
      dataIndex: 'size',
      width: 100,
      render: (v: number | undefined, row) => (row.is_dir ? '—' : formatSize(v)),
    }),
    withNowrap<LayerEntry>({
      title: '嵌入状态',
      dataIndex: 'embedding_status',
      width: 100,
      render: (s: string | undefined) => {
        if (!s) return '—';
        const m = EMBEDDING_META[s];
        return m ? <Tag color={m.color}>{m.label}</Tag> : s;
      },
    }),
    withNowrap<LayerEntry>({
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_, row) => (
        <Space size="small">
          {!row.is_dir && (
            <>
              <a onClick={() => openFile(row.path)}>
                <EditOutlined /> 编辑
              </a>
              <a className="text-red-500" onClick={() => handleDelete(row)}>
                <DeleteOutlined />
              </a>
            </>
          )}
          {row.is_dir && (
            <a onClick={() => navigateTo(row.path.endsWith('/') ? row.path : `${row.path}/`)}>进入</a>
          )}
        </Space>
      ),
    }),
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Typography.Title level={3} className="!mb-0">知识层管理</Typography.Title>
        <Space>
          <Button icon={<PlusOutlined />} onClick={openNewFile} disabled={!activeTenantId}>新建文件</Button>
          <Upload beforeUpload={handleUpload} showUploadList={false} disabled={!activeTenantId}>
            <Button icon={<UploadOutlined />} disabled={!activeTenantId}>上传文件</Button>
          </Upload>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} disabled={!activeTenantId}>刷新</Button>
        </Space>
      </div>

      {!activeTenantId ? (
        <Alert type="warning" showIcon message="请先在顶栏选择「当前操作租户」"
          description="知识层按租户隔离，需选定租户后浏览与维护 raw / wiki / schema 三层内容。" />
      ) : (
        <>
          <Alert className="mb-4" type="info" showIcon
            message={`当前租户：${activeTenantName ?? activeTenantId}`}
            description="浏览与管理 raw（原始素材）、wiki（编译条目）、schema（规范结构）三层文本内容。媒体资源请使用「媒体库」页面。"
          />
          {proxyError && <KnowledgeProxyErrorAlert error={proxyError} className="mb-4" />}

          <Tabs
            activeKey={layer}
            defaultActiveKey={DEFAULT_LAYER}
            onChange={(k) => changeLayer(layerFromParam(k))}
            items={TEXT_LAYERS.map((l) => ({ key: l, label: LAYER_LABELS[l] }))}
            className="mb-4"
          />

          <Breadcrumb className="mb-3" items={[
            ...breadcrumbs.map((b, i) => ({
              title: i === 0 ? (
                <a onClick={() => setPrefix('')}>{b.title}</a>
              ) : (
                <a onClick={() => {
                  const parts = prefix.replace(/\/$/, '').split('/');
                  navigateTo(`${parts.slice(0, i).join('/')}/`);
                }}>{b.title}</a>
              ),
            })),
          ]} />

          <Table<LayerEntry>
            rowKey="path"
            loading={loading}
            columns={columns}
            dataSource={entries}
            pagination={false}
            size="middle"
            {...tableEllipsisLayout}
          />
        </>
      )}

      <Modal
        title={isNewFile ? '新建文件' : `编辑 — ${editorPath}`}
        open={editorOpen}
        onCancel={() => setEditorOpen(false)}
        width={800}
        footer={[
          <Button key="cancel" onClick={() => setEditorOpen(false)}>取消</Button>,
          <Button key="save" type="primary" loading={editorSaving} onClick={saveFile}>保存</Button>,
        ]}
      >
        {isNewFile && (
          <div className="mb-3">
            <Typography.Text type="secondary" className="block mb-1">文件路径（层内相对路径）</Typography.Text>
            <Input value={editorPath} onChange={(e) => setEditorPath(e.target.value)}
              placeholder={prefix ? `${prefix}example.md` : 'notes/example.md'} />
          </div>
        )}
        {editorLoading ? (
          <Typography.Text type="secondary">加载中…</Typography.Text>
        ) : (
          <Input.TextArea rows={18} value={editorContent} onChange={(e) => setEditorContent(e.target.value)}
            placeholder="Markdown / 文本内容…" />
        )}
      </Modal>
    </>
  );
}
