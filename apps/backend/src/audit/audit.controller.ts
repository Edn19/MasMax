import { Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Response } from 'express';
import { AdminGuard } from '../common/admin.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuditQuery, AuditService } from './audit.service';

class AuditQueryDto implements AuditQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
  @IsOptional() @IsString() actorId?: string;
  @IsOptional() @IsString() user?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() entity?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get() list(@Query() query: AuditQueryDto) { return this.audit.list(query); }
  @Get('facets') facets() { return this.audit.facets(); }
  @Get('retention') retention() { return this.audit.retentionPolicy(); }

  @Get('export.csv')
  async export(@Query() query: AuditQueryDto, @Res() response: Response) {
    const csv = await this.audit.exportCsv(query);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`);
    response.send(csv);
  }

  @Post('retention/cleanup') cleanup() { return this.audit.applyRetention(); }
}
