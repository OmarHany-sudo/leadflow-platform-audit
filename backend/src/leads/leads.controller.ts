import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { CreateLeadDto, UpdateLeadDto, LeadQueryDto, BulkAssignDto } from './dto/lead.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole, LeadStatus, Temperature, Priority } from '@prisma/client';

@ApiTags('Leads')
@Controller('leads')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class LeadsController {
  constructor(private leadsService: LeadsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Create new lead' })
  @ApiResponse({ status: 201, description: 'Lead created successfully' })
  async create(
    @GetUser('sub') userId: string,
    @GetUser('organizationId') organizationId: string,
    @Body() dto: CreateLeadDto,
  ) {
    return this.leadsService.create(userId, organizationId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all leads with filtering' })
  @ApiResponse({ status: 200, description: 'Leads retrieved successfully' })
  async findAll(
    @GetUser('sub') userId: string,
    @GetUser('organizationId') organizationId: string,
    @Query() query: LeadQueryDto,
  ) {
    return this.leadsService.findAll(userId, organizationId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get lead statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved' })
  async getStats(
    @GetUser('sub') userId: string,
    @GetUser('organizationId') organizationId: string,
  ) {
    return this.leadsService.getStats(userId, organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get lead by ID' })
  @ApiParam({ name: 'id', description: 'Lead ID' })
  @ApiResponse({ status: 200, description: 'Lead retrieved' })
  @ApiResponse({ status: 404, description: 'Lead not found' })
  async findOne(
    @GetUser('sub') userId: string,
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.leadsService.findOne(userId, organizationId, id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Update lead' })
  @ApiResponse({ status: 200, description: 'Lead updated' })
  async update(
    @GetUser('sub') userId: string,
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadsService.update(userId, organizationId, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete lead' })
  @ApiResponse({ status: 200, description: 'Lead deleted' })
  async remove(
    @GetUser('sub') userId: string,
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.leadsService.remove(userId, organizationId, id);
  }

  @Patch(':id/assign/:userId')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Assign lead to user' })
  @ApiResponse({ status: 200, description: 'Lead assigned' })
  async assign(
    @GetUser('sub') userId: string,
    @GetUser('organizationId') organizationId: string,
    @Param('id') leadId: string,
    @Param('userId') assignedToId: string,
  ) {
    return this.leadsService.assign(userId, organizationId, leadId, assignedToId);
  }

  @Post('bulk-assign')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Bulk assign leads' })
  @ApiResponse({ status: 200, description: 'Leads assigned' })
  async bulkAssign(
    @GetUser('sub') userId: string,
    @GetUser('organizationId') organizationId: string,
    @Body() dto: BulkAssignDto,
  ) {
    return this.leadsService.bulkAssign(userId, organizationId, dto);
  }

  @Patch(':id/status/:status')
  @ApiOperation({ summary: 'Update lead status' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  async updateStatus(
    @GetUser('sub') userId: string,
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
    @Param('status') status: LeadStatus,
  ) {
    return this.leadsService.updateStatus(userId, organizationId, id, status);
  }

  @Patch(':id/score')
  @ApiOperation({ summary: 'Update lead score' })
  @ApiResponse({ status: 200, description: 'Score updated' })
  async updateScore(
    @GetUser('sub') userId: string,
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body('score') score: number,
  ) {
    return this.leadsService.updateScore(userId, organizationId, id, score);
  }
}