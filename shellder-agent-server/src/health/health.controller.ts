import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** 进程存活探针：不查库，供 Docker healthcheck 在 migrate/seed 完成后使用 */
  @Public()
  @Get('health/live')
  getLive() {
    return { status: 'ok', service: 'shellder-agent-server' };
  }

  @Public()
  @Get('health')
  getHealth() {
    return this.healthService.check();
  }
}
