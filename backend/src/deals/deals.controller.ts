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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DealsService } from './deals.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Deals')
@Controller('deals')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class DealsController {
  constructor(private dealsService: DealsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Create deal' })
  async create(
    @GetUser('organizationId') organizationId: string,
    @GetUser('sub') userId: string,
    @Body() data: {
      opportunityId: string;
      title?: string;
      description?: string;
      value: number;
      currency?: string;
      assignedToId?: string;
    },
  ) {
    return this.dealsService.create(organizationId, userId, data);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'List deals' })
  async findAll(
    @GetUser('organizationId') organizationId: string,
    @Query() query: { page?: number; limit?: number; status?: string; assignedToId?: string },
  ) {
    return this.dealsService.findAll(organizationId, query);
  }

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Get deal stats' })
  async getStats(@GetUser('organizationId') organizationId: string) {
    return this.dealsService.getStats(organizationId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Get deal by ID' })
  async findOne(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.dealsService.findOne(organizationId, id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Update deal' })
  async update(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() data: any,
  ) {
    return this.dealsService.update(organizationId, id, data);
  }

  @Post(':id/close')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Close deal' })
  async close(
    @GetUser('organizationId') organizationId: string,
    @GetUser('sub') userId: string,
    @Param('id') id: string,
  ) {
    return this.dealsService.close(organizationId, userId, id);
  }

  @Post(':id/cancel')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Cancel deal' })
  async cancel(
    @GetUser('organizationId') organizationId: string,
    @GetUser('sub') userId: string,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.dealsService.cancel(organizationId, userId, id, reason);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Delete deal' })
  async delete(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.dealsService.delete(organizationId, id);
  }
}
