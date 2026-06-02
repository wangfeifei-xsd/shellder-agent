import { Popover, Space, Tag, Typography } from 'antd';
import type { ColumnType } from 'antd/es/table';
import type { MouseEvent, ReactNode } from 'react';

/** 表头/单元格不换行 */
export const nowrapCell = () => ({ style: { whiteSpace: 'nowrap' as const } });

/** 为已有列补充 nowrap */
export function withNowrap<T>(col: ColumnType<T>): ColumnType<T> {
  return {
    ...col,
    onHeaderCell: nowrapCell,
    onCell: nowrapCell,
  };
}

type EllipsisTextColumnOpts<T> = {
  width?: number;
  render?: ColumnType<T>['render'];
  ellipsis?: boolean;
};

/** 标准文本列：省略 + 溢出 Tooltip（纯 dataIndex） */
export function ellipsisTextColumn<T extends object>(
  title: string,
  dataIndex: Extract<keyof T, string>,
  width?: number,
  opts?: EllipsisTextColumnOpts<T>,
): ColumnType<T> {
  return {
    title,
    dataIndex,
    width,
    ellipsis: opts?.ellipsis ?? true,
    onHeaderCell: nowrapCell,
    onCell: nowrapCell,
    ...opts,
  };
}

type EllipsisCellProps = {
  /** Tooltip 全文；默认取 children 字符串 */
  tooltip?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** 自定义 render 内单行省略 + 悬停全文 */
export function EllipsisCell({ tooltip, className, children }: EllipsisCellProps) {
  return (
    <Typography.Text
      className={['!mb-0 max-w-full', className].filter(Boolean).join(' ')}
      ellipsis={{ tooltip: tooltip ?? children }}
    >
      {children}
    </Typography.Text>
  );
}

/** 可点击链接 + 省略 */
export function renderEllipsisLink(
  text: string,
  onClick: (e: MouseEvent) => void,
  className?: string,
) {
  return (
    <EllipsisCell tooltip={text} className={className}>
      <a
        onClick={(e) => {
          e.preventDefault();
          onClick(e);
        }}
      >
        {text}
      </a>
    </EllipsisCell>
  );
}

/** 空值占位 */
export function renderEmptyDash() {
  return <Typography.Text type="secondary">—</Typography.Text>;
}

/** 可选字符串，空则 — */
export function renderOptionalText(v: string | null | undefined) {
  if (v == null || v === '') return renderEmptyDash();
  return <EllipsisCell tooltip={v}>{v}</EllipsisCell>;
}

type TagItem = { key: string; label: ReactNode };

/** 多 Tag 单行：超出 maxVisible 显示 +N，悬停/点击 Popover 看全部 */
export function renderCompactTags(
  items: TagItem[],
  opts?: { maxVisible?: number; empty?: ReactNode },
) {
  const maxVisible = opts?.maxVisible ?? 2;
  if (!items.length) return opts?.empty ?? renderEmptyDash();

  const visible = items.slice(0, maxVisible);
  const hidden = items.slice(maxVisible);
  const allLabels = items.map((i) => i.label);

  const body = (
    <Space size={4} className="flex max-w-full flex-nowrap overflow-hidden">
      {visible.map((i) => (
        <span key={i.key} className="shrink-0">
          {i.label}
        </span>
      ))}
      {hidden.length > 0 ? (
        <Tag className="shrink-0 cursor-default">+{hidden.length}</Tag>
      ) : null}
    </Space>
  );

  if (hidden.length === 0) {
    return (
      <EllipsisCell tooltip={allLabels.join('、')}>
        <Space size={4} className="flex-nowrap">
          {visible.map((i) => (
            <span key={i.key}>{i.label}</span>
          ))}
        </Space>
      </EllipsisCell>
    );
  }

  return (
    <Popover
      trigger="hover"
      content={
        <Space size={[4, 4]} wrap className="max-w-xs">
          {items.map((i) => (
            <span key={i.key}>{i.label}</span>
          ))}
        </Space>
      }
    >
      {body}
    </Popover>
  );
}

/** 表格常用 props */
export const tableEllipsisLayout = {
  tableLayout: 'fixed' as const,
  scroll: { x: 'max-content' as const },
};
