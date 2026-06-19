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
import { ContactsService } from './contacts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Contacts')
@Controller('contacts')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class ContactsController {
  constructor(private contactsService: ContactsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Create contact' })
  async create(
    @GetUser('sub') userId: string,
    @Body() data: {
      leadId: string;
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
      jobTitle?: string;
      department?: string;
      role?: string;
      isPrimary?: boolean;
      isDecisionMaker?: boolean;
      linkedInUrl?: string;
      twitterUrl?: string;
      facebookUrl?: string;
    },
  ) {
    return this.contactsService.create(userId, data);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Search contacts' })
  async search(
    @GetUser('organizationId') organizationId: string,
    @Query() query: {
      search?: string;
      leadId?: string;
      role?: string;
      isDecisionMaker?: boolean;
      page?: number;
      limit?: number;
    },
  ) {
    return this.contactsService.search(organizationId, query);
  }

  @Get('lead/:leadId')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Get contacts by lead' })
  async findByLead(@Param('leadId') leadId: string) {
    return this.contactsService.findByLead(leadId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Get contact by ID' })
  async findOne(@Param('id') id: string) {
    return this.contactsService.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Update contact' })
  async update(
    @Param('id') id: string,
    @GetUser('sub') userId: string,
    @Body() data: any,
  ) {
    return this.contactsService.update(id, userId, data);
  }

  @Post(':id/primary')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Set contact as primary' })
  async setPrimary(
    @Param('id') id: string,
    @GetUser('sub') userId: string,
  ) {
    return this.contactsService.setPrimary(id, userId);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Delete contact' })
  async delete(
    @Param('id') id: string,
    @GetUser('sub') userId: string,
  ) {
    return this.contactsService.delete(id, userId);
  }
}
