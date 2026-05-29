import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { getRedisConnection } from './redis/redis.config';

@Module({
  imports: [
    BullModule.forRoot({
      connection: getRedisConnection(),
    }),
    PrismaModule,
    HealthModule,
    MetricsModule,
    QueueModule,
  ],
})
export class AppModule {}
