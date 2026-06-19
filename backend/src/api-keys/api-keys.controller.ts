import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('API Keys')
@Controller('api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class ApiKeysController {
  constructor(private apiKeysService: ApiKeysService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER)
  @ApiOperation({ summary: 'Create API key' })
  async create(
    @GetUser('organizationId') organizationId: string,
    @GetUser('sub') userId: string,
    @Body() data: {
      name: string;
      integrationId?: string;
      permissions?: string[];
      scopes?: string[];
      expiresInDays?: number;
    },
  ) {
    return this.apiKeysService.create(organizationId, userId, data);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER)
  @ApiOperation({ summary: 'List API keys' })
  async findAll(@GetUser('organizationId') organizationId: string) {
    return this.apiKeysService.findAll(organizationId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER)
  @ApiOperation({ summary: 'Get API key by ID' })
  async findOne(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.apiKeysService.findOne(organizationId, id);
  }

  @Post(':id/revoke')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER)
  @ApiOperation({ summary: 'Revoke API key' })
  async revoke(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.apiKeysService.revoke(organizationId, id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER)
  @ApiOperation({ summary: 'Delete API key' })
  async delete(
    @GetUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.apiKeysService.delete(organizationId, id);
  }
}
