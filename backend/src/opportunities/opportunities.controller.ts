import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OpportunitiesService } from './opportunities.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Opportunities')
@Controller('opportunities')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class OpportunitiesController {
  constructor(private opportunitiesService: OpportunitiesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Create opportunity' })
  async create(
    @GetUser('organizationId') organizationId: string,
    @GetUser('sub') userId: string,
    @Body() data: {
      title: string;
      description?: string;
      leadId: string;
      pipelineId?: string;
      stageId?: string;
      estimatedValue?: number;
      currency?: string;
      expectedCloseDate?: string;
      priority?: string;
      assignedToId?: string;
    },
  ) {
    return this.opportunitiesService.create(organizationId, userId, data);
  }

  @Post('from-lead/:leadId')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Create opportunity from lead' })
  async createFromLead(
    @GetUser('organizationId') organizationId: string,
    @GetUser('sub') userId: string,
    @Param('leadId') leadId: string,
  ) {
    return this.opportunitiesService.createFromLead(organizationId, userId, leadId);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'List opportunities' })
  async findAll(
    @GetUser('organizationId') organizationId: string,
    @Query() query: {
      page?: number;
      limit?: number;
      status?: string;
      pipelineId?: string;
      assignedToId?: string;
      search?: string;
      priority?: string;
    },
  ) {
    return this.opportunitiesService.findAll(organizationId, query);
  }

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Get opportunity stats' })
  async getStats(@GetUser('organizationId') organizationId: string) {
    return this.opportunitiesService.getStats(organizationId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Get opportunity by ID' })
  async findOne(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.opportunitiesService.findOne(organizationId, id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Update opportunity' })
  async update(
    @GetUser('organizationId') organizationId: string,
    @GetUser('sub') userId: string,
    @Param('id') id: string,
    @Body() data: any,
  ) {
    return this.opportunitiesService.update(organizationId, userId, id, data);
  }

  @Put(':id/stage')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Change opportunity stage' })
  async changeStage(
    @GetUser('organizationId') organizationId: string,
    @GetUser('sub') userId: string,
    @Param('id') id: string,
    @Body('stageId') stageId: string,
  ) {
    return this.opportunitiesService.changeStage(organizationId, userId, id, stageId);
  }

  @Put(':id/assign')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Assign opportunity' })
  async assign(
    @GetUser('organizationId') organizationId: string,
    @GetUser('sub') userId: string,
    @Param('id') id: string,
    @Body('assignedToId') assignedToId: string,
  ) {
    return this.opportunitiesService.assign(organizationId, userId, id, assignedToId);
  }

  @Post(':id/win')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Mark opportunity as won' })
  async markAsWon(
    @GetUser('organizationId') organizationId: string,
    @GetUser('sub') userId: string,
    @Param('id') id: string,
  ) {
    return this.opportunitiesService.markAsWon(organizationId, userId, id);
  }

  @Post(':id/lose')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Mark opportunity as lost' })
  async markAsLost(
    @GetUser('organizationId') organizationId: string,
    @GetUser('sub') userId: string,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.opportunitiesService.markAsLost(organizationId, userId, id, reason);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Delete opportunity' })
  async delete(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.opportunitiesService.delete(organizationId, id);
  }
}
