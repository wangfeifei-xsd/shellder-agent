'use client';

import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { Dropdown, Layout, Menu, Select, Space, Spin, Tag, Typography } from 'antd';
import type { ItemType } from 'antd/es/menu/interface';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '@/components/auth/AuthContext';
import { ActiveTenantProvider, useActiveTenant } from './ActiveTenantContext';
import { MENU_PERMISSION_KEY, consoleMenuItems } from './menu-items';

const { Header, Sider, Content } = Layout;

function ActiveTenantPicker() {
  const { activeTenantId, setActiveTenantId, tenants } = useActiveTenant();
  return (
    <Space>
      <Typography.Text type="secondary">当前操作租户</Typography.Text>
      <Select
        allowClear
        showSearch
        placeholder="选择租户"
        style={{ width: 220 }}
        value={activeTenantId}
        onChange={(v) => setActiveTenantId(v)}
        optionFilterProp="label"
        notFoundContent="无可用租户"
        options={tenants.map((t) => ({ value: t.id, label: `${t.name}（${t.code}）` }))}
      />
    </Space>
  );
}

function UserMenu() {
  const { me, logout } = useAuth();
  const items = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: logout,
    },
  ];
  return (
    <Dropdown menu={{ items }} placement="bottomRight">
      <Space className="cursor-pointer">
        <UserOutlined />
        <span>{me?.displayName || me?.username}</span>
        {me?.permissions.isSuperAdmin ? <Tag color="gold">超管</Tag> : null}
      </Space>
    </Dropdown>
  );
}

/** 按当前用户菜单权限过滤侧栏顶级项 */
function useFilteredMenu(): ItemType[] {
  const { hasMenu, me } = useAuth();
  if (!me) return [];
  return (consoleMenuItems ?? []).filter((item): item is ItemType => {
    if (!item || !('key' in item) || item.key == null) return false;
    const permKey = MENU_PERMISSION_KEY[String(item.key)];
    return !permKey || hasMenu(permKey);
  });
}

function ConsoleShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, loading } = useAuth();
  const selectedKey = pathname === '/' ? '/' : pathname;
  const menuItems = useFilteredMenu();

  useEffect(() => {
    if (!loading && !me) {
      const redirect = encodeURIComponent(pathname);
      router.replace(`/login?redirect=${redirect}`);
    }
  }, [loading, me, pathname, router]);

  if (loading || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spin tip="加载中…" />
      </div>
    );
  }

  return (
    <Layout className="min-h-screen">
      <Sider width={240} theme="light" className="border-r border-gray-200">
        <div className="flex h-14 items-center px-4">
          <Link href="/">
            <Typography.Title level={5} className="!mb-0">
              shellder-agent
            </Typography.Title>
          </Link>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={['user', 'tenant', 'session']}
          items={menuItems}
          className="border-none"
        />
      </Sider>
      <Layout>
        <Header className="flex items-center justify-between bg-white px-6 shadow-sm">
          <ActiveTenantPicker />
          <UserMenu />
        </Header>
        <Content className="m-4 rounded-lg bg-white p-6 shadow-sm">{children}</Content>
      </Layout>
    </Layout>
  );
}

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ActiveTenantProvider>
        <ConsoleShell>{children}</ConsoleShell>
      </ActiveTenantProvider>
    </AuthProvider>
  );
}
