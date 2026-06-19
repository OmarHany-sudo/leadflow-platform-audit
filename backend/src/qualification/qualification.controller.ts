import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { QualificationService } from './qualification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Qualification')
@Controller('qualification')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class QualificationController {
  constructor(private qualificationService: QualificationService) {}

  @Post(':leadId')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Qualify a lead' })
  async qualify(
    @Param('leadId') leadId: string,
    @GetUser('organizationId') organizationId: string,
    @GetUser('sub') userId: string,
  ) {
    return this.qualificationService.qualifyLead(leadId, organizationId, userId);
  }

  @Post('batch')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Batch qualify leads' })
  async batchQualify(
    @Body('leadIds') leadIds: string[],
    @GetUser('organizationId') organizationId: string,
    @GetUser('sub') userId: string,
  ) {
    return this.qualificationService.batchQualify(leadIds, organizationId, userId);
  }

  @Get(':leadId/history')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Get qualification history' })
  async getHistory(@Param('leadId') leadId: string) {
    return this.qualificationService.getQualificationHistory(leadId);
  }
}
