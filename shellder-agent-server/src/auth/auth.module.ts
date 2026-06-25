import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { applicationProperties } from '@shellder/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthBootstrapService } from './auth-bootstrap.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionGuard } from './guards/permission.guard';
import { PermissionService } from './permission.service';

@Global()
@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      global: true,
      secret: applicationProperties.get().auth.jwt.secret,
      signOptions: {
        expiresIn: applicationProperties.get().auth.jwt.expiresIn,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PermissionService,
    AuthBootstrapService,
    // 全局鉴权：默认所有路由需登录，@Public() 例外
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 全局权限校验：按 @RequireMenu / @RequireModule 元数据校验
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [AuthService, PermissionService],
})
export class AuthModule {}
