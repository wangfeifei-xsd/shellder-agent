import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { applicationProperties } from '@shellder/config';
import { Request } from 'express';

/**
 * 校验 job-worker 内网调用凭证（Header: X-Worker-Token）。
 */
@Injectable()
export class WorkerTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.header('x-worker-token');
    const expected = applicationProperties.get().auth.worker.internalToken;

    if (!expected) {
      throw new UnauthorizedException({
        code: 'WORKER_TOKEN_NOT_CONFIGURED',
        message: '服务端未配置 WORKER_INTERNAL_TOKEN',
      });
    }

    if (!token || token !== expected) {
      throw new UnauthorizedException({
        code: 'WORKER_TOKEN_INVALID',
        message: 'Worker 内网凭证无效',
      });
    }

    return true;
  }
}
