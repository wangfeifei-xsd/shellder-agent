import { Controller, Get, Header } from '@nestjs/common';

@Controller()
export class MetricsController {
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics() {
    return '# HELP shellder_job_worker_up Job worker is running\n# TYPE shellder_job_worker_up gauge\nshellder_job_worker_up 1\n';
  }
}
