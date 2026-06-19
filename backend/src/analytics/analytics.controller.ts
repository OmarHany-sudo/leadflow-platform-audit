import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get dashboard analytics' })
  @ApiResponse({ status: 200, description: 'Dashboard data' })
  async getDashboard(@GetUser('organizationId') organizationId: string) {
    return this.analyticsService.getDashboard(organizationId);
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'Get campaign statistics' })
  @ApiResponse({ status: 200, description: 'Campaign stats' })
  async getCampaignStats(@GetUser('organizationId') organizationId: string) {
    return this.analyticsService.getCampaignStats(organizationId);
  }

  @Get('activities')
  @ApiOperation({ summary: 'Get activity timeline' })
  @ApiResponse({ status: 200, description: 'Activity data' })
  async getActivityTimeline(
    @GetUser('organizationId') organizationId: string,
    @Query('days') days?: number,
  ) {
    return this.analyticsService.getActivityTimeline(organizationId, days);
  }
}