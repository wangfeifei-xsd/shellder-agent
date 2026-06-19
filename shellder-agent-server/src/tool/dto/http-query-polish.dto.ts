import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

/** HTTP 查询工具表单草稿（管理端 AI 润色入参） */
export class HttpQueryPolishDto {
  @IsString()
  @MinLength(1)
  tenantId!: string;

  /** 当前表单字段快照 */
  @IsObject()
  draft!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  instruction?: string;
}
