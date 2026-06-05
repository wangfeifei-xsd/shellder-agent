'use client';

import { QuestionCircleOutlined } from '@ant-design/icons';
import { Button, Collapse, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import {
  ellipsisTextColumn,
  renderOptionalText,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import {
  type DataScopeDimension,
  PHYSICAL_COLUMN_PLACEHOLDER,
  SCOPE_COLUMN_TOOLTIP,
  USER_COLUMN_TOOLTIP,
  dimensionColumn,
  dimensionStatus,
  filterTablesByDimension,
  tableInDimension,
} from '@/components/console/er-data-scope-ui';
import type { ErTableNode } from '@/lib/connector';

export function DataScopeDimensionPanel({
  dimension,
  allTables,
  schemaTableNames,
  resolveTableComment,
  resolveColumnOptions,
  onColumnChange,
  onAddTable,
  onRemoveTable,
  onConfirmRow,
}: {
  dimension: DataScopeDimension;
  allTables: ErTableNode[];
  schemaTableNames: string[];
  resolveTableComment?: (tableName: string) => string | undefined;
  resolveColumnOptions: (tableName: string) => { value: string; label: string }[];
  onColumnChange: (tableName: string, column: string | undefined) => void;
  onAddTable: (tableName: string) => void;
  onRemoveTable: (tableName: string) => void | Promise<void>;
  onConfirmRow: (tableName: string) => void | Promise<void>;
}) {
  const [pickTable, setPickTable] = useState<string | undefined>();
  const [confirmingTable, setConfirmingTable] = useState<string | null>(null);
  const [removingTable, setRemovingTable] = useState<string | null>(null);
  const rows = useMemo(
    () => filterTablesByDimension(allTables, dimension),
    [allTables, dimension],
  );
  const availableToAdd = useMemo(() => {
    const inList = new Set(rows.map((t) => t.name));
    const names = new Set<string>(schemaTableNames);
    for (const t of allTables) names.add(t.name);
    return [...names].filter((n) => !inList.has(n)).sort((a, b) => a.localeCompare(b));
  }, [rows, schemaTableNames, allTables]);

  const tooltip = dimension === 'scope' ? SCOPE_COLUMN_TOOLTIP : USER_COLUMN_TOOLTIP;
  const embedKey = dimension === 'scope' ? 'scopeList' : 'externalUserId';
  const tagLabel = dimension === 'scope' ? '范围列' : '用户列';
  const tagColor = dimension === 'scope' ? 'processing' : 'purple';

  const columns: ColumnsType<ErTableNode> = [
    ellipsisTextColumn<ErTableNode>('表名', 'name', 180),
    withNowrap<ErTableNode>({
      title: '注释',
      ellipsis: true,
      render: (_, row) =>
        renderOptionalText(resolveTableComment?.(row.name) ?? row.displayName),
    }),
    withNowrap<ErTableNode>({
      title: (
        <Tooltip title={tooltip}>
          <span>
            物理列 <QuestionCircleOutlined className="text-gray-400" />
          </span>
        </Tooltip>
      ),
      width: 160,
      render: (_, row) => (
        <Select
          allowClear
          showSearch
          size="small"
          className="w-full"
          placeholder={PHYSICAL_COLUMN_PLACEHOLDER}
          value={dimensionColumn(row.dataScope, dimension)}
          options={resolveColumnOptions(row.name)}
          onChange={(v) => onColumnChange(row.name, v ?? undefined)}
        />
      ),
    }),
    withNowrap<ErTableNode>({
      title: '嵌入映射',
      width: 140,
      ellipsis: true,
      render: (_, row) => {
        const col = dimensionColumn(row.dataScope, dimension);
        if (!col) return renderOptionalText(undefined);
        return renderOptionalText(`${embedKey} → ${col}`);
      },
    }),
    withNowrap<ErTableNode>({
      title: '状态',
      width: 72,
      render: (_, row) => {
        const status = dimensionStatus(row.dataScope, dimension);
        if (status === '推断') return <Tag color="gold">推断</Tag>;
        if (status === '已确认') return <Tag color="blue">已确认</Tag>;
        return <Tag>待配置</Tag>;
      },
    }),
    withNowrap<ErTableNode>({
      title: '说明',
      ellipsis: true,
      render: (_, row) => renderOptionalText(row.dataScope?.reason),
    }),
    withNowrap<ErTableNode>({
      title: '操作',
      width: 100,
      render: (_, row) => (
        <Space size={0}>
          {dimensionStatus(row.dataScope, dimension) === '推断' ? (
            <Button
              type="link"
              size="small"
              loading={confirmingTable === row.name}
              onClick={() => {
                setConfirmingTable(row.name);
                void Promise.resolve(onConfirmRow(row.name)).finally(() => {
                  setConfirmingTable(null);
                });
              }}
            >
              确认
            </Button>
          ) : null}
          <Button
            type="link"
            size="small"
            danger
            loading={removingTable === row.name}
            onClick={() => {
              setRemovingTable(row.name);
              void Promise.resolve(onRemoveTable(row.name)).finally(() => {
                setRemovingTable(null);
              });
            }}
          >
            移除
          </Button>
        </Space>
      ),
    }),
  ];

  return (
    <Collapse
      className="mb-3"
      defaultActiveKey={[dimension]}
      items={[
        {
          key: dimension,
          label: (
            <Space wrap>
              <Tag color={tagColor}>{tagLabel}</Tag>
              <span>
                {rows.length} 张表 · {embedKey}
              </span>
            </Space>
          ),
          children: (
            <>
              <Space className="mb-3" wrap>
                <Select
                  showSearch
                  allowClear
                  size="small"
                  className="min-w-[200px]"
                  placeholder="选择表"
                  value={pickTable}
                  optionFilterProp="label"
                  disabled={availableToAdd.length === 0}
                  options={availableToAdd.map((n) => ({ value: n, label: n }))}
                  onChange={setPickTable}
                />
                <Button
                  size="small"
                  type="primary"
                  ghost
                  disabled={!pickTable}
                  onClick={() => {
                    if (pickTable) {
                      onAddTable(pickTable);
                      setPickTable(undefined);
                    }
                  }}
                >
                  添加表
                </Button>
                {availableToAdd.length === 0 && rows.length > 0 ? (
                  <Typography.Text type="secondary" className="text-xs">
                    已抽取表均已加入本维度
                  </Typography.Text>
                ) : null}
              </Space>
              {rows.length > 0 ? (
                <Table<ErTableNode>
                  size="small"
                  rowKey="name"
                  pagination={{ pageSize: 10, showSizeChanger: true, size: 'small' }}
                  dataSource={rows}
                  columns={columns}
                  {...tableEllipsisLayout}
                />
              ) : (
                <Typography.Text type="secondary" className="text-xs">
                  暂无表。点击「添加表」或「分析列映射」生成本维度的列绑定。
                </Typography.Text>
              )}
            </>
          ),
        },
      ]}
    />
  );
}

/** 表是否参与任一维度维护（用于外层折叠标题统计） */
export function tableHasAnyDataScope(row: ErTableNode): boolean {
  return tableInDimension(row, 'scope') || tableInDimension(row, 'user');
}
