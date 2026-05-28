import type { MenuProps } from 'antd';
import {
  ApartmentOutlined,
  AuditOutlined,
  BookOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  DeploymentUnitOutlined,
  FileProtectOutlined,
  KeyOutlined,
  MessageOutlined,
  SettingOutlined,
  TeamOutlined,
  ToolOutlined,
} from '@ant-design/icons';

/** 侧栏菜单占位（与架构 §6.1.1 对齐，链接待后续阶段实现） */
export const consoleMenuItems: MenuProps['items'] = [
  { key: '/', icon: <DashboardOutlined />, label: '工作台' },
  {
    key: 'session',
    icon: <MessageOutlined />,
    label: '会话管理',
    children: [
      { key: '/sessions', label: '会话列表', disabled: true },
      { key: '/sessions/debug', label: '调试台', disabled: true },
    ],
  },
  {
    key: 'task',
    icon: <DeploymentUnitOutlined />,
    label: '任务中心',
    children: [{ key: '/tasks', label: '任务列表', disabled: true }],
  },
  {
    key: 'routing',
    icon: <ApartmentOutlined />,
    label: '能力路由',
    children: [{ key: '/routing', label: '路由规则', disabled: true }],
  },
  {
    key: 'skill',
    icon: <BookOutlined />,
    label: '技能书管理',
    children: [{ key: '/skills', label: '技能书列表', disabled: true }],
  },
  {
    key: 'tool',
    icon: <ToolOutlined />,
    label: '工具管理',
    children: [{ key: '/tools', label: '工具列表', disabled: true }],
  },
  {
    key: 'connector',
    icon: <CloudServerOutlined />,
    label: '连接器管理',
    children: [{ key: '/connectors', label: '连接器列表', disabled: true }],
  },
  {
    key: 'knowledge',
    icon: <BookOutlined />,
    label: '知识库与规则',
    children: [{ key: '/knowledge', label: '知识层管理', disabled: true }],
  },
  {
    key: 'approval',
    icon: <FileProtectOutlined />,
    label: '审批中心',
    children: [{ key: '/approvals', label: '待确认列表', disabled: true }],
  },
  {
    key: 'audit',
    icon: <AuditOutlined />,
    label: '审计中心',
    children: [{ key: '/audit', label: '工具调用审计', disabled: true }],
  },
  {
    key: 'user',
    icon: <TeamOutlined />,
    label: '用户与权限',
    children: [{ key: '/users', label: '用户管理', disabled: true }],
  },
  {
    key: 'tenant',
    icon: <ApartmentOutlined />,
    label: '租户管理',
    children: [{ key: '/tenants', label: '租户列表', disabled: true }],
  },
  {
    key: 'openapi',
    icon: <KeyOutlined />,
    label: 'OpenAPI 管理',
    children: [{ key: '/openapi', label: '应用接入', disabled: true }],
  },
  {
    key: 'settings',
    icon: <SettingOutlined />,
    label: '系统设置',
    children: [{ key: '/settings', label: '基础配置', disabled: true }],
  },
];
