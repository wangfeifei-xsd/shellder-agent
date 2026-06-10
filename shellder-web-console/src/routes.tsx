import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import ConsoleLayout from '@/components/console/ConsoleLayout';
import CopilotLayout from '@/components/copilot/CopilotLayout';

const LoginPage = lazy(() => import('@/pages/login/page'));
const CopilotPage = lazy(() => import('@/pages/copilot/page'));

const DashboardPage = lazy(() => import('@/pages/console/page'));
const SessionListPage = lazy(() => import('@/pages/console/sessions/page'));
const MessageRecordsPage = lazy(() => import('@/pages/console/sessions/messages/page'));
const DebugConsolePage = lazy(() => import('@/pages/console/sessions/debug/page'));
const SessionDetailPage = lazy(() => import('@/pages/console/sessions/[id]/page'));
const TaskListPage = lazy(() => import('@/pages/console/tasks/page'));
const TaskTrackingPage = lazy(() => import('@/pages/console/tasks/tracking/page'));
const TaskLogsPage = lazy(() => import('@/pages/console/tasks/logs/page'));
const RoutingRulesPage = lazy(() => import('@/pages/console/routing/rules/page'));
const RoutingTestPage = lazy(() => import('@/pages/console/routing/test/page'));
const CapabilitiesCatalogPage = lazy(() => import('@/pages/console/routing/capabilities/page'));
const CapabilitiesDemoPage = lazy(() => import('@/pages/console/capabilities/page'));
const SkillPage = lazy(() => import('@/pages/console/skills/page'));
const SkillExecutionsPage = lazy(() => import('@/pages/console/skills/executions/page'));
const ToolPage = lazy(() => import('@/pages/console/tools/page'));
const SqlToolPage = lazy(() => import('@/pages/console/tools/sql/page'));
const ConnectorPage = lazy(() => import('@/pages/console/connectors/page'));
const DbConnectorPage = lazy(() => import('@/pages/console/query/db-connectors/page'));
const DbErPage = lazy(() => import('@/pages/console/query/db-er/page'));
const QueryTestPage = lazy(() => import('@/pages/console/query/query-test/page'));
const DbChannelToolsPage = lazy(() => import('@/pages/console/query/db-channel-tools/page'));
const DbSchemaLegacyRedirect = lazy(
  () => import('@/pages/console/connectors/db-schema-redirect'),
);
const RuleConfigPage = lazy(() => import('@/pages/console/rules/page'));
const RuleHitsPage = lazy(() => import('@/pages/console/rule-hits/page'));
const KnowledgePage = lazy(() => import('@/pages/console/knowledge/page'));
const KnowledgeLayersPage = lazy(() => import('@/pages/console/knowledge/layers/page'));
const KnowledgeStructurePage = lazy(() => import('@/pages/console/knowledge/structure/page'));
const KnowledgeMediaPage = lazy(() => import('@/pages/console/knowledge/media/page'));
const KnowledgeRecallTestPage = lazy(() => import('@/pages/console/knowledge/recall-test/page'));
const ApprovalListPage = lazy(() => import('@/pages/console/approvals/page'));
const ApprovalHistoryPage = lazy(() => import('@/pages/console/approvals/history/page'));
const ApprovalDetailPage = lazy(() => import('@/pages/console/approvals/[id]/page'));
const ToolCallAuditPage = lazy(() => import('@/pages/console/audit/page'));
const UserActionAuditPage = lazy(() => import('@/pages/console/audit/user-actions/page'));
const ExternalCallAuditPage = lazy(() => import('@/pages/console/audit/external-calls/page'));
const RiskActionAuditPage = lazy(() => import('@/pages/console/audit/risk-actions/page'));
const UserListPage = lazy(() => import('@/pages/console/users/page'));
const RoleListPage = lazy(() => import('@/pages/console/roles/page'));
const PermissionPolicyPage = lazy(() => import('@/pages/console/permissions/page'));
const TenantListPage = lazy(() => import('@/pages/console/tenants/page'));
const NewTenantPage = lazy(() => import('@/pages/console/tenants/new/page'));
const TenantDetailPage = lazy(() => import('@/pages/console/tenants/[id]/page'));
const EditTenantPage = lazy(() => import('@/pages/console/tenants/[id]/edit/page'));
const TenantIsolationPage = lazy(() => import('@/pages/console/tenants/[id]/isolation/page'));
const OpenApiAppsPage = lazy(() => import('@/pages/console/openapi/apps/page'));
const OpenApiAppDetailPage = lazy(() => import('@/pages/console/openapi/apps/[id]/page'));
const OpenApiCallLogsPage = lazy(() => import('@/pages/console/openapi/logs/page'));
const OpenApiDocsPage = lazy(() => import('@/pages/console/openapi/docs/page'));
const CopilotAdminPage = lazy(() => import('@/pages/console/copilot-admin/page'));
const CopilotPreviewPage = lazy(() => import('@/pages/console/copilot-admin/preview/page'));
const BasicSettingsPage = lazy(() => import('@/pages/console/settings/page'));
const ModelSettingsPage = lazy(() => import('@/pages/console/settings/model/page'));
const LlmIntegrationPage = lazy(() => import('@/pages/console/settings/llm/page'));
const NotificationSettingsPage = lazy(() => import('@/pages/console/settings/notification/page'));
const PromptListPage = lazy(() => import('@/pages/console/prompts/page'));
const PromptDetailPage = lazy(() => import('@/pages/console/prompts/[id]/page'));

export const appRoutes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    path: '/copilot',
    element: (
      <CopilotLayout>
        <CopilotPage />
      </CopilotLayout>
    ),
  },
  {
    path: '/',
    element: <ConsoleLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'sessions', element: <SessionListPage /> },
      { path: 'sessions/messages', element: <MessageRecordsPage /> },
      { path: 'sessions/debug', element: <DebugConsolePage /> },
      { path: 'sessions/:id', element: <SessionDetailPage /> },
      { path: 'tasks', element: <TaskListPage /> },
      { path: 'tasks/tracking', element: <TaskTrackingPage /> },
      { path: 'tasks/logs', element: <TaskLogsPage /> },
      { path: 'routing/rules', element: <RoutingRulesPage /> },
      { path: 'routing/test', element: <RoutingTestPage /> },
      { path: 'routing/capabilities', element: <CapabilitiesCatalogPage /> },
      { path: 'capabilities', element: <CapabilitiesDemoPage /> },
      { path: 'skills', element: <SkillPage /> },
      { path: 'skills/executions', element: <SkillExecutionsPage /> },
      { path: 'tools', element: <ToolPage /> },
      { path: 'tools/sql', element: <SqlToolPage /> },
      { path: 'connectors', element: <ConnectorPage /> },
      { path: 'connectors/db-schema', element: <DbSchemaLegacyRedirect /> },
      { path: 'query/db-connectors', element: <DbConnectorPage /> },
      { path: 'query/db-er', element: <DbErPage /> },
      { path: 'query/db-channel-tools', element: <DbChannelToolsPage /> },
      { path: 'query/query-test', element: <QueryTestPage /> },
      { path: 'rules', element: <RuleConfigPage /> },
      { path: 'rule-hits', element: <RuleHitsPage /> },
      { path: 'knowledge', element: <KnowledgePage /> },
      { path: 'knowledge/layers', element: <KnowledgeLayersPage /> },
      { path: 'knowledge/structure', element: <KnowledgeStructurePage /> },
      { path: 'knowledge/media', element: <KnowledgeMediaPage /> },
      { path: 'knowledge/recall-test', element: <KnowledgeRecallTestPage /> },
      { path: 'approvals', element: <ApprovalListPage /> },
      { path: 'approvals/history', element: <ApprovalHistoryPage /> },
      { path: 'approvals/:id', element: <ApprovalDetailPage /> },
      { path: 'audit', element: <ToolCallAuditPage /> },
      { path: 'audit/user-actions', element: <UserActionAuditPage /> },
      { path: 'audit/external-calls', element: <ExternalCallAuditPage /> },
      { path: 'audit/risk-actions', element: <RiskActionAuditPage /> },
      { path: 'users', element: <UserListPage /> },
      { path: 'roles', element: <RoleListPage /> },
      { path: 'permissions', element: <PermissionPolicyPage /> },
      { path: 'tenants', element: <TenantListPage /> },
      { path: 'tenants/new', element: <NewTenantPage /> },
      { path: 'tenants/:id', element: <TenantDetailPage /> },
      { path: 'tenants/:id/edit', element: <EditTenantPage /> },
      { path: 'tenants/:id/isolation', element: <TenantIsolationPage /> },
      { path: 'openapi/apps', element: <OpenApiAppsPage /> },
      { path: 'openapi/apps/:id', element: <OpenApiAppDetailPage /> },
      { path: 'openapi/logs', element: <OpenApiCallLogsPage /> },
      { path: 'openapi/docs', element: <OpenApiDocsPage /> },
      { path: 'copilot-admin', element: <CopilotAdminPage /> },
      { path: 'copilot-admin/preview', element: <CopilotPreviewPage /> },
      { path: 'settings', element: <BasicSettingsPage /> },
      { path: 'settings/llm', element: <LlmIntegrationPage /> },
      { path: 'settings/model', element: <ModelSettingsPage /> },
      { path: 'settings/notification', element: <NotificationSettingsPage /> },
      { path: 'prompts', element: <PromptListPage /> },
      { path: 'prompts/:id', element: <PromptDetailPage /> },
    ],
  },
];
