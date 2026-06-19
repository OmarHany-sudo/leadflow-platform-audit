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
import { WebhooksService } from './webhooks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Webhooks')
@Controller('webhooks')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class WebhooksController {
  constructor(private webhooksService: WebhooksService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER)
  @ApiOperation({ summary: 'Create webhook' })
  async create(
    @GetUser('organizationId') organizationId: string,
    @Body() data: {
      name: string;
      url: string;
      secret?: string;
      events?: string[];
      integrationId?: string;
    },
  ) {
    return this.webhooksService.create(organizationId, data);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'List webhooks' })
  async findAll(@GetUser('organizationId') organizationId: string) {
    return this.webhooksService.findAll(organizationId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Get webhook by ID' })
  async findOne(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.webhooksService.findOne(organizationId, id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER)
  @ApiOperation({ summary: 'Update webhook' })
  async update(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() data: any,
  ) {
    return this.webhooksService.update(organizationId, id, data);
  }

  @Post(':id/test')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER)
  @ApiOperation({ summary: 'Test webhook delivery' })
  async testDelivery(
    @Param('id') id: string,
  ) {
    return this.webhooksService.deliver(id, 'webhook.test', { message: 'Test payload', timestamp: new Date().toISOString() });
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER)
  @ApiOperation({ summary: 'Delete webhook' })
  async delete(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.webhooksService.delete(organizationId, id);
  }
}
