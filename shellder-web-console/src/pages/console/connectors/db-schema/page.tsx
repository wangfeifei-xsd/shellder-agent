'use client';

import { ReloadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Drawer, Empty, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ErDiagramPanel } from '@/components/console/ErDiagramPanel';
import {
  EllipsisCell,
  ellipsisTextColumn,
  renderEllipsisLink,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import { useActiveTenant } from '@/components/console/ActiveTenantContext';
import {
  DbSchemaConnectorSummary,
  formatDbTarget,
  listDbSchemaConnectors,
} from '@/lib/connector';

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

export default function DbSchemaPage() {
  const { message } = App.useApp();
  const { activeTenantId, tenants } = useActiveTenant();
  const [searchParams, setSearchParams] = useSearchParams();

  const [data, setData] = useState<DbSchemaConnectorSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<DbSchemaConnectorSummary | undefined>();

  const activeTenantName = useMemo(
    () => tenants.find((t) => t.id === activeTenantId)?.name,
    [tenants, activeTenantId],
  );

  const load = useCallback(async () => {
    if (!activeTenantId) {
      setData([]);
      return;
    }
    setLoading(true);
    try {
      const res = await listDbSchemaConnectors(activeTenantId);
      setData(res.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载库表结构列表失败');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = searchParams.get('connectorId');
    if (!id || !data.length) return;
    const row = data.find((r) => r.id === id);
    if (row) setActive(row);
  }, [searchParams, data]);

  const openManage = (row: DbSchemaConnectorSummary) => {
    setActive(row);
    setSearchParams({ connectorId: row.id });
  };

  const closeDrawer = () => {
    setActive(undefined);
    setSearchParams({});
  };

  const columns: ColumnsType<DbSchemaConnectorSummary> = [
    ellipsisTextColumn<DbSchemaConnectorSummary>('连接器名称', 'name', 200),
    withNowrap<DbSchemaConnectorSummary>({
      title: '目标库',
      key: 'target',
      width: 240,
      ellipsis: true,
      render: (_, row) => {
        const text = formatDbTarget(row);
        return (
          <EllipsisCell tooltip={text}>
            <Typography.Text className="text-xs">{text}</Typography.Text>
          </EllipsisCell>
        );
      },
    }),
    withNowrap<DbSchemaConnectorSummary>({
      title: '结构抽取',
      dataIndex: 'introspectedAt',
      width: 170,
      render: (v: string | null) => fmt(v),
    }),
    withNowrap<DbSchemaConnectorSummary>({
      title: 'ER 发布',
      key: 'published',
      width: 160,
      render: (_, row) =>
        row.hasPublished ? (
          <Space size={4} className="flex-nowrap">
            <Tag className="shrink-0" color="green">
              v{row.publishedVersion}
            </Tag>
            <Typography.Text type="secondary" className="shrink-0 text-xs">
              {row.publishedTableCount} 表
            </Typography.Text>
          </Space>
        ) : (
          <Tag color="warning">未发布</Tag>
        ),
    }),
    withNowrap<DbSchemaConnectorSummary>({
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: string) => (
        <Tag color={s === 'enabled' ? 'green' : 'default'}>
          {s === 'enabled' ? '启用' : '停用'}
        </Tag>
      ),
    }),
    withNowrap<DbSchemaConnectorSummary>({
      title: '操作',
      key: 'actions',
      width: 100,
      fixed: 'right',
      render: (_, row) => renderEllipsisLink('维护', () => openManage(row)),
    }),
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Typography.Text type="secondary" className="text-xs">
            『查询型』配置
          </Typography.Text>
          <Typography.Title level={3} className="!mb-0">
            库表ER图
          </Typography.Title>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
      </div>

      {!activeTenantId ? (
        <Alert type="warning" showIcon message="请先在顶栏选择「当前操作租户」" />
      ) : (
        <>
          <Alert
            className="mb-4"
            type="info"
            showIcon
            message={`当前租户：${activeTenantName ?? activeTenantId}`}
            description={
              <>
                本页维护只读库的表结构抽取与 ER 关系图发布；数据库连接请在{' '}
                <Link to="/query/db-connectors">数据库连接器</Link> 中维护。未发布 ER 图时查询型
                Runtime 不可用。
              </>
            }
          />

          <Table<DbSchemaConnectorSummary>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data}
            pagination={false}
            {...tableEllipsisLayout}
            scroll={{ x: 980 }}
            tableLayout="fixed"
            locale={{
              emptyText: (
                <Empty description="该租户暂无只读数据库连接器">
                  <Link to="/query/db-connectors">去创建数据库连接器</Link>
                </Empty>
              ),
            }}
          />
        </>
      )}

      <Drawer
        title={active ? `库表ER图 — ${active.name}` : '库表ER图'}
        width={920}
        open={!!active}
        onClose={closeDrawer}
        destroyOnClose
      >
        {active && (
          <>
            <DescriptionsSummary row={active} />
            <ErDiagramPanel connectorId={active.id} onChanged={() => void load()} />
          </>
        )}
      </Drawer>
    </>
  );
}

function DescriptionsSummary({ row }: { row: DbSchemaConnectorSummary }) {
  return (
    <Typography.Paragraph type="secondary" className="text-sm">
      目标：{formatDbTarget(row)} · 抽取：{fmt(row.introspectedAt)} · 发布：
      {row.hasPublished
        ? ` v${row.publishedVersion}（${row.publishedTableCount} 表，${fmt(row.publishedAt)}）`
        : ' 无'}
    </Typography.Paragraph>
  );
}
