import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AiWorkflowsService } from './ai-workflows.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('AI Workflows')
@Controller('ai-workflows')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class AiWorkflowsController {
  constructor(private aiWorkflowsService: AiWorkflowsService) {}

  // Enrichment
  @Post('enrich/:leadId')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Enrich lead data' })
  async enrichLead(
    @Param('leadId') leadId: string,
    @Body('type') type: 'full' | 'social' | 'contacts' | 'company' = 'full',
  ) {
    return this.aiWorkflowsService.enrichLead(leadId, type);
  }

  // Social Profile Discovery
  @Post('discover-social/:leadId')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Discover social profiles for lead' })
  async discoverSocialProfiles(@Param('leadId') leadId: string) {
    return this.aiWorkflowsService.discoverSocialProfilesForLead(leadId);
  }

  // Sentiment Analysis
  @Post('sentiment/:leadId')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Analyze sentiment of messages' })
  async analyzeSentiment(
    @Param('leadId') leadId: string,
    @Body('messageId') messageId?: string,
  ) {
    return this.aiWorkflowsService.analyzeSentiment(leadId, messageId);
  }

  @Post('sentiment/batch')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Batch sentiment analysis' })
  async batchAnalyzeSentiments(@Body('leadIds') leadIds: string[]) {
    return this.aiWorkflowsService.batchAnalyzeSentiments(leadIds);
  }

  // Reply Classification
  @Post('classify/:leadId')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Classify replies' })
  async classifyReply(
    @Param('leadId') leadId: string,
    @Body('messageId') messageId?: string,
  ) {
    return this.aiWorkflowsService.classifyReply(leadId, messageId);
  }

  @Post('classify/batch')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Batch reply classification' })
  async batchClassifyReplies(@Body('leadIds') leadIds: string[]) {
    return this.aiWorkflowsService.batchClassifyReplies(leadIds);
  }
}
