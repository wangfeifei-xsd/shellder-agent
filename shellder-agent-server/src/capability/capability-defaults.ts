import { CapabilityType } from '@prisma/client';

/** 租户首次使用能力路由时自动补齐的四类基础能力（名称租户内唯一） */
export const DEFAULT_TENANT_CAPABILITIES: ReadonlyArray<{
  type: CapabilityType;
  name: string;
  description: string;
  applicableSystem: string;
  priority: number;
}> = [
  {
    type: 'qa',
    name: '通用问答',
    description: '基于知识库的问答能力',
    applicableSystem: '全平台',
    priority: 10,
  },
  {
    type: 'query',
    name: '数据查询',
    description: 'SQL 只读查询能力',
    applicableSystem: '数据分析',
    priority: 20,
  },
  {
    type: 'action',
    name: '业务操作',
    description: 'HTTP API 写操作能力',
    applicableSystem: '业务系统',
    priority: 30,
  },
  {
    type: 'workflow',
    name: '流程编排',
    description: '多步骤任务编排能力',
    applicableSystem: '运营系统',
    priority: 40,
  },
];
