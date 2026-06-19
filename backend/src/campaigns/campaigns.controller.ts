import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Campaigns')
@Controller('campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class CampaignsController {
  constructor(private campaignsService: CampaignsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Create campaign' })
  async create(
    @GetUser('organizationId') organizationId: string,
    @GetUser('sub') userId: string,
    @Body() data: any,
  ) {
    return this.campaignsService.create(organizationId, userId, data);
  }

  @Get()
  @ApiOperation({ summary: 'List campaigns' })
  async findAll(
    @GetUser('organizationId') organizationId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.campaignsService.findAll(organizationId, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get campaign details' })
  async findOne(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.campaignsService.findOne(organizationId, id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Update campaign' })
  async update(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() data: any,
  ) {
    return this.campaignsService.update(organizationId, id, data);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER)
  @ApiOperation({ summary: 'Delete campaign' })
  async delete(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.campaignsService.delete(organizationId, id);
  }

  @Post(':id/leads')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Add leads to campaign' })
  async addLeads(
    @GetUser('organizationId') organizationId: string,
    @Param('id') campaignId: string,
    @Body('leadIds') leadIds: string[],
  ) {
    return this.campaignsService.addLeads(organizationId, campaignId, leadIds);
  }

  @Post(':id/launch')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Launch campaign' })
  async launch(
    @GetUser('organizationId') organizationId: string,
    @GetUser('sub') userId: string,
    @Param('id') campaignId: string,
  ) {
    return this.campaignsService.launch(organizationId, campaignId, userId);
  }

  @Get('stats/overview')
  @ApiOperation({ summary: 'Get campaign statistics' })
  async getStats(@GetUser('organizationId') organizationId: string) {
    return this.campaignsService.getStats(organizationId);
  }
}