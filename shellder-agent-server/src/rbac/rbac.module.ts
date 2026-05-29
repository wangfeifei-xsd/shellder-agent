import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionPolicyController } from './permission-policy/permission-policy.controller';
import { PermissionPolicyService } from './permission-policy/permission-policy.service';
import { RoleController } from './role/role.controller';
import { RoleService } from './role/role.service';
import { UserController } from './user/user.controller';
import { UserService } from './user/user.service';

@Module({
  imports: [PrismaModule],
  controllers: [UserController, RoleController, PermissionPolicyController],
  providers: [UserService, RoleService, PermissionPolicyService],
  exports: [UserService, RoleService],
})
export class RbacModule {}
