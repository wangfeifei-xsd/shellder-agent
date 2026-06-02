'use client';

import { FileTextOutlined, ReloadOutlined } from '@ant-design/icons';
import { App, Button, Input, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  EllipsisCell,
  ellipsisTextColumn,
  tableEllipsisLayout,
  withNowrap,
} from '@/components/console/tableEllipsis';
import {
  PromptCategory,
  PromptRole,
  PromptTemplateListItem,
  listPromptTemplates,
} from '@/lib/prompt';

const { Title } = Typography;

const CATEGORY_OPTIONS: { value: PromptCategory; label: string }[] = [
  { value: 'qa', label: '问答型' },
  { value: 'query', label: '查询型' },
  { value: 'sql_conversion', label: 'SQL转化' },
  { value: 'connector', label: '连接器' },
  { value: 'routing', label: '路由' },
  { value: 'runtime', label: 'Runtime' },
  { value: 'common', label: '通用片段' },
];

const ROLE_OPTIONS: { value: PromptRole; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'user', label: 'User' },
  { value: 'fragment', label: 'Fragment' },
];

export default function PromptListPage() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PromptTemplateListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [category, setCategory] = useState<PromptCategory | undefined>();
  const [role, setRole] = useState<PromptRole | undefined>();
  const [keyword, setKeyword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPromptTemplates({
        page,
        pageSize,
        category,
        role,
        keyword: keyword || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, category, role, keyword, message]);

  useEffect(() => {
    load();
  }, [load]);

  const columns: ColumnsType<PromptTemplateListItem> = [
    ellipsisTextColumn<PromptTemplateListItem>('名称', 'name', 160),
    withNowrap<PromptTemplateListItem>({
      title: '分类',
      dataIndex: 'category',
      width: 100,
      render: (v: PromptCategory) => <Tag>{v}</Tag>,
    }),
    ellipsisTextColumn<PromptTemplateListItem>('角色', 'role', 88),
    ellipsisTextColumn<PromptTemplateListItem>('作用域', 'scope', 88),
    withNowrap<PromptTemplateListItem>({
      title: '已发布版本',
      width: 120,
      render: (_, r) => (
        <EllipsisCell>
          {r.publishedVersion != null ? `v${r.publishedVersion}` : '—'}
        </EllipsisCell>
      ),
    }),
    withNowrap<PromptTemplateListItem>({
      title: '操作',
      width: 88,
      render: (_, r) => (
        <EllipsisCell>
          <Link to={`/prompts/${r.id}`}>详情</Link>
        </EllipsisCell>
      ),
    }),
  ];

  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title level={4} className="!mb-0">
          <FileTextOutlined className="mr-2" />
          Prompt 管理
        </Title>
        <Button icon={<ReloadOutlined />} onClick={load}>
          刷新
        </Button>
      </div>

      <Space wrap>
        <Select
          allowClear
          placeholder="分类"
          style={{ width: 140 }}
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={(v) => {
            setCategory(v);
            setPage(1);
          }}
        />
        <Select
          allowClear
          placeholder="角色"
          style={{ width: 140 }}
          options={ROLE_OPTIONS}
          value={role}
          onChange={(v) => {
            setRole(v);
            setPage(1);
          }}
        />
        <Input.Search
          allowClear
          placeholder="搜索 key / 名称"
          style={{ width: 260 }}
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
        />
      </Space>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={items}
        {...tableEllipsisLayout}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />
    </div>
  );
}
