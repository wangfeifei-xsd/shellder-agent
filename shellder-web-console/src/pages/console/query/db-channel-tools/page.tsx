'use client';

import { ToolPage } from '@/pages/console/tools/page';

/** 『查询型』配置 — 数据库连接工具（仅查询型 Tool 的注册与维护） */
export default function DbChannelToolsPage() {
  return <ToolPage variant="queryOnly" />;
}
