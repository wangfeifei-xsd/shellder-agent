import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { applicationProperties } from '@shellder/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  CAPABILITY_KEYS,
  MODULE_KEYS,
  PERMISSION_WILDCARD,
  RolePolicy,
} from './permissions';
import { hashPassword } from './password.util';

/**
 * 启动时确保存在默认超级管理员角色与账号，便于本地与首次部署登录。
 * 幂等：按 code/username upsert；已存在不覆盖密码。
 * 关闭：设置环境变量 AUTH_BOOTSTRAP=false。
 */
@Injectable()
export class AuthBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AuthBootstrapService.name);

  private readonly adminRoleCode = 'super-admin';

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    if (!applicationProperties.get().auth.bootstrap.enabled) {
      return;
    }
    try {
      await this.ensureAdmin();
    } catch (err) {
      // 数据库尚未迁移时不阻断启动
      this.logger.warn(
        `默认管理员初始化跳过：${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async ensureAdmin() {
    const superPolicy: RolePolicy = {
      capabilities: [...CAPABILITY_KEYS],
      canApproveHighRisk: true,
    };

    const role = await this.prisma.role.upsert({
      where: { code: this.adminRoleCode },
      update: {},
      create: {
        code: this.adminRoleCode,
        name: '超级管理员',
        description: '系统内置角色，拥有全部菜单、模块与能力权限',
        menus: [PERMISSION_WILDCARD] as unknown as Prisma.InputJsonValue,
        modules: [...MODULE_KEYS] as unknown as Prisma.InputJsonValue,
        toolScopes: [PERMISSION_WILDCARD] as unknown as Prisma.InputJsonValue,
        policy: superPolicy as unknown as Prisma.InputJsonValue,
        isSystem: true,
      },
    });

    const { adminUsername, adminPassword } = applicationProperties.get().auth.bootstrap;
    const username = adminUsername;
    const existing = await this.prisma.user.findUnique({ where: { username } });

    const user =
      existing ??
      (await this.prisma.user.create({
        data: {
          username,
          passwordHash: hashPassword(adminPassword),
          displayName: '平台管理员',
          status: 'enabled',
          isSystem: true,
        },
      }));

    if (!existing) {
      this.logger.log(
        `已创建默认管理员：${username} / ${adminPassword}（请尽快修改密码）`,
      );
    }

    // 绑定超级管理员角色
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });

    // 绑定默认租户（若已通过 02-seed 写入）
    const defaultTenant = await this.prisma.tenant.findUnique({
      where: { code: 'default' },
    });
    if (defaultTenant) {
      await this.prisma.userTenant.upsert({
        where: {
          userId_tenantId: { userId: user.id, tenantId: defaultTenant.id },
        },
        update: {},
        create: { userId: user.id, tenantId: defaultTenant.id },
      });
    }
  }
}
