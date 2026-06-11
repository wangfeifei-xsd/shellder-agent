'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Collapse, Empty, Input, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo } from 'react';
import { tableEllipsisLayout, withNowrap } from '@/components/console/tableEllipsis';
import type { ErDiagram, ErRelationship, ErTableNode } from '@/lib/connector';

const CARDINALITY_OPTIONS = [
  { value: '1:1', label: '1:1 一对一' },
  { value: '1:N', label: '1:N 一对多' },
  { value: 'N:1', label: 'N:1 多对一' },
  { value: 'N:M', label: 'N:M 多对多' },
] as const;

function newRelationshipId(): string {
  return `rel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function emptyDiagram(): ErDiagram {
  return { tables: [], relationships: [] };
}

function columnOptions(table: ErTableNode | undefined): { value: string; label: string }[] {
  return (table?.columns ?? []).map((c) => ({
    value: c.name,
    label: c.pk ? `${c.name} (PK)` : c.name,
  }));
}

function RelationshipCard({
  rel,
  tables,
  tableByName,
  onChange,
  onRemove,
}: {
  rel: ErRelationship;
  tables: ErTableNode[];
  tableByName: Map<string, ErTableNode>;
  onChange: (next: ErRelationship) => void;
  onRemove: () => void;
}) {
  const fromTable = tableByName.get(rel.from);
  const toTable = tableByName.get(rel.to);
  const fromLabel = fromTable?.displayName || rel.from;
  const toLabel = toTable?.displayName || rel.to;

  return (
    <Card
      size="small"
      className={
        rel.inferred
          ? 'border border-dashed border-amber-400 bg-amber-50/50'
          : 'border border-blue-300 bg-blue-50/40'
      }
      title={
        <Space wrap>
          {rel.inferred ? (
            <Tag color="warning">推断关系</Tag>
          ) : (
            <Tag color="processing">外键 / 已确认</Tag>
          )}
          <Typography.Text type="secondary" className="text-xs font-normal">
            {rel.id}
          </Typography.Text>
        </Space>
      }
      extra={
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={onRemove}
          aria-label="删除关系"
        />
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-base">
        <Tag className="!m-0 text-sm">{rel.from}</Tag>
        <Typography.Text strong className="text-gray-700">
          {fromLabel}
        </Typography.Text>
        <Typography.Text type="secondary" className="px-1">
          ──
        </Typography.Text>
        <Tag color="purple" className="!m-0">
          {rel.cardinality}
        </Tag>
        <Typography.Text type="secondary" className="px-1">
          ──▶
        </Typography.Text>
        <Tag className="!m-0 text-sm">{rel.to}</Tag>
        <Typography.Text strong className="text-gray-700">
          {toLabel}
        </Typography.Text>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <div>
          <Typography.Text type="secondary" className="mb-1 block text-xs">
            源表
          </Typography.Text>
          <Select
            className="w-full"
            size="small"
            value={rel.from}
            options={tables.map((t) => ({
              value: t.name,
              label: `${t.displayName || t.name} (${t.name})`,
            }))}
            onChange={(from) => onChange({ ...rel, from, fromColumns: [] })}
          />
        </div>
        <div>
          <Typography.Text type="secondary" className="mb-1 block text-xs">
            目标表
          </Typography.Text>
          <Select
            className="w-full"
            size="small"
            value={rel.to}
            options={tables.map((t) => ({
              value: t.name,
              label: `${t.displayName || t.name} (${t.name})`,
            }))}
            onChange={(to) => onChange({ ...rel, to, toColumns: [] })}
          />
        </div>
        <div>
          <Typography.Text type="secondary" className="mb-1 block text-xs">
            基数
          </Typography.Text>
          <Select
            className="w-full"
            size="small"
            value={rel.cardinality}
            options={CARDINALITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(cardinality) =>
              onChange({ ...rel, cardinality: cardinality as ErRelationship['cardinality'] })
            }
          />
        </div>
        <div>
          <Typography.Text type="secondary" className="mb-1 block text-xs">
            源列（fromColumns）
          </Typography.Text>
          <Select
            className="w-full"
            size="small"
            mode="tags"
            placeholder="选择或输入列名"
            value={rel.fromColumns}
            options={columnOptions(fromTable)}
            onChange={(fromColumns) => onChange({ ...rel, fromColumns })}
          />
        </div>
        <div>
          <Typography.Text type="secondary" className="mb-1 block text-xs">
            目标列（toColumns）
          </Typography.Text>
          <Select
            className="w-full"
            size="small"
            mode="tags"
            placeholder="选择或输入列名"
            value={rel.toColumns}
            options={columnOptions(toTable)}
            onChange={(toColumns) => onChange({ ...rel, toColumns })}
          />
        </div>
        <div>
          <Typography.Text type="secondary" className="mb-1 block text-xs">
            来源
          </Typography.Text>
          <Select
            className="w-full"
            size="small"
            value={rel.inferred ? 'inferred' : 'confirmed'}
            options={[
              { value: 'confirmed', label: '外键 / 已确认' },
              { value: 'inferred', label: '推断（未落库 FK）' },
            ]}
            onChange={(v) => onChange({ ...rel, inferred: v === 'inferred' })}
          />
        </div>
      </div>
    </Card>
  );
}

export function ErDiagramAnnotateEditor({
  diagram,
  onChange,
}: {
  diagram: ErDiagram | null;
  onChange: (diagram: ErDiagram) => void;
}) {
  const d = diagram ?? emptyDiagram();
  const tables = d.tables ?? [];
  const relationships = d.relationships ?? [];

  const tableByName = useMemo(() => new Map(tables.map((t) => [t.name, t])), [tables]);

  const patch = (partial: Partial<ErDiagram>) => {
    onChange({ ...d, ...partial, tables: partial.tables ?? d.tables, relationships: partial.relationships ?? d.relationships });
  };

  const updateTable = (index: number, patchTable: Partial<ErTableNode>) => {
    const next = tables.map((t, i) => (i === index ? { ...t, ...patchTable } : t));
    patch({ tables: next });
  };

  const updateRelationship = (index: number, rel: ErRelationship) => {
    const next = relationships.map((r, i) => (i === index ? rel : r));
    patch({ relationships: next });
  };

  const removeRelationship = (index: number) => {
    patch({ relationships: relationships.filter((_, i) => i !== index) });
  };

  const addRelationship = () => {
    const from = tables[0]?.name ?? '';
    const to = tables[1]?.name ?? tables[0]?.name ?? '';
    if (!from || !to) return;
    const rel: ErRelationship = {
      id: newRelationshipId(),
      from,
      to,
      fromColumns: [],
      toColumns: [],
      cardinality: 'N:1',
      inferred: true,
    };
    patch({ relationships: [...relationships, rel] });
  };

  const tableColumns: ColumnsType<ErTableNode> = [
    withNowrap<ErTableNode>({
      title: '物理表名',
      dataIndex: 'name',
      width: 180,
      render: (name: string) => <Typography.Text code>{name}</Typography.Text>,
    }),
    withNowrap<ErTableNode>({
      title: '业务显示名',
      dataIndex: 'displayName',
      render: (_, row, index) => (
        <Input
          size="small"
          value={row.displayName ?? ''}
          placeholder={row.name}
          onChange={(e) => updateTable(index, { displayName: e.target.value })}
        />
      ),
    }),
    withNowrap<ErTableNode>({
      title: '列',
      width: 72,
      render: (_, row) => <Tag>{row.columns?.length ?? 0}</Tag>,
    }),
    withNowrap<ErTableNode>({
      title: '主键列',
      width: 160,
      ellipsis: true,
      render: (_, row) => {
        const pks = (row.columns ?? []).filter((c) => c.pk).map((c) => c.name);
        return pks.length ? pks.join(', ') : '—';
      },
    }),
  ];

  if (!tables.length) {
    return (
      <Empty
        description="暂无 ER 草稿，请先抽取表结构并由 LLM 生成草稿"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  const inferredCount = relationships.filter((r) => r.inferred).length;
  const confirmedCount = relationships.length - inferredCount;

  return (
    <div className="space-y-4">
      <Space wrap>
        <Tag color="blue">{tables.length} 张表</Tag>
        <Tag color="purple">{relationships.length} 条关系</Tag>
        <Tag color="processing">{confirmedCount} 已确认</Tag>
        <Tag color="warning">{inferredCount} 推断</Tag>
      </Space>

      <Collapse
        size="small"
        items={[
          {
            key: 'table-display-names',
            label: (
              <Space wrap>
                <span>表显示名</span>
                <Typography.Text type="secondary" className="text-xs font-normal">
                  {tables.length} 张表 · 修改后可视化与 NL2SQL 上下文同步更新
                </Typography.Text>
              </Space>
            ),
            children: (
              <Table<ErTableNode>
                size="small"
                rowKey="name"
                pagination={{ pageSize: 8, size: 'small', showSizeChanger: true }}
                dataSource={tables}
                columns={tableColumns}
                {...tableEllipsisLayout}
              />
            ),
          },
        ]}
      />

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <Typography.Title level={5} className="!mb-0 !text-sm">
            表间关联关系
          </Typography.Title>
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined />}
            onClick={addRelationship}
            disabled={tables.length < 1}
          >
            新增关系
          </Button>
        </div>
        <Typography.Paragraph type="secondary" className="!mb-3 text-xs">
          <Tag color="processing">蓝框</Tag> 外键或已确认；
          <Tag color="warning" className="ml-1">
            黄虚线
          </Tag>{' '}
          为推断关系，发布前建议核对源列/目标列。
        </Typography.Paragraph>
        {relationships.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无关系，可点击「新增关系」或 LLM 辅助生成草稿"
          />
        ) : (
          <div className="flex max-h-[480px] flex-col gap-3 overflow-y-auto pr-1">
            {relationships.map((rel, index) => (
              <RelationshipCard
                key={rel.id}
                rel={rel}
                tables={tables}
                tableByName={tableByName}
                onChange={(next) => updateRelationship(index, next)}
                onRemove={() => removeRelationship(index)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
