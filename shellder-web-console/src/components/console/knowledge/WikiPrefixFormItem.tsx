'use client';

import { App, Form, TreeSelect } from 'antd';
import type { TreeSelectProps } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  browseDirKeyToPrefix,
  mapDataFolderToTreeSelect,
  prefixToBrowseDirKey,
  type FolderTreeSelectNode,
} from '@/components/console/knowledgeFolderTree';
import { getDataTree, isKnowledgeProxyError, knowledgeProxyErrorMessage } from '@/lib/knowledge-proxy';

type Props = {
  tenantId: string | undefined;
  label?: string;
  /** 由父级统一加载时传入，避免重复请求 */
  treeData?: FolderTreeSelectNode[];
  treeLoading?: boolean;
};

/** 召回/问答测试：wiki 子路径前缀，从 wiki 层目录树选择 */
export function WikiPrefixFormItem({
  tenantId,
  label = 'wiki 子路径前缀（可选）',
  treeData: treeDataProp,
  treeLoading: treeLoadingProp,
}: Props) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [treeRoot, setTreeRoot] = useState<Awaited<ReturnType<typeof getDataTree>> | null>(null);

  const loadTree = useCallback(async () => {
    if (!tenantId || treeDataProp !== undefined) {
      if (!tenantId) setTreeRoot(null);
      return;
    }
    setLoading(true);
    try {
      setTreeRoot(await getDataTree(tenantId, 'wiki', { max_depth: 32, max_nodes: 2000 }));
    } catch (err) {
      setTreeRoot(null);
      if (!isKnowledgeProxyError(err)) {
        message.error(knowledgeProxyErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId, treeDataProp, message]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const treeData = useMemo(() => {
    if (treeDataProp !== undefined) return treeDataProp;
    return treeRoot ? [mapDataFolderToTreeSelect(treeRoot)] : [];
  }, [treeDataProp, treeRoot]);

  const treeLoading = treeLoadingProp ?? loading;

  return (
    <Form.Item
      name="wiki_prefix"
      label={label}
      getValueFromEvent={(v: TreeSelectProps['value']) =>
        browseDirKeyToPrefix(typeof v === 'string' ? v : '')
      }
      getValueProps={(v) => ({
        value: v && String(v).trim() ? prefixToBrowseDirKey(String(v)) : undefined,
      })}
    >
      <TreeSelect
        allowClear
        showSearch
        treeDefaultExpandAll
        loading={treeLoading}
        placeholder="留空表示扫描整个 wiki；请选择子目录"
        style={{ width: '100%' }}
        treeData={treeData}
        treeNodeFilterProp="title"
      />
    </Form.Item>
  );
}

/** 问答测试页：按租户加载 wiki 目录树（两卡片共用） */
export function useWikiPrefixTree(tenantId: string | undefined) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [treeRoot, setTreeRoot] = useState<Awaited<ReturnType<typeof getDataTree>> | null>(null);

  const reload = useCallback(async () => {
    if (!tenantId) {
      setTreeRoot(null);
      return;
    }
    setLoading(true);
    try {
      setTreeRoot(await getDataTree(tenantId, 'wiki', { max_depth: 32, max_nodes: 2000 }));
    } catch (err) {
      setTreeRoot(null);
      if (!isKnowledgeProxyError(err)) {
        message.error(knowledgeProxyErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId, message]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const treeData = useMemo(
    () => (treeRoot ? [mapDataFolderToTreeSelect(treeRoot)] : []),
    [treeRoot],
  );

  return { treeData, loading, reload };
}
