'use client';

import { Alert, Typography } from 'antd';

export default function DashboardPage() {
  return (
    <>
      <Typography.Title level={3}>工作台</Typography.Title>
      <Alert
        type="info"
        showIcon
        message="阶段 01 — 布局壳已就绪"
        description="侧栏菜单为占位项，业务页面将从阶段 02 起按执行计划逐步实现。"
        className="mt-4"
      />
    </>
  );
}
