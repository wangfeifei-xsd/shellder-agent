'use client';

import { Layout, Menu, Typography } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { consoleMenuItems } from './menu-items';

const { Header, Sider, Content } = Layout;

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const selectedKey = pathname === '/' ? '/' : pathname;

  return (
    <Layout className="min-h-screen">
      <Sider width={240} theme="light" className="border-r border-gray-200">
        <div className="flex h-14 items-center px-4">
          <Typography.Title level={5} className="!mb-0">
            Agent 平台
          </Typography.Title>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={['session', 'tenant']}
          items={consoleMenuItems}
          className="border-none"
        />
      </Sider>
      <Layout>
        <Header className="flex items-center justify-between bg-white px-6 shadow-sm">
          <Typography.Text type="secondary">V1 管理后台（阶段 01 布局壳）</Typography.Text>
          <Link href="/login">退出登录（占位）</Link>
        </Header>
        <Content className="m-4 rounded-lg bg-white p-6 shadow-sm">{children}</Content>
      </Layout>
    </Layout>
  );
}
