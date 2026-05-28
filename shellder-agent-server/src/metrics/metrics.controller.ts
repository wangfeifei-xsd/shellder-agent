import { Controller, Get, Header } from '@nestjs/common';

/** Prometheus 抓取占位（后续阶段补充业务指标） */
@Controller()
export class MetricsController {
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics() {
    return '# HELP shellder_agent_server_up Agent server is running\n# TYPE shellder_agent_server_up gauge\nshellder_agent_server_up 1\n';
  }
}
