import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Connector, ConnectorType } from '@prisma/client';
import { AuthUser } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopeService } from '../tenant/tenant-scope.service';
import { ErDiagram } from './connector-schema.types';
import { ConnectorIntrospectionService } from './connector-introspection.service';
import { ConnectorService } from './connector.service';
import { ErDiagramService } from './er-diagram.service';
import { ErDataScopeService } from './er-data-scope.service';

export type ErGenerationStatus = 'idle' | 'running' | 'done' | 'failed';

export interface ErGenerationJobView {
  status: ErGenerationStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  error: string | null;
}

interface ErGenerationJob {
  status: Exclude<ErGenerationStatus, 'idle'>;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
}

@Injectable()
export class ConnectorSchemaService {
  private readonly logger = new Logger(ConnectorSchemaService.name);

  /** ER 草稿生成任务状态（进程内，按 connectorId 维护；server 重启即清空） */
  private readonly erGenerationJobs = new Map<string, ErGenerationJob>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectorService: ConnectorService,
    private readonly introspection: ConnectorIntrospectionService,
    private readonly erDiagram: ErDiagramService,
    private readonly erDataScope: ErDataScopeService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  /** 库表结构页：db_readonly 连接器 + 元数据摘要 */
  async listDbSchemaSummaries(user: AuthUser, tenantId?: string) {
    const { items } = await this.connectorService.findMany(user, {
      tenantId,
      type: ConnectorType.db_readonly,
      pageSize: 200,
    });
    if (!items.length) return { items: [] };

    const metas = await this.prisma.connectorDbMetadata.findMany({
      where: { connectorId: { in: items.map((c) => c.id) } },
    });
    const metaById = new Map(metas.map((m) => [m.connectorId, m]));

    return {
      items: items.map((c) => {
        const meta = metaById.get(c.id);
        const published = meta?.erDiagramPublished as ErDiagram | null;
        const props = c.properties ?? {};
        return {
          id: c.id,
          tenantId: c.tenantId,
          name: c.name,
          target: c.target,
          database: typeof props.database === 'string' ? props.database : null,
          status: c.status,
          introspectedAt: meta?.introspectedAt ?? null,
          publishedVersion: meta?.erPublishedVersion ?? null,
          publishedAt: meta?.erPublishedAt ?? null,
          publishedTableCount: published?.tables?.length ?? 0,
          hasPublished: !!published?.tables?.length,
        };
      }),
    };
  }

  private async requireDbConnector(user: AuthUser, id: string): Promise<Connector> {
    const connector = await this.getConnectorOrThrow(id);
    await this.tenantScope.assertAccess(user, connector.tenantId, { resource: '连接器' });
    if (connector.type !== 'db_readonly') {
      throw new NotFoundException({
        code: 'CONNECTOR_NOT_DB_READONLY',
        message: '仅只读数据库连接器支持结构抽取与 ER 图',
      });
    }
    return connector;
  }

  /** 仅抽取表结构；ER 草稿生成由 startRegenerateDraft 手动异步触发 */
  async introspect(user: AuthUser, id: string) {
    const connector = await this.requireDbConnector(user, id);
    const schema = await this.introspection.introspect(connector);
    return { schema };
  }

  async getSchema(user: AuthUser, id: string) {
    await this.requireDbConnector(user, id);
    return this.introspection.getSchema(id);
  }

  async getErDiagram(user: AuthUser, id: string) {
    await this.requireDbConnector(user, id);
    return this.erDiagram.getDiagramState(id);
  }

  async saveDraft(user: AuthUser, id: string, diagram: ErDiagram) {
    await this.requireDbConnector(user, id);
    const draft = await this.erDiagram.saveDraft(id, diagram);
    return { draft };
  }

  async publish(user: AuthUser, id: string) {
    await this.requireDbConnector(user, id);
    return this.erDiagram.publish(id);
  }

  /**
   * 异步触发 LLM 生成 ER 草稿：立即返回 running 状态，前端通过
   * getErGenerationStatus 轮询；避免 LLM 长耗时导致网关 504。
   */
  async startRegenerateDraft(user: AuthUser, id: string): Promise<ErGenerationJobView> {
    const connector = await this.requireDbConnector(user, id);

    const existing = this.erGenerationJobs.get(id);
    if (existing?.status === 'running') {
      throw new ConflictException({
        code: 'ER_GENERATION_RUNNING',
        message: 'ER 草稿生成中，请稍后查询结果',
      });
    }

    // 前置条件同步校验（LLM 未配置 / 未抽取表结构），让用户立即收到错误
    await this.erDiagram.assertRegenerateReady(connector);

    const job: ErGenerationJob = {
      status: 'running',
      startedAt: new Date(),
      finishedAt: null,
      error: null,
    };
    this.erGenerationJobs.set(id, job);

    void this.erDiagram
      .regenerateDraft(connector)
      .then(() => {
        job.status = 'done';
        job.finishedAt = new Date();
      })
      .catch((err: unknown) => {
        job.status = 'failed';
        job.finishedAt = new Date();
        job.error = this.extractErrorMessage(err);
        this.logger.warn(`连接器 ${id} ER 草稿异步生成失败：${job.error}`);
      });

    return this.toJobView(job);
  }

  async getErGenerationStatus(user: AuthUser, id: string): Promise<ErGenerationJobView> {
    await this.requireDbConnector(user, id);
    const job = this.erGenerationJobs.get(id);
    if (!job) {
      return { status: 'idle', startedAt: null, finishedAt: null, error: null };
    }
    return this.toJobView(job);
  }

  private toJobView(job: ErGenerationJob): ErGenerationJobView {
    return {
      status: job.status,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      error: job.error,
    };
  }

  private extractErrorMessage(err: unknown): string {
    if (err instanceof HttpException) {
      const res = err.getResponse();
      if (typeof res === 'string') return res;
      if (res && typeof res === 'object' && 'message' in res) {
        const m = (res as { message: unknown }).message;
        if (typeof m === 'string') return m;
      }
    }
    return err instanceof Error ? err.message : String(err);
  }

  async suggestDataScope(user: AuthUser, id: string) {
    const connector = await this.requireDbConnector(user, id);
    const { diagram, warnings } = await this.erDataScope.suggestDataScope(connector);
    return { draft: diagram, warnings };
  }

  private async getConnectorOrThrow(id: string): Promise<Connector> {
    const connector = await this.prisma.connector.findUnique({ where: { id } });
    if (!connector) {
      throw new NotFoundException({
        code: 'CONNECTOR_NOT_FOUND',
        message: `连接器不存在：${id}`,
      });
    }
    return connector;
  }
}
