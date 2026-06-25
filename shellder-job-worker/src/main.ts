import './load-env';
import { NestFactory } from '@nestjs/core';
import { applicationProperties } from '@shellder/config';
import { AppModule } from './app.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(RequestIdMiddleware);

  const port = applicationProperties.resolveListenPort('job-worker', 3002);
  await app.listen(port);
}

bootstrap();
