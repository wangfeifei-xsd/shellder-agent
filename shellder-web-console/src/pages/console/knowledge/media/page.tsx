'use client';

import {
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  ImportOutlined,
  LinkOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  App,
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Space,
  Table,
  TreeSelect,
  Typography,
  Upload,
} from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import type { UploadProps } from 'antd/es/upload/interface';
import type { Key } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthenticatedMediaThumb } from '@/components/console/AuthenticatedMediaThumb';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import { KnowledgeProxyErrorAlert } from '@/components/console/KnowledgeProxyErrorAlert';
import {
  MEDIA_ROOT_FOLDER_VALUE,
  mapMediaFolderToTreeSelect,
  mediaFolderValueToTargetFolder,
} from '@/components/console/knowledgeFolderTree';
import {
  MediaItem,
  batchDeleteMedia,
  deleteMedia,
  exportMediaZip,
  getDataTree,
  DATA_TREE_DEFAULT_OPTS,
  getMediaBackrefs,
  fetchMediaObjectUrl,
  importMediaZip,
  openMediaInNewTab,
  isKnowledgeProxyError,
  knowledgeProxyErrorMessage,
  listMediaItems,
  reindexMediaBackrefs,
  uploadMedia,
} from '@/lib/knowledge-proxy';
import { ApiError } from '@/lib/api';

const { Paragraph, Text } = Typography;

const FOLDER_FILTER_ALL = '__all__';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function parseDispositionFilename(cd: string | undefined): string | undefined {
  if (!cd) return undefined;
  const m = /filename\*=UTF-8''([^;\n]+)|filename="([^"]+)"/i.exec(cd);
  if (m?.[1]) return decodeURIComponent(m[1].replace(/^"+|"+$/g, ''));
  if (m?.[2]) return m[2];
  return undefined;
}

function triggerDownloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.click();
  URL.revokeObjectURL(url);
}

function isImageMime(m: string): boolean {
  return /^image\//i.test(m);
}

function isVideoMime(m: string): boolean {
  return /^video\//i.test(m);
}

function mediaFolder(item: MediaItem): string {
  return item.folder ?? item.target_folder ?? '';
}

function mediaItemUnderFolderPrefix(item: MediaItem, filterKey: string): boolean {
  if (filterKey === FOLDER_FILTER_ALL || filterKey === MEDIA_ROOT_FOLDER_VALUE) return true;
  const folder = mediaFolder(item).replace(/\/$/, '');
  const prefix = filterKey.replace(/\/$/, '');
  if (!prefix) return !folder;
  if (!folder) return false;
  return folder === prefix || folder.startsWith(`${prefix}/`);
}

export default function KnowledgeMediaPage() {
  const { message } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();

  const [list, setList] = useState<{ items: MediaItem[]; count: number; bytes_total: number } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [proxyError, setProxyError] = useState<unknown>();
  const [reindexBusy, setReindexBusy] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadTargetFolder, setUploadTargetFolder] = useState<string>(MEDIA_ROOT_FOLDER_VALUE);
  const [backrefOpen, setBackrefOpen] = useState(false);
  const [backrefCode, setBackrefCode] = useState<string | null>(null);
  const [backrefData, setBackrefData] = useState<Awaited<ReturnType<typeof getMediaBackrefs>> | null>(
    null,
  );
  const [backrefLoading, setBackrefLoading] = useState(false);
  const [preview, setPreview] = useState<{ code: string; mime: string } | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [exportBusy, setExportBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importTargetFolder, setImportTargetFolder] = useState<string>(MEDIA_ROOT_FOLDER_VALUE);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [batchDeleteBusy, setBatchDeleteBusy] = useState(false);
  const [folderTree, setFolderTree] = useState<Awaited<ReturnType<typeof getDataTree>> | null>(null);
  const [folderFilter, setFolderFilter] = useState<string>(FOLDER_FILTER_ALL);
  const [tenantWikiPrefixes, setTenantWikiPrefixes] = useState<string[]>([]);
  const [mediaTablePage, setMediaTablePage] = useState({ current: 1, pageSize: 20 });

  const activeTenantName = useMemo(
    () => tenants.find((t) => t.id === activeTenantId)?.name,
    [tenants, activeTenantId],
  );

  const loadList = useCallback(async () => {
    if (!activeTenantId) {
      setList(null);
      setTenantWikiPrefixes([]);
      return;
    }
    setLoading(true);
    setProxyError(undefined);
    try {
      const data = await listMediaItems(activeTenantId);
      setList(data);
      setTenantWikiPrefixes(data.tenant_wiki_prefixes ?? []);
    } catch (err) {
      if (isKnowledgeProxyError(err)) setProxyError(err);
      else message.error(knowledgeProxyErrorMessage(err));
      setList(null);
      setTenantWikiPrefixes([]);
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, message]);

  const loadFolderTree = useCallback(async () => {
    if (!activeTenantId) {
      setFolderTree(null);
      return;
    }
    try {
      setFolderTree(
        await getDataTree(activeTenantId, 'media', DATA_TREE_DEFAULT_OPTS),
      );
    } catch {
      setFolderTree(null);
    }
  }, [activeTenantId]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadFolderTree();
  }, [loadFolderTree]);

  useEffect(() => {
    if (!activeTenantId || !preview) {
      setPreviewSrc(null);
      return;
    }
    let revoked: string | null = null;
    let cancelled = false;
    void fetchMediaObjectUrl(activeTenantId, preview.code)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        revoked = url;
        setPreviewSrc(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewSrc(null);
      });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [activeTenantId, preview]);

  const folderTreeData = useMemo(
    () => (folderTree ? [mapMediaFolderToTreeSelect(folderTree)] : []),
    [folderTree],
  );

  /** 多知识库绑定时上传/导入须选具体库目录，不提供层根 objects/ */
  const scopedFolderTreeData = useMemo(() => {
    if (tenantWikiPrefixes.length <= 1 || !folderTree?.children?.length) {
      return folderTreeData;
    }
    return folderTree.children.map(mapMediaFolderToTreeSelect);
  }, [folderTree, folderTreeData, tenantWikiPrefixes.length]);

  useEffect(() => {
    if (tenantWikiPrefixes.length <= 1 || !folderTree?.children?.length) return;
    const firstPath = folderTree.children[0]?.path?.replace(/\/$/, '');
    if (!firstPath) return;
    setUploadTargetFolder(firstPath);
    setImportTargetFolder(firstPath);
  }, [folderTree, tenantWikiPrefixes.length]);

  const filteredItems = useMemo<MediaItem[]>(() => {
    const items = list?.items ?? [];
    if (folderFilter === FOLDER_FILTER_ALL) return items;
    return items.filter((it) => mediaItemUnderFolderPrefix(it, folderFilter));
  }, [folderFilter, list]);

  const mediaTotalRows = filteredItems.length;
  const mediaMaxPage = Math.max(1, Math.ceil(mediaTotalRows / mediaTablePage.pageSize) || 1);

  useEffect(() => {
    if (mediaTablePage.current > mediaMaxPage) {
      setMediaTablePage((p) => ({ ...p, current: mediaMaxPage }));
    }
  }, [mediaMaxPage, mediaTablePage.current]);

  const onMediaTableChange: TableProps<MediaItem>['onChange'] = (pag) => {
    const nextSize = pag.pageSize ?? mediaTablePage.pageSize;
    const sizeChanged = nextSize !== mediaTablePage.pageSize;
    setMediaTablePage({
      current: sizeChanged ? 1 : (pag.current ?? 1),
      pageSize: nextSize,
    });
  };

  useEffect(() => {
    if (!list) return;
    if (list.items.length === 0) {
      setSelectedRowKeys([]);
      return;
    }
    const valid = new Set(list.items.map((i) => i.code));
    setSelectedRowKeys((prev) => prev.filter((k) => valid.has(String(k))));
  }, [list]);

  const onReindex = async () => {
    if (!activeTenantId) return;
    setReindexBusy(true);
    try {
      const data = await reindexMediaBackrefs(activeTenantId);
      message.success(
        `反向索引完成：${data.codes_with_refs} 个 code，共 ${data.total_ref_rows} 条引用`,
      );
    } catch (err) {
      message.error(knowledgeProxyErrorMessage(err));
    } finally {
      setReindexBusy(false);
    }
  };

  const openBackrefs = async (code: string) => {
    if (!activeTenantId) return;
    setBackrefCode(code);
    setBackrefOpen(true);
    setBackrefLoading(true);
    setBackrefData(null);
    try {
      setBackrefData(await getMediaBackrefs(activeTenantId, code));
    } catch (err) {
      message.error(knowledgeProxyErrorMessage(err));
    } finally {
      setBackrefLoading(false);
    }
  };

  const copy = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(okMsg);
    } catch {
      message.warning('复制失败，请手动选择文本');
    }
  };

  const copySelectedCodes = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先勾选要复制的行');
      return;
    }
    void copy(selectedRowKeys.map(String).join('  '), `已复制 ${selectedRowKeys.length} 个 code`);
  };

  const copySelectedPlaceholders = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先勾选要复制的行');
      return;
    }
    void copy(
      selectedRowKeys.map((k) => `![[MEDIA:${k}]]`).join('  '),
      `已复制 ${selectedRowKeys.length} 个 wiki 占位符`,
    );
  };

  const exportSelectedZip = async () => {
    if (!activeTenantId || selectedRowKeys.length === 0) {
      message.warning('请先勾选要导出的资源');
      return;
    }
    setExportBusy(true);
    try {
      const { blob, contentDisposition } = await exportMediaZip(
        activeTenantId,
        selectedRowKeys.map(String),
      );
      const name =
        parseDispositionFilename(contentDisposition) ?? 'wiki-media-export.zip';
      triggerDownloadBlob(blob, name);
      message.success(`已开始下载：${name}`);
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400) {
        message.error(err.message);
      } else {
        message.error(knowledgeProxyErrorMessage(err));
      }
    } finally {
      setExportBusy(false);
    }
  };

  const submitImportZip = async () => {
    if (!activeTenantId || !importFile) {
      message.warning('请选择 zip 文件');
      return;
    }
    setImportBusy(true);
    try {
      const folderVal = mediaFolderValueToTargetFolder(importTargetFolder);
      const data = await importMediaZip(activeTenantId, importFile, folderVal);
      message.success(data.message);
      if (data.warning) message.warning(data.warning);
      const errs = data.results.filter((r) => r.status === 'error');
      if (errs.length > 0) {
        Modal.warning({
          title: '部分条目失败',
          width: 640,
          content: (
            <Table
              size="small"
              pagination={{ pageSize: 8 }}
              rowKey={(_, i) => String(i)}
              dataSource={errs}
              columns={[
                { title: 'source', dataIndex: 'source_code', key: 's', ellipsis: true },
                { title: '说明', dataIndex: 'detail', key: 'd', ellipsis: true },
              ]}
            />
          ),
        });
      }
      setImportOpen(false);
      setImportFile(null);
      setImportTargetFolder(MEDIA_ROOT_FOLDER_VALUE);
      void loadList();
      void loadFolderTree();
    } catch (err) {
      message.error(knowledgeProxyErrorMessage(err));
    } finally {
      setImportBusy(false);
    }
  };

  const deleteOneMedia = async (code: string) => {
    if (!activeTenantId) return;
    try {
      const data = await deleteMedia(activeTenantId, code);
      message.success(data.message ?? '已删除');
      setSelectedRowKeys((prev) => prev.filter((k) => String(k) !== code));
      void loadList();
    } catch (err) {
      message.error(knowledgeProxyErrorMessage(err));
    }
  };

  const confirmBatchDelete = () => {
    if (!activeTenantId || selectedRowKeys.length === 0) {
      message.warning('请先勾选要删除的资源');
      return;
    }
    const n = selectedRowKeys.length;
    Modal.confirm({
      title: `确定删除选中的 ${n} 条媒体？`,
      content:
        '将移除 manifest 登记；若无其他条目共用磁盘路径则删除对象文件。wiki 正文中的占位符不会自动删除，请自行清理。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setBatchDeleteBusy(true);
        try {
          const data = await batchDeleteMedia(activeTenantId, selectedRowKeys.map(String));
          message.success(data.message);
          const deleted = new Set(
            data.results.filter((r) => r.status === 'deleted').map((r) => r.code),
          );
          setSelectedRowKeys((prev) => prev.filter((k) => !deleted.has(String(k))));
          const others = data.results.filter((r) => r.status !== 'deleted');
          if (others.length > 0) {
            Modal.warning({
              title: '部分条目未删除',
              width: 560,
              content: (
                <Table
                  size="small"
                  pagination={{ pageSize: 8 }}
                  rowKey={(_, i) => String(i)}
                  dataSource={others}
                  columns={[
                    { title: 'code', dataIndex: 'code', key: 'c', ellipsis: true },
                    { title: '状态', dataIndex: 'status', key: 's', width: 120 },
                    { title: '说明', dataIndex: 'detail', key: 'd', ellipsis: true },
                  ]}
                />
              ),
            });
          }
          void loadList();
        } catch (err) {
          message.error(knowledgeProxyErrorMessage(err));
        } finally {
          setBatchDeleteBusy(false);
        }
      },
    });
  };

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: true,
    showUploadList: true,
    customRequest: async (options) => {
      if (!activeTenantId) return;
      const { file, onError, onSuccess } = options;
      const f = file as File;
      try {
        const data = await uploadMedia(
          activeTenantId,
          f,
          uploadTitle.trim() || undefined,
          mediaFolderValueToTargetFolder(uploadTargetFolder),
        );
        onSuccess?.(data);
        message.success(
          data.deduplicated ? `已存在相同文件，code：${data.code}` : `上传成功：${data.code}`,
        );
        void loadList();
      } catch (err) {
        onError?.(err as Error);
        message.error(knowledgeProxyErrorMessage(err));
      }
    },
  };

  const rowActionsLocked = selectedRowKeys.length > 0;

  const columns: ColumnsType<MediaItem> = [
    {
      title: '预览',
      key: 'thumb',
      width: 88,
      render: (_, row) => {
        if (!activeTenantId) return null;
        const mime = row.mime ?? '';
        if (!isImageMime(mime) && !isVideoMime(mime)) {
          return <Text type="secondary">—</Text>;
        }
        return (
          <AuthenticatedMediaThumb
            tenantId={activeTenantId}
            code={row.code}
            mime={mime}
            onPreview={() => setPreview({ code: row.code, mime })}
          />
        );
      },
    },
    {
      title: 'code',
      dataIndex: 'code',
      key: 'code',
      ellipsis: true,
      render: (c: string) => (
        <Text code copyable={{ text: c }}>
          {c}
        </Text>
      ),
    },
    { title: 'MIME', dataIndex: 'mime', key: 'mime', width: 140, ellipsis: true },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 96,
      render: (s: number | undefined) => formatBytes(s ?? 0),
    },
    {
      title: '菜单',
      key: 'folder',
      width: 160,
      ellipsis: true,
      render: (_, row) => {
        const f = mediaFolder(row);
        return f ? <Text code>{f}</Text> : <Text type="secondary">—</Text>;
      },
    },
    { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true, render: (t) => t || '—' },
    {
      title: '原始文件名',
      dataIndex: 'original_name',
      key: 'original_name',
      ellipsis: true,
      render: (v) => v || '—',
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 200,
      ellipsis: true,
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, row) =>
        activeTenantId ? (
          <Space
            direction="vertical"
            size={4}
            title={
              rowActionsLocked
                ? '已勾选行时请使用上方批量操作；取消勾选后可使用行内操作'
                : undefined
            }
          >
            <Space size={[4, 4]} wrap>
              <Button
                size="small"
                icon={<CopyOutlined />}
                disabled={rowActionsLocked}
                onClick={() => void copy(row.code, '已复制 code')}
              >
                code
              </Button>
              <Button
                size="small"
                disabled={rowActionsLocked}
                onClick={() => void copy(`![[MEDIA:${row.code}]]`, '已复制 wiki 占位符')}
              >
                占位符
              </Button>
              <Button
                size="small"
                icon={<LinkOutlined />}
                disabled={rowActionsLocked}
                onClick={() => void openMediaInNewTab(activeTenantId, row.code)}
              >
                打开
              </Button>
            </Space>
            <Space size={[4, 4]} wrap>
              <Button
                size="small"
                icon={<SearchOutlined />}
                disabled={rowActionsLocked}
                onClick={() => void openBackrefs(row.code)}
              >
                反向引用
              </Button>
              <Popconfirm
                title="确定删除该媒体？"
                description="移除登记；无其他条目共用文件时删除对象。wiki 占位符需自行清理。"
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
                onConfirm={() => void deleteOneMedia(row.code)}
              >
                <Button
                  size="small"
                  danger
                  type="primary"
                  ghost
                  icon={<DeleteOutlined />}
                  disabled={rowActionsLocked}
                >
                  删除
                </Button>
              </Popconfirm>
            </Space>
          </Space>
        ) : null,
    },
  ];

  if (!activeTenantId) {
    return (
      <>
        <Typography.Title level={3} className="!mb-4">
          媒体库
        </Typography.Title>
        <Alert
          type="warning"
          showIcon
          message="请先在顶栏选择「当前操作租户」"
          description="媒体库按租户隔离，支持图片/视频/APK 等资源的上传、列表、导入导出与删除。"
        />
      </>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={3} className="!mb-0">
        媒体库
      </Typography.Title>
      <Alert type="info" showIcon message={`当前租户：${activeTenantName ?? activeTenantId}`} />
      {tenantWikiPrefixes.length > 0 ? (
        <Alert
          type="info"
          showIcon
          message="知识库可见范围"
          description={
            <>
              当前租户共有 <strong>{tenantWikiPrefixes.length}</strong> 个生效的 wiki 路径前缀，媒体列表与目录树按<strong>全部前缀联合</strong>过滤：
              <Text code>{tenantWikiPrefixes.join('、')}</Text>
              {tenantWikiPrefixes.length > 1 ? (
                <span>
                  。绑定多个知识库时，上传/导入须选择具体库目录（不可使用层根默认 <Text code>objects/</Text>）。
                </span>
              ) : null}
            </>
          }
        />
      ) : null}
      {proxyError != null ? <KnowledgeProxyErrorAlert error={proxyError} /> : null}

      <Card title="多媒体存储">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="说明"
          description={
            <span>
              对应服务端 <code>data/media/</code>（manifest + <code>objects/</code>）。wiki 中写 Obsidian 风格{' '}
              <code>![[MEDIA:…]]</code> 绑定资源。请先执行「重建 wiki 反向索引」再使用「反向引用」。支持勾选后导出 ZIP、从 ZIP
              导入及批量删除。
            </span>
          }
        />
        <Space wrap style={{ marginBottom: 16 }}>
          <Button icon={<ReloadOutlined />} onClick={() => void loadList()} loading={loading}>
            刷新列表
          </Button>
          <Button type="primary" ghost onClick={() => void onReindex()} loading={reindexBusy}>
            重建 wiki 反向索引
          </Button>
          <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
            从 ZIP 导入
          </Button>
        </Space>
        {list && (
          <Descriptions size="small" bordered column={2} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="登记条数">{list.count}</Descriptions.Item>
            <Descriptions.Item label="登记总大小">{formatBytes(list.bytes_total)}</Descriptions.Item>
          </Descriptions>
        )}
        <Card type="inner" title="上传" size="small" style={{ marginBottom: 16 }}>
          <Form layout="vertical" style={{ marginBottom: 0 }}>
            <Row gutter={[16, 0]} align="bottom">
              <Col xs={24} sm={14}>
                <Form.Item
                  label="目标目录"
                  tooltip="从 media/ 子目录选择；层根目录走默认 objects/aa/bb/… 分层落盘"
                  style={{ marginBottom: 12 }}
                >
                  <TreeSelect
                    value={uploadTargetFolder}
                    onChange={(v) => setUploadTargetFolder(v ?? MEDIA_ROOT_FOLDER_VALUE)}
                    treeData={scopedFolderTreeData}
                    treeDefaultExpandAll
                    showSearch
                    treeNodeFilterProp="title"
                    style={{ width: '100%' }}
                    placeholder="选择目标目录"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={10}>
                <Form.Item label="标题（可选）" style={{ marginBottom: 12 }}>
                  <Input
                    placeholder="写入 manifest，便于识别"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={[16, 0]} align="middle">
              <Col xs={24} sm={14}>
                <Upload
                  {...uploadProps}
                  accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.mov,application/vnd.android.package-archive,.apk"
                >
                  <Button icon={<UploadOutlined />}>选择文件并上传</Button>
                </Upload>
              </Col>
              <Col xs={24} sm={10}>
                <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.5 }}>
                  允许 png / jpg / webp / gif / mp4 / webm / mov / apk；大小与配额由服务端配置。
                </Text>
              </Col>
            </Row>
          </Form>
        </Card>
        <Space wrap style={{ marginBottom: 8 }}>
          <Text type="secondary">目录筛选</Text>
          <TreeSelect
            size="small"
            style={{ minWidth: 220 }}
            placeholder={`全部（${list?.items.length ?? 0}）`}
            allowClear
            showSearch
            treeDefaultExpandAll
            value={folderFilter === FOLDER_FILTER_ALL ? undefined : folderFilter}
            onChange={(v) => {
              setFolderFilter(v == null ? FOLDER_FILTER_ALL : String(v));
              setMediaTablePage((p) => ({ ...p, current: 1 }));
            }}
            treeData={folderTreeData}
            treeNodeFilterProp="title"
          />
          <Text type="secondary">已选 {selectedRowKeys.length} 条</Text>
          <Button
            size="small"
            icon={<CopyOutlined />}
            disabled={selectedRowKeys.length === 0}
            onClick={copySelectedCodes}
          >
            复制所选 code
          </Button>
          <Button size="small" disabled={selectedRowKeys.length === 0} onClick={copySelectedPlaceholders}>
            复制所选占位符
          </Button>
          <Button
            type="primary"
            size="small"
            icon={<DownloadOutlined />}
            disabled={selectedRowKeys.length === 0}
            loading={exportBusy}
            onClick={() => void exportSelectedZip()}
          >
            导出所选为 ZIP
          </Button>
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            disabled={selectedRowKeys.length === 0}
            loading={batchDeleteBusy}
            onClick={() => confirmBatchDelete()}
          >
            批量删除
          </Button>
        </Space>
        <Table<MediaItem>
          rowKey="code"
          loading={loading}
          size="small"
          scroll={{ x: 1260 }}
          dataSource={filteredItems}
          columns={columns}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
            preserveSelectedRowKeys: true,
          }}
          pagination={{
            current: mediaTablePage.current,
            pageSize: mediaTablePage.pageSize,
            total: mediaTotalRows,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100', '200'],
            showTotal: (t) => `共 ${t} 条`,
          }}
          onChange={onMediaTableChange}
        />
      </Card>

      <Drawer
        title={backrefCode ? `反向引用：${backrefCode}` : '反向引用'}
        placement="right"
        width={480}
        open={backrefOpen}
        onClose={() => {
          setBackrefOpen(false);
          setBackrefCode(null);
          setBackrefData(null);
        }}
      >
        {backrefLoading ? (
          <Text type="secondary">加载中…</Text>
        ) : backrefData ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {backrefData.message ? (
              <Alert type="warning" message={backrefData.message} showIcon />
            ) : null}
            <Table
              size="small"
              rowKey={(_, i) => String(i)}
              pagination={false}
              dataSource={backrefData.entries}
              columns={[
                { title: 'wiki 路径', dataIndex: 'wiki_path', key: 'wiki_path', ellipsis: true },
                { title: '标题路径', dataIndex: 'heading_path', key: 'heading_path', ellipsis: true },
              ]}
            />
          </Space>
        ) : null}
      </Drawer>

      <Modal
        open={importOpen}
        title="从导出 ZIP 导入"
        okText="开始导入"
        cancelText="取消"
        confirmLoading={importBusy}
        onCancel={() => {
          if (importBusy) return;
          setImportOpen(false);
          setImportFile(null);
          setImportTargetFolder(MEDIA_ROOT_FOLDER_VALUE);
        }}
        onOk={() => void submitImportZip()}
        destroyOnClose
        width={560}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="仅支持本页「导出所选为 ZIP」生成的包（根目录含 wiki_media_export.json 或兼容 pathy_media_export.json）。"
          />
          <Form layout="vertical">
            <Form.Item label="ZIP 文件" required>
              <Upload
                maxCount={1}
                accept=".zip,application/zip"
                beforeUpload={(f) => {
                  setImportFile(f);
                  return false;
                }}
                onRemove={() => setImportFile(null)}
              >
                <Button>选择 zip</Button>
              </Upload>
              {importFile ? <Text type="secondary">{importFile.name}</Text> : null}
            </Form.Item>
            <Form.Item
              label="目标菜单（media/ 下子目录）"
              extra={
                <span>
                  选择「层根目录」走默认 <Text code>objects/aa/bb/…</Text> 分层落盘。新建菜单请先在「存储结构」页在
                  media 层根下新增子目录。
                </span>
              }
            >
              <TreeSelect
                value={importTargetFolder}
                onChange={(v) => setImportTargetFolder(v ?? MEDIA_ROOT_FOLDER_VALUE)}
                treeData={scopedFolderTreeData}
                treeDefaultExpandAll
                showSearch
                treeNodeFilterProp="title"
                style={{ width: '100%' }}
                placeholder="选择目标菜单"
              />
            </Form.Item>
          </Form>
        </Space>
      </Modal>

      <Modal
        open={preview != null}
        footer={null}
        width={720}
        onCancel={() => setPreview(null)}
        title={preview ? `预览 · ${preview.code}` : '预览'}
        destroyOnClose
      >
        {preview && activeTenantId ? (
          previewSrc && isImageMime(preview.mime) ? (
            <img
              alt=""
              src={previewSrc}
              style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain' }}
            />
          ) : previewSrc && isVideoMime(preview.mime) ? (
            <video controls style={{ width: '100%', maxHeight: '70vh' }} src={previewSrc}>
              <track kind="captions" />
            </video>
          ) : (
            <Paragraph>
              {previewSrc
                ? `不支持内联预览的 MIME：${preview.mime}，请使用「打开」查看。`
                : '加载预览中…'}
            </Paragraph>
          )
        ) : null}
      </Modal>
    </Space>
  );
}
