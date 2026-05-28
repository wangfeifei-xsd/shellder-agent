import './load-env';
import './load-env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(RequestIdMiddleware);

  const port = Number(process.env.PORT ?? process.env.JOB_WORKER_PORT ?? 3002);
  await app.listen(port);
}

bootstrap();
