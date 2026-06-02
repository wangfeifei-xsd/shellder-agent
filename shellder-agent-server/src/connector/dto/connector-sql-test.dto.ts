import { IsObject, IsOptional, IsString } from 'class-validator';

/** 只读库连接器 SQL 测试（查询测试页，不经 Tool Policy） */
export class ConnectorSqlTestDto {
  @IsString()
  sql!: string;

  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}
