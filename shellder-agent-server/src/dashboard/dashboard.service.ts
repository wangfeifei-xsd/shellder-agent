import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopeService } from '../tenant/tenant-scope.service';
import { AuthUser } from '../auth/jwt.types';

export interface ToolStats {
  total: number;
  success: number;
  failed: number;
  successRate: number;
  failRate: number;
  avgDurationMs: number | null;
}

export interface PendingApprovalItem {
  id: string;
  actionType: string;
  actionSummary: string | null;
  riskLevel: string;
  initiatorName: string | null;
  createdAt: Date;
}

export interface RecentFailedTaskItem {
  id: string;
  title: string | null;
  status: string;
  capabilityType: string | null;
  failReason: string | null;
  createdAt: Date;
}

export interface DashboardSummary {
  toolStats: ToolStats;
  pendingApprovals: PendingApprovalItem[];
  pendingApprovalCount: number;
  recentFailedTasks: RecentFailedTaskItem[];
  recentFailedTaskCount: number;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  async getSummary(user: AuthUser, tenantId?: string): Promise<DashboardSummary> {
    const tenantFilter = await this.tenantScope.resolveFilter(user, tenantId);

    const [toolStats, pendingApprovals, pendingApprovalCount, recentFailedTasks, recentFailedTaskCount] =
      await Promise.all([
        this.getToolStats(tenantFilter),
        this.getPendingApprovals(tenantFilter),
        this.getPendingApprovalCount(tenantFilter),
        this.getRecentFailedTasks(tenantFilter),
        this.getRecentFailedTaskCount(tenantFilter),
      ]);

    return {
      toolStats,
      pendingApprovals,
      pendingApprovalCount,
      recentFailedTasks,
      recentFailedTaskCount,
    };
  }

  private async getToolStats(
    tenantFilter: Prisma.ToolCallAuditWhereInput['tenantId'],
  ): Promise<ToolStats> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const where: Prisma.ToolCallAuditWhereInput = {
      tenantId: tenantFilter,
      createdAt: { gte: sevenDaysAgo },
    };

    const [total, successCount, failedCount, avgResult] = await Promise.all([
      this.prisma.toolCallAudit.count({ where }),
      this.prisma.toolCallAudit.count({ where: { ...where, status: 'success' } }),
      this.prisma.toolCallAudit.count({ where: { ...where, status: 'failed' } }),
      this.prisma.toolCallAudit.aggregate({
        where,
        _avg: { durationMs: true },
      }),
    ]);

    return {
      total,
      success: successCount,
      failed: failedCount,
      successRate: total > 0 ? Math.round((successCount / total) * 10000) / 100 : 0,
      failRate: total > 0 ? Math.round((failedCount / total) * 10000) / 100 : 0,
      avgDurationMs: avgResult._avg.durationMs
        ? Math.round(avgResult._avg.durationMs)
        : null,
    };
  }

  private async getPendingApprovals(
    tenantFilter: Prisma.ApprovalWhereInput['tenantId'],
  ): Promise<PendingApprovalItem[]> {
    const rows = await this.prisma.approval.findMany({
      where: { tenantId: tenantFilter, status: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        actionType: true,
        actionSummary: true,
        riskLevel: true,
        initiatorName: true,
        createdAt: true,
      },
    });
    return rows;
  }

  private async getPendingApprovalCount(
    tenantFilter: Prisma.ApprovalWhereInput['tenantId'],
  ): Promise<number> {
    return this.prisma.approval.count({
      where: { tenantId: tenantFilter, status: 'pending' },
    });
  }

  private async getRecentFailedTasks(
    tenantFilter: Prisma.TaskWhereInput['tenantId'],
  ): Promise<RecentFailedTaskItem[]> {
    const rows = await this.prisma.task.findMany({
      where: {
        tenantId: tenantFilter,
        status: { in: ['failed', 'timeout'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        status: true,
        capabilityType: true,
        failReason: true,
        createdAt: true,
      },
    });
    return rows;
  }

  private async getRecentFailedTaskCount(
    tenantFilter: Prisma.TaskWhereInput['tenantId'],
  ): Promise<number> {
    return this.prisma.task.count({
      where: {
        tenantId: tenantFilter,
        status: { in: ['failed', 'timeout'] },
      },
    });
  }
}
