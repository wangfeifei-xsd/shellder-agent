import {
  Body,
  Controller,
  Get,
  Logger,
  MessageEvent,
  Param,
  Post,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, Subject } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/jwt.types';
import { ApprovalRuntimeService } from '../approval/approval-runtime.service';
import { AgentRuntimeService } from './agent-runtime.service';
import { SseEmitterService } from './sse-emitter.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ConfirmActionDto } from './dto/confirm-action.dto';
import { SseEvent } from './agent-runtime.types';

@Controller('api/v1/sessions')
@UseGuards(JwtAuthGuard)
export class AgentRuntimeController {
  private readonly logger = new Logger(AgentRuntimeController.name);

  constructor(
    private readonly runtimeService: AgentRuntimeService,
    private readonly approvalRuntime: ApprovalRuntimeService,
    private readonly sseEmitter: SseEmitterService,
  ) {}

  /**
   * POST /api/v1/sessions/:id/messages
   *
   * 发送用户消息并触发 Agent 编排。
   * mode=sync  → 同步等待返回完整回复。
   * mode=stream（默认）→ 立即返回消息 ID，通过 SSE 推送。
   */
  @Post(':id/messages')
  async sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') sessionId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.runtimeService.sendMessage(user, sessionId, dto);
  }

  /**
   * GET /api/v1/sessions/:id/stream
   *
   * SSE 流式事件推送（架构 §4.1）。
   * EventSource 无法携带 Authorization，客户端使用 ?token= 平台 JWT（见 JwtAuthGuard）。
   * 事件类型：delta | tool_start | tool_end | confirm_required | done | error
   */
  @Get(':id/stream')
  @Sse()
  stream(
    @CurrentUser() user: AuthUser,
    @Param('id') sessionId: string,
    @Req() req: Request,
  ): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    const unsubscribe = this.sseEmitter.subscribe(
      sessionId,
      (event: SseEvent) => {
        subject.next({
          type: event.event,
          data: JSON.stringify(event.data),
        } as MessageEvent);

        if (event.event === 'done' || event.event === 'error') {
          setTimeout(() => subject.complete(), 100);
        }
      },
    );

    req.on('close', () => {
      this.logger.debug(`SSE 客户端断开 session=${sessionId}`);
      unsubscribe();
      subject.complete();
    });

    return subject.asObservable();
  }

  /**
   * POST /api/v1/sessions/:id/confirm
   *
   * 人工确认后恢复 Runtime 或驳回（执行计划 14 §4）。
   */
  @Post(':id/confirm')
  async confirmAction(
    @CurrentUser() user: AuthUser,
    @Param('id') sessionId: string,
    @Body() dto: ConfirmActionDto,
  ) {
    return this.approvalRuntime.confirmBySession(
      user,
      sessionId,
      dto.messageId,
      dto.action,
      dto.comment,
    );
  }
}
