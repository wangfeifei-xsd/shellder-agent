import { IsObject, IsOptional, IsString } from 'class-validator';
import { QueryPrincipalContextFieldsDto } from './query-principal-context.dto';

/**
 * 调用测试入参（执行计划 §4.4）。
 * 执行前走 Policy；Policy 拒绝 / 需确认时不执行外部调用（验收标准 2）。
 */
export class TestToolDto {
  /** 测试入参（按 Tool.inputSchema 校验） */
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}

/**
 * SQL 查询工具测试入参（执行计划 §4.5）。
 * 提供 SQL（或选用模板 sql）+ 参数；服务层做只读 / 黑名单 / 行数 / 时长校验后执行。
 */
export class TestSqlDto extends QueryPrincipalContextFieldsDto {
  /** 待测试 SQL（与 templateId 二选一；同时提供以 sql 为准） */
  @IsOptional()
  @IsString()
  sql?: string;

  /** 选用的模板 id（从 config.sql.templates 取 SQL） */
  @IsOptional()
  @IsString()
  templateId?: string;

  /** 命名参数（:name 占位）取值 */
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}
