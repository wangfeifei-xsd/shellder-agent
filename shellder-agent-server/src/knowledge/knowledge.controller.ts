import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Audit } from '../audit/decorators/audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireMenu } from '../auth/decorators/require-permission.decorator';
import { AuthUser } from '../auth/jwt.types';
import { KnowledgeService } from './knowledge.service';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto';
import { QueryKnowledgeBaseDto } from './dto/query-knowledge-base.dto';

/** 租户 wiki 绑定元数据；内容/召回见 {@link KnowledgeProxyController} */
@Controller('api/v1/knowledge-bases')
@RequireMenu('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post()
  @Audit({ action: 'knowledge.create', module: 'knowledge.manage', targetType: 'knowledge_base' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateKnowledgeBaseDto) {
    return this.knowledgeService.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryKnowledgeBaseDto) {
    return this.knowledgeService.findMany(user, query);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.knowledgeService.findOne(user, id);
  }

  @Patch(':id')
  @Audit({ action: 'knowledge.update', module: 'knowledge.manage', targetType: 'knowledge_base' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeBaseDto,
  ) {
    return this.knowledgeService.update(user, id, dto);
  }

  @Delete(':id')
  @Audit({ action: 'knowledge.delete', module: 'knowledge.manage', targetType: 'knowledge_base' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.knowledgeService.remove(user, id);
  }
}
