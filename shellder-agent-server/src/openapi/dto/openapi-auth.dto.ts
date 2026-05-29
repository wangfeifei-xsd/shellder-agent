import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
}

export class OpenApiConfirmationDto {
  @IsString()
  @IsNotEmpty()
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  opinion?: string;
}
