import { Global, Module } from '@nestjs/common';
import { TenantController } from './tenant.controller';
import { TenantScopeService } from './tenant-scope.service';
import { TenantService } from './tenant.service';

@Global()
@Module({
  controllers: [TenantController],
  providers: [TenantService, TenantScopeService],
  exports: [TenantService, TenantScopeService],
})
export class TenantModule {}
