import { Injectable } from '@nestjs/common';
import { OpenApiCallStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopeService } from '../tenant/tenant-scope.service';
import { QueryOpenApiCallLogDto } from './dto/query-openapi-call-log.dto';

@Injectable()
export class OpenApiCallLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  async log(data: {
    appId: string;
    tenantId?: string;
    method: string;
    path: string;
    statusCode: number;
    status: OpenApiCallStatus;
    ip?: string;
    durationMs?: number;
    errorMessage?: string;
    requestSummary?: string;
  }) {
    await this.prisma.openApiCallLog.create({
      data: {
        appId: data.appId,
        tenantId: data.tenantId ?? null,
        method: data.method,
        path: data.path,
        statusCode: data.statusCode,
        status: data.status,
        ip: data.ip ?? null,
        durationMs: data.durationMs ?? null,
        errorMessage: data.errorMessage ?? null,
        requestSummary: data.requestSummary ?? null,
      },
    });

    await this.prisma.openApiApp.update({
      where: { id: data.appId },
      data: { lastCalledAt: new Date() },
    }).catch(() => {});
  }

  async findMany(user: AuthUser, query: QueryOpenApiCallLogDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.OpenApiCallLogWhereInput = {};
    if (query.appId) where.appId = query.appId;
    const tenantFilter = await this.tenantScope.resolveFilter(user, query.tenantId);
    if (tenantFilter !== undefined) where.tenantId = tenantFilter;
    if (query.status) where.status = query.status;
    if (query.path) where.path = { contains: query.path };
    if (query.startTime || query.endTime) {
      where.createdAt = {};
      if (query.startTime) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(query.startTime);
      if (query.endTime) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(query.endTime);
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.openApiCallLog.count({ where }),
      this.prisma.openApiCallLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { app: { select: { id: true, name: true } } },
      }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        appId: r.appId,
        appName: r.app.name,
        tenantId: r.tenantId,
        method: r.method,
        path: r.path,
        statusCode: r.statusCode,
        status: r.status,
        ip: r.ip,
        durationMs: r.durationMs,
        errorMessage: r.errorMessage,
        requestSummary: r.requestSummary,
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  async getStats(
    user: AuthUser,
    query: { appId?: string; tenantId?: string } = {},
  ) {
    const where: Prisma.OpenApiCallLogWhereInput = {};
    if (query.appId) where.appId = query.appId;
    const tenantFilter = await this.tenantScope.resolveFilter(user, query.tenantId);
    if (tenantFilter !== undefined) where.tenantId = tenantFilter;

    const [total, success, failed, rateLimited] = await this.prisma.$transaction([
      this.prisma.openApiCallLog.count({ where }),
      this.prisma.openApiCallLog.count({ where: { ...where, status: 'success' } }),
      this.prisma.openApiCallLog.count({ where: { ...where, status: 'failed' } }),
      this.prisma.openApiCallLog.count({ where: { ...where, status: 'rate_limited' } }),
    ]);

    return {
      total,
      success,
      failed,
      rateLimited,
      successRate: total > 0 ? +(success / total * 100).toFixed(2) : 0,
      errorRate: total > 0 ? +(failed / total * 100).toFixed(2) : 0,
    };
  }
}
