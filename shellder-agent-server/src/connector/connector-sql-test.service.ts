import { Injectable } from '@nestjs/common';
import { Connector } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/jwt.types';
import { SqlToolService } from '../tool/sql-tool.service';
import { DEFAULT_SQL_CONFIG } from '../tool/tool.types';
import { ConnectorService } from './connector.service';
import { ConnectorSqlTestDto } from './dto/connector-sql-test.dto';

export interface ConnectorSqlTestResult {
  executed: boolean;
  status: 'success' | 'failed';
  rawRequest?: unknown;
  rawResponse?: unknown;
  transformedResult?: unknown;
  durationMs: number;
  message: string;
}

@Injectable()
export class ConnectorSqlTestService {
  constructor(
    private readonly connectorService: ConnectorService,
    private readonly sqlTool: SqlToolService,
    private readonly audit: AuditService,
  ) {}

  async sqlTest(
    user: AuthUser,
    connectorId: string,
    dto: ConnectorSqlTestDto,
  ): Promise<ConnectorSqlTestResult> {
    const connector = await this.connectorService.assertAccessible(user, connectorId);
    this.assertDbReadonly(connector);

    const sql = dto.sql?.trim();
    if (!sql) {
      throw new Error('SQL 不能为空');
    }
    const params = dto.params ?? {};

    try {
      const exec = await this.sqlTool.execute(connector, sql, params, DEFAULT_SQL_CONFIG);
      await this.recordExternalCall(user, connector, 'success', exec.durationMs, null);
      return {
        executed: true,
        status: 'success',
        rawRequest: { sql: exec.executedSql, values: exec.boundValues },
        rawResponse: { rowCount: exec.rowCount, rows: exec.rows },
        transformedResult: exec.rows,
        durationMs: exec.durationMs,
        message: exec.message,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.recordExternalCall(user, connector, 'failed', 0, message);
      throw err;
    }
  }

  private assertDbReadonly(connector: Connector) {
    if (connector.type !== 'db_readonly') {
      throw new Error('仅只读数据库连接器支持 SQL 查询测试');
    }
    if (connector.status === 'disabled') {
      throw new Error('连接器已停用');
    }
  }

  private async recordExternalCall(
    user: AuthUser,
    connector: Connector,
    status: 'success' | 'failed',
    durationMs: number,
    errorMessage: string | null,
  ) {
    await this.audit.logExternalCall({
      tenantId: connector.tenantId,
      connectorId: connector.id,
      target: connector.target,
      method: 'SQL',
      callerUserId: user.id,
      requestSummary: `[查询测试] ${connector.name}`,
      status,
      statusCode: null,
      durationMs,
      errorMessage,
    });
  }
}
