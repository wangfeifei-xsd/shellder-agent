import { IsInt, IsOptional, IsUrl, Max, Min } from 'class-validator';

export class UpsertKnowledgeConnectionDto {
  @IsUrl({ require_tld: false }, { message: 'wikiBaseUrl 须为有效 URL（如 http://127.0.0.1:8765）' })
  wikiBaseUrl!: string;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(600_000)
  wikiTimeoutMs?: number;
}
