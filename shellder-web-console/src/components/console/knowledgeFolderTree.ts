import type { DataFolderTreeNode } from '@/lib/knowledge-proxy';

export interface FolderTreeSelectNode {
  value: string;
  title: string;
  children?: FolderTreeSelectNode[];
}

/** 媒体层根：走默认 objects/aa/bb/… 落盘 */
export const MEDIA_ROOT_FOLDER_VALUE = '__media_root__';

const SHA_DIR_RE = /^[0-9a-f]{2}$/i;

export function prefixToBrowseDirKey(prefix: string): string {
  return prefix.replace(/\/$/, '');
}

export function browseDirKeyToPrefix(key: string): string {
  return key ? `${key.replace(/\/$/, '')}/` : '';
}

export function joinUploadDirAndFileName(dirKey: string, fileName: string): string {
  const d = dirKey.replace(/^\/+|\/+$/g, '');
  return d ? `${d}/${fileName}` : fileName;
}

export function mapDataFolderToTreeSelect(node: DataFolderTreeNode): FolderTreeSelectNode {
  const value = node.path === '' ? '' : node.path.replace(/\/$/, '');
  return {
    value,
    title: node.title || value || '(根)',
    children: node.children?.length
      ? node.children.map(mapDataFolderToTreeSelect)
      : undefined,
  };
}

export function mapMediaFolderToTreeSelect(node: DataFolderTreeNode): FolderTreeSelectNode {
  const isRoot = node.path === '';
  const value = isRoot ? MEDIA_ROOT_FOLDER_VALUE : node.path.replace(/\/$/, '');
  const visibleChildren = (node.children ?? [])
    .filter((c) => !SHA_DIR_RE.test(c.title))
    .map(mapMediaFolderToTreeSelect);
  return {
    value,
    title: isRoot ? `${node.title}（默认 objects/aa/bb/…）` : node.path.replace(/\/$/, ''),
    children: visibleChildren.length ? visibleChildren : undefined,
  };
}

export function mediaFolderValueToTargetFolder(value: string): string | undefined {
  if (!value || value === MEDIA_ROOT_FOLDER_VALUE) return undefined;
  return value;
}
