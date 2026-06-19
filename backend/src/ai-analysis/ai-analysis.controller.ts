import { Controller, Post, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AiAnalysisService } from './ai-analysis.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('AI')
@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class AiAnalysisController {
  constructor(private aiService: AiAnalysisService) {}

  @Post('analyze/:leadId')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Analyze lead with AI' })
  @ApiResponse({ status: 200, description: 'Analysis completed' })
  async analyzeLead(
    @GetUser('sub') userId: string,
    @Param('leadId') leadId: string,
    @Query('provider') provider?: string,
  ) {
    return this.aiService.analyzeLead(leadId, userId, provider);
  }

  @Post('outreach/:leadId')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Generate outreach message' })
  @ApiResponse({ status: 200, description: 'Message generated' })
  async generateOutreach(
    @Param('leadId') leadId: string,
    @Body('type') type: string,
    @Query('provider') provider?: string,
  ) {
    return this.aiService.generateOutreachMessage(leadId, type, provider);
  }

  @Post('follow-up/:leadId')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Generate follow-up message' })
  @ApiResponse({ status: 200, description: 'Follow-up generated' })
  async generateFollowUp(
    @Param('leadId') leadId: string,
    @Body('sequence') sequence: number,
    @Body('previousMessages') previousMessages: any[],
    @Query('provider') provider?: string,
  ) {
    return this.aiService.generateFollowUp(leadId, sequence, previousMessages, provider);
  }
}