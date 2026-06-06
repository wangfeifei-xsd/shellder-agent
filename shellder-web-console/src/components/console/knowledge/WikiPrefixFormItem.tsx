'use client';

import { App, Form, TreeSelect } from 'antd';
import type { TreeSelectProps } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  browseDirKeyToPrefix,
  mapWikiPrefixTreeForMultiSelect,
  prefixToBrowseDirKey,
  type FolderTreeSelectNode,
} from '@/components/console/knowledgeFolderTree';
import {
  DATA_TREE_DEFAULT_OPTS,
  getDataTree,
  isKnowledgeProxyError,
  knowledgeProxyErrorMessage,
} from '@/lib/knowledge-proxy';

type WikiBrowseTreeSelectProps = TreeSelectProps & {
  treeData: FolderTreeSelectNode[];
};

/** 知识层管理卡片标题栏：单选目录浏览 */
export function WikiBrowseTreeSelect({
  treeData,
  placeholder = '目录（查询/上传）',
  allowClear = true,
  showSearch = true,
  treeDefaultExpandAll = true,
  treeNodeFilterProp = 'title',
  ...rest
}: WikiBrowseTreeSelectProps) {
  return (
    <TreeSelect
      allowClear={allowClear}
      showSearch={showSearch}
      treeDefaultExpandAll={treeDefaultExpandAll}
      treeNodeFilterProp={treeNodeFilterProp}
      placeholder={placeholder}
      treeData={treeData}
      {...rest}
    />
  );
}

type Props = {
  tenantId: string | undefined;
  label?: string;
  /** Form 字段名，默认 wiki_prefixes */
  fieldName?: string;
  /** 由父级统一加载时传入，避免重复请求 */
  treeData?: FolderTreeSelectNode[];
  treeLoading?: boolean;
};

/**
 * 召回 / Copilot 目录范围：多选 wiki 子路径。
 * 选项来自 getDataTree（按租户知识库 wiki 路径前缀裁剪），与知识层目录树一致。
 */
export function WikiPrefixFormItem({
  tenantId,
  label = 'wiki 子路径前缀（可选，可多选）',
  fieldName = 'wiki_prefixes',
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
      setTreeRoot(await getDataTree(tenantId, 'wiki', DATA_TREE_DEFAULT_OPTS));
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
    return treeRoot ? [mapWikiPrefixTreeForMultiSelect(treeRoot)] : [];
  }, [treeDataProp, treeRoot]);

  const treeLoading = treeLoadingProp ?? loading;

  return (
    <Form.Item
      name={fieldName}
      label={label}
      getValueFromEvent={(v: TreeSelectProps['value']) => {
        if (v == null) return [];
        const arr = Array.isArray(v) ? v : [v];
        return arr
          .map((item) => browseDirKeyToPrefix(String(item)))
          .filter(Boolean);
      }}
      getValueProps={(v: string[] | undefined) => ({
        value: (v ?? [])
          .map((p) => prefixToBrowseDirKey(String(p)))
          .filter(Boolean),
      })}
    >
      <TreeSelect
        multiple
        treeCheckable
        allowClear
        showSearch
        treeDefaultExpandAll
        loading={treeLoading}
        disabled={!tenantId}
        placeholder={
          tenantId
            ? '留空表示租户 wiki 全目录；可多选已配置知识库下的子目录'
            : '请先选择租户'
        }
        style={{ width: '100%' }}
        treeData={treeData}
        treeNodeFilterProp="title"
        maxTagCount="responsive"
      />
    </Form.Item>
  );
}

/** 问答测试 / Copilot：按租户加载 wiki 目录树（多选目录范围） */
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
      setTreeRoot(await getDataTree(tenantId, 'wiki', DATA_TREE_DEFAULT_OPTS));
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
    () => (treeRoot ? [mapWikiPrefixTreeForMultiSelect(treeRoot)] : []),
    [treeRoot],
  );

  return { treeData, loading, reload };
}
