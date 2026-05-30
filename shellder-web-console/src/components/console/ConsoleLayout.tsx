import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { Dropdown, Layout, Menu, Select, Space, Spin, Tag, Typography } from 'antd';
import type { ItemType } from 'antd/es/menu/interface';
import { useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/components/auth/AuthContext';
import { ActiveTenantProvider, useActiveTenant } from './ActiveTenantContext';
import { MENU_PERMISSION_KEY, consoleMenuItems } from './menu-items';

const { Header, Sider, Content } = Layout;

/** 侧栏品牌区与顶栏 Header 统一高度（px） */
const CONSOLE_TOP_BAR_HEIGHT = 64;
const CONSOLE_CONTENT_MARGIN = 16;
const siderMenuScrollHeight = `calc(100vh - ${CONSOLE_TOP_BAR_HEIGHT}px)`;
const mainContentScrollHeight = `calc(100vh - ${CONSOLE_TOP_BAR_HEIGHT}px - ${CONSOLE_CONTENT_MARGIN * 2}px)`;

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

function ConsoleShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { me, loading } = useAuth();
  const selectedKey = pathname === '/' ? '/' : pathname;
  const menuItems = useFilteredMenu();

  useEffect(() => {
    if (!loading && !me) {
      const redirect = encodeURIComponent(pathname);
      navigate(`/login?redirect=${redirect}`, { replace: true });
    }
  }, [loading, me, pathname, navigate]);

  if (loading || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spin tip="加载中…" />
      </div>
    );
  }

  return (
    <Layout className="!h-screen !max-h-screen !overflow-hidden">
      <Sider
        width={240}
        theme="light"
        className="console-sider !fixed !inset-y-0 !left-0 z-30 !h-screen !max-h-screen !overflow-hidden border-r border-gray-200 [&_.ant-layout-sider-children]:!flex [&_.ant-layout-sider-children]:!h-full [&_.ant-layout-sider-children]:!max-h-screen [&_.ant-layout-sider-children]:!min-h-0 [&_.ant-layout-sider-children]:!flex-col [&_.ant-layout-sider-children]:!overflow-hidden"
      >
        <div
          className="z-10 grid shrink-0 place-items-center border-b border-gray-100 bg-white px-4"
          style={{ height: CONSOLE_TOP_BAR_HEIGHT }}
        >
          <Link
            to="/"
            className="flex h-full w-full items-center justify-center no-underline hover:opacity-85"
          >
            <span
              className="text-lg font-bold leading-none tracking-tight text-gray-900 antialiased"
              style={{
                fontFamily:
                  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              }}
            >
              Shellder Agent
            </span>
          </Link>
        </div>
        <div
          className="overflow-x-hidden overflow-y-auto overscroll-contain"
          style={{ height: siderMenuScrollHeight, maxHeight: siderMenuScrollHeight }}
        >
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            defaultOpenKeys={[]}
            items={menuItems}
            className="border-none"
          />
        </div>
      </Sider>
      <Layout className="!ml-[240px] !flex !h-screen !max-h-screen !min-h-0 !flex-col !overflow-hidden">
        <Header
          className="z-20 flex shrink-0 items-center justify-between bg-white px-6 shadow-sm"
          style={{
            height: CONSOLE_TOP_BAR_HEIGHT,
            lineHeight: `${CONSOLE_TOP_BAR_HEIGHT}px`,
            padding: '0 24px',
          }}
        >
          <ActiveTenantPicker />
          <UserMenu />
        </Header>
        <Content
          className="!mx-4 !mb-4 !mt-4 overflow-y-auto overscroll-contain rounded-lg bg-white p-6 shadow-sm"
          style={{
            height: mainContentScrollHeight,
            maxHeight: mainContentScrollHeight,
            minHeight: 0,
            flex: 'none',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

export default function ConsoleLayout() {
  return (
    <AuthProvider>
      <ActiveTenantProvider>
        <ConsoleShell />
      </ActiveTenantProvider>
    </AuthProvider>
  );
}
