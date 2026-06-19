import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Integrations')
@Controller('integrations')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class IntegrationsController {
  constructor(private integrationsService: IntegrationsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER)
  @ApiOperation({ summary: 'Create integration' })
  async create(
    @GetUser('organizationId') organizationId: string,
    @Body() data: {
      name: string;
      type: string;
      provider: string;
      credentials?: Record<string, any>;
      settings?: Record<string, any>;
    },
  ) {
    return this.integrationsService.create(organizationId, data);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'List integrations' })
  async findAll(@GetUser('organizationId') organizationId: string) {
    return this.integrationsService.findAll(organizationId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Get integration by ID' })
  async findOne(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.integrationsService.findOne(organizationId, id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER)
  @ApiOperation({ summary: 'Update integration' })
  async update(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() data: any,
  ) {
    return this.integrationsService.update(organizationId, id, data);
  }

  @Post(':id/activate')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER)
  @ApiOperation({ summary: 'Activate integration' })
  async activate(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.integrationsService.updateStatus(organizationId, id, 'ACTIVE' as any);
  }

  @Post(':id/deactivate')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER)
  @ApiOperation({ summary: 'Deactivate integration' })
  async deactivate(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.integrationsService.updateStatus(organizationId, id, 'DISABLED' as any);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER)
  @ApiOperation({ summary: 'Delete integration' })
  async delete(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.integrationsService.delete(organizationId, id);
  }
}
