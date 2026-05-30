import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SendMessageMode } from '../../agent-runtime/agent-runtime.types';

export class OpenApiTokenDto {
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @IsString()
  @IsNotEmpty()
  clientSecret: string;
}

export class OpenApiCreateSessionDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsOptional()
  @IsString()
  externalTenantId?: string;

  @IsOptional()
  @IsString()
  title?: string;
}

export class OpenApiSendMessageDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  /** sync：同步返回完整回复；stream（默认）：立即返回 messageId，通过 SSE 推送 */
  @IsOptional()
  @IsEnum(['sync', 'stream'])
  mode?: SendMessageMode;
}

export class OpenApiConfirmationDto {
  @IsString()
  @IsNotEmpty()
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  opinion?: string;
}
