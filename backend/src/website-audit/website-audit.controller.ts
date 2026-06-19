import { Controller, Post, Get, Param, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { WebsiteAuditService } from './website-audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Website Audit')
@Controller('website-audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class WebsiteAuditController {
  constructor(private auditService: WebsiteAuditService) {}

  @Post(':leadId')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Run website audit for lead' })
  @ApiResponse({ status: 200, description: 'Audit completed' })
  async auditWebsite(
    @Param('leadId') leadId: string,
    @Query('url') url: string,
  ) {
    return this.auditService.auditWebsite(leadId, url);
  }

  @Get(':leadId')
  @ApiOperation({ summary: 'Get website audit results' })
  @ApiResponse({ status: 200, description: 'Audit retrieved' })
  async getAudit(@Param('leadId') leadId: string) {
    return this.auditService.getAudit(leadId);
  }
}