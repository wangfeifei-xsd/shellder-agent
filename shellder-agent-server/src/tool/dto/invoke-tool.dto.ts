import { IsBoolean, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

/** 解析 HTTP 查询工具 LLM 信号 */
export class ParseSignalDto {
  @IsString()
  @MinLength(1)
  text!: string;

  @IsOptional()
  @IsString()
  tenantId?: string;
}

/** 直连 Invoker 调试 */
export class InvokeToolDto {
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  /** 管理端 debug 可跳过 Policy（默认 false） */
  @IsOptional()
  @IsBoolean()
  skipPolicy?: boolean;
}
