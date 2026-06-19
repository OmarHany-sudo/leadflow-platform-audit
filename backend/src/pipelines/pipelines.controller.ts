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
import { PipelinesService } from './pipelines.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Pipelines')
@Controller('pipelines')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class PipelinesController {
  constructor(private pipelinesService: PipelinesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Create a new pipeline' })
  @ApiResponse({ status: 201, description: 'Pipeline created' })
  async create(
    @GetUser('organizationId') organizationId: string,
    @Body() data: { name: string; description?: string; type?: string },
  ) {
    return this.pipelinesService.create(organizationId, data);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'List all pipelines' })
  @ApiResponse({ status: 200, description: 'Pipelines retrieved' })
  async findAll(@GetUser('organizationId') organizationId: string) {
    return this.pipelinesService.findAll(organizationId);
  }

  @Get('default')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Get or create default pipeline' })
  @ApiResponse({ status: 200, description: 'Default pipeline retrieved' })
  async getDefault(@GetUser('organizationId') organizationId: string) {
    return this.pipelinesService.getOrCreateDefault(organizationId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Get pipeline by ID' })
  @ApiResponse({ status: 200, description: 'Pipeline retrieved' })
  async findOne(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.pipelinesService.findOne(organizationId, id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Update pipeline' })
  @ApiResponse({ status: 200, description: 'Pipeline updated' })
  async update(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() data: { name?: string; description?: string; type?: string },
  ) {
    return this.pipelinesService.update(organizationId, id, data);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Delete pipeline' })
  @ApiResponse({ status: 200, description: 'Pipeline deleted' })
  async delete(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.pipelinesService.delete(organizationId, id);
  }

  @Get(':id/metrics')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Get pipeline metrics' })
  @ApiResponse({ status: 200, description: 'Pipeline metrics retrieved' })
  async getMetrics(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.pipelinesService.getPipelineMetrics(organizationId, id);
  }
}
