import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { AdminGuard } from '../common/admin.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuditService } from './audit.service';

class AuditQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}
  @Get() list(@Query() query: AuditQueryDto) { return this.audit.list(query.page, query.limit); }
}
