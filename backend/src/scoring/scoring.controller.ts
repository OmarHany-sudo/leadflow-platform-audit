import { Controller, Post, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ScoringService } from './scoring.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Scoring')
@Controller('scoring')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class ScoringController {
  constructor(private scoringService: ScoringService) {}

  @Post(':leadId')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Score a lead' })
  @ApiResponse({ status: 200, description: 'Lead scored' })
  async scoreLead(
    @GetUser('organizationId') organizationId: string,
    @Param('leadId') leadId: string,
  ) {
    return this.scoringService.scoreLead(leadId, organizationId);
  }

  @Get(':leadId')
  @ApiOperation({ summary: 'Get lead score' })
  @ApiResponse({ status: 200, description: 'Score retrieved' })
  async getScore(@Param('leadId') leadId: string) {
    return this.scoringService.getScore(leadId);
  }
}