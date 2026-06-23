import type { MenuProps } from 'antd';
import { Link } from 'react-router-dom';
import {
  ApartmentOutlined,
  AuditOutlined,
  BookOutlined,
  CloudServerOutlined,
  ControlOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  ExperimentOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  KeyOutlined,
  MessageOutlined,
  RobotOutlined,
  SettingOutlined,
  TeamOutlined,
  ToolOutlined,
} from '@ant-design/icons';

/**
 * 顶级菜单 key → RBAC 菜单权限 key 映射（一对一，与侧栏分组一致）。
 * 用于按当前用户权限过滤侧栏（缺失权限的菜单隐藏，对应路由后端返回 403）。
 */
export const MENU_PERMISSION_KEY: Record<string, string> = {
  '/': 'workbench',
  knowledge: 'knowledge',
  query: 'query',
  connector: 'connector',
  tool: 'tool',
  prompt: 'prompt',
  session: 'session',
  capability: 'capability',
  copilot: 'copilot',
  openapi: 'openapi',
  user: 'user',
  tenant: 'tenant',
  settings: 'settings',
  task: 'task',
  routing: 'routing',
  skill: 'skill',
  rule: 'rule',
  approval: 'approval',
  audit: 'audit',
};

/** 侧栏菜单（与架构 §6.1.1 对齐，链接随阶段推进逐步启用） */
export const consoleMenuItems: MenuProps['items'] = [
  { key: '/', icon: <DashboardOutlined />, label: <Link to="/">工作台</Link> },
  {
    key: 'knowledge',
    icon: <DatabaseOutlined />,
    label: '知识库',
    children: [
      { key: '/knowledge', label: <Link to="/knowledge">知识库管理</Link> },
      { key: '/knowledge/layers', label: <Link to="/knowledge/layers">知识层管理</Link> },
      { key: '/knowledge/structure', label: <Link to="/knowledge/structure">存储结构</Link> },
      { key: '/knowledge/media', label: <Link to="/knowledge/media">媒体库</Link> },
      { key: '/knowledge/recall-test', label: <Link to="/knowledge/recall-test">问答测试</Link> },
    ],
  },
  {
    key: 'query',
    icon: <DatabaseOutlined />,
    label: '『查询型』配置',
    children: [
      {
        key: '/query/db-connectors',
        label: <Link to="/query/db-connectors">数据库连接器</Link>,
      },
      { key: '/query/db-er', label: <Link to="/query/db-er">库表ER图</Link> },
      {
        key: '/query/db-channel-tools',
        label: <Link to="/query/db-channel-tools">数据库连接工具</Link>,
      },
      { key: '/query/query-test', label: <Link to="/query/query-test">查询测试</Link> },
      {
        key: '/query/channel-debug',
        label: <Link to="/query/channel-debug">通道调试</Link>,
      },
    ],
  },
  {
    key: 'connector',
    icon: <CloudServerOutlined />,
    label: '连接器管理',
    children: [{ key: '/connectors', label: <Link to="/connectors">连接器列表</Link> }],
  },
  {
    key: 'tool',
    icon: <ToolOutlined />,
    label: '工具管理',
    children: [
      { key: '/tools/http-query', label: <Link to="/tools/http-query">查询工具</Link> },
      { key: '/tools', label: <Link to="/tools">工具列表</Link> },
    ],
  },
  {
    key: 'routing',
    icon: <ApartmentOutlined />,
    label: '能力路由',
    children: [
      { key: '/routing/rules', label: <Link to="/routing/rules">路由规则</Link> },
      { key: '/routing/test', label: <Link to="/routing/test">路由测试</Link> },
      { key: '/routing/capabilities', label: <Link to="/routing/capabilities">能力目录</Link> },
    ],
  },
  {
    key: 'prompt',
    icon: <FileTextOutlined />,
    label: 'Prompt 管理',
    children: [{ key: '/prompts', label: <Link to="/prompts">模板列表</Link> }],
  },
  {
    key: 'session',
    icon: <MessageOutlined />,
    label: '会话管理',
    children: [
      { key: '/sessions', label: <Link to="/sessions">会话列表</Link> },
      { key: '/sessions/messages', label: <Link to="/sessions/messages">消息记录</Link> },
      { key: '/sessions/debug', label: <Link to="/sessions/debug">调试台</Link> },
    ],
  },
  {
    key: 'capability',
    icon: <ExperimentOutlined />,
    label: '业务调试',
    children: [
      { key: '/capabilities', label: <Link to="/capabilities">能力演示</Link> },
    ],
  },
  {
    key: 'copilot',
    icon: <RobotOutlined />,
    label: '嵌入式 Copilot',
    children: [
      { key: '/copilot-admin', label: <Link to="/copilot-admin">Copilot 配置</Link> },
      { key: '/copilot-admin/preview', label: <Link to="/copilot-admin/preview">嵌入预览</Link> },
    ],
  },
  {
    key: 'openapi',
    icon: <KeyOutlined />,
    label: 'OpenAPI 管理',
    children: [
      { key: '/openapi/apps', label: <Link to="/openapi/apps">应用接入</Link> },
      { key: '/openapi/logs', label: <Link to="/openapi/logs">调用日志</Link> },
      { key: '/openapi/docs', label: <Link to="/openapi/docs">接口文档</Link> },
    ],
  },
  {
    key: 'rule',
    icon: <ControlOutlined />,
    label: '规则',
    children: [
      { key: '/rules', label: <Link to="/rules">规则配置</Link> },
      { key: '/rule-hits', label: <Link to="/rule-hits">规则命中记录</Link> },
    ],
  },
  {
    key: 'approval',
    icon: <FileProtectOutlined />,
    label: '审批中心',
    children: [
      { key: '/approvals', label: <Link to="/approvals">待确认列表</Link> },
      { key: '/approvals/history', label: <Link to="/approvals/history">审批记录</Link> },
    ],
  },
  {
    key: 'audit',
    icon: <AuditOutlined />,
    label: '审计中心',
    children: [
      { key: '/audit', label: <Link to="/audit">工具调用审计</Link> },
      {
        key: '/audit/user-actions',
        label: <Link to="/audit/user-actions">用户操作审计</Link>,
      },
      {
        key: '/audit/external-calls',
        label: <Link to="/audit/external-calls">外部接口审计</Link>,
      },
      {
        key: '/audit/risk-actions',
        label: <Link to="/audit/risk-actions">风险动作审计</Link>,
      },
    ],
  },
  {
    key: 'user',
    icon: <TeamOutlined />,
    label: '用户与权限',
    children: [
      { key: '/users', label: <Link to="/users">用户管理</Link> },
      { key: '/roles', label: <Link to="/roles">角色管理</Link> },
      { key: '/permissions', label: <Link to="/permissions">权限策略</Link> },
    ],
  },
  {
    key: 'tenant',
    icon: <ApartmentOutlined />,
    label: '租户管理',
    children: [{ key: '/tenants', label: <Link to="/tenants">租户列表</Link> }],
  },
  {
    key: 'settings',
    icon: <SettingOutlined />,
    label: '系统设置',
    children: [
      { key: '/settings', label: <Link to="/settings">基础配置</Link> },
      { key: '/settings/llm', label: <Link to="/settings/llm">模型接入</Link> },
      { key: '/settings/model', label: <Link to="/settings/model">模型与响应配置</Link> },
      { key: '/settings/notification', label: <Link to="/settings/notification">通知配置</Link> },
    ],
  },
  {
    key: 'task',
    icon: <DeploymentUnitOutlined />,
    label: '任务中心（实验中）',
    children: [
      { key: '/tasks', label: <Link to="/tasks">任务列表</Link> },
      { key: '/tasks/tracking', label: <Link to="/tasks/tracking">长任务跟踪</Link> },
      { key: '/tasks/logs', label: <Link to="/tasks/logs">执行日志</Link> },
    ],
  },
  {
    key: 'skill',
    icon: <BookOutlined />,
    label: '技能书管理（实验中）',
    children: [
      { key: '/skills', label: <Link to="/skills">技能书列表</Link> },
      { key: '/skills/executions', label: <Link to="/skills/executions">调用记录</Link> },
    ],
  },
];
