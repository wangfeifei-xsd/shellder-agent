import { Injectable, NotFoundException } from '@nestjs/common';
import { Connector, ConnectorType } from '@prisma/client';
import { AuthUser } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';
import { ErDiagram } from './connector-schema.types';
import { ConnectorIntrospectionService } from './connector-introspection.service';
import { ConnectorService } from './connector.service';
import { ErDiagramService } from './er-diagram.service';

@Injectable()
export class ConnectorSchemaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connectorService: ConnectorService,
    private readonly introspection: ConnectorIntrospectionService,
    private readonly erDiagram: ErDiagramService,
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
    await this.connectorService.assertTenantAccess(user, connector.tenantId);
    if (connector.type !== 'db_readonly') {
      throw new NotFoundException({
        code: 'CONNECTOR_NOT_DB_READONLY',
        message: '仅只读数据库连接器支持结构抽取与 ER 图',
      });
    }
    return connector;
  }

  async introspect(user: AuthUser, id: string, autoRegenerateDraft = true) {
    const connector = await this.requireDbConnector(user, id);
    const schema = await this.introspection.introspect(connector);
    let draft: ErDiagram | null = null;
    if (autoRegenerateDraft) {
      try {
        draft = await this.erDiagram.regenerateDraft(connector);
      } catch {
        draft = null;
      }
    }
    return { schema, draft };
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

  async regenerateDraft(user: AuthUser, id: string) {
    const connector = await this.requireDbConnector(user, id);
    const draft = await this.erDiagram.regenerateDraft(connector);
    return { draft };
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
