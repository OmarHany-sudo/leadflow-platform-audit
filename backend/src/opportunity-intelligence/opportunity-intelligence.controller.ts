import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OpportunityIntelligenceService } from './opportunity-intelligence.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Opportunity Intelligence')
@Controller('opportunity-intelligence')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class OpportunityIntelligenceController {
  constructor(private intelligenceService: OpportunityIntelligenceService) {}

  @Post(':opportunityId')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Generate intelligence report for opportunity' })
  async generateReport(
    @Param('opportunityId') opportunityId: string,
    @GetUser('organizationId') organizationId: string,
  ) {
    return this.intelligenceService.generateReport(opportunityId, organizationId);
  }

  @Get(':opportunityId')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Get insights for opportunity' })
  async getInsights(
    @Param('opportunityId') opportunityId: string,
    @GetUser('organizationId') organizationId: string,
  ) {
    return this.intelligenceService.getInsights(opportunityId, organizationId);
  }
}
