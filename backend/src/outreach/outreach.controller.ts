import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OutreachService } from './outreach.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole, MessageType } from '@prisma/client';

@ApiTags('Outreach')
@Controller('outreach')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class OutreachController {
  constructor(private outreachService: OutreachService) {}

  @Post('generate/:leadId/email')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Generate email outreach' })
  async generateEmail(
    @GetUser('sub') userId: string,
    @Param('leadId') leadId: string,
    @Query('provider') provider?: string,
  ) {
    return this.outreachService.generateEmail(leadId, userId, provider);
  }

  @Post('generate/:leadId/whatsapp')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Generate WhatsApp message' })
  async generateWhatsApp(
    @GetUser('sub') userId: string,
    @Param('leadId') leadId: string,
    @Query('provider') provider?: string,
  ) {
    return this.outreachService.generateWhatsApp(leadId, userId, provider);
  }

  @Post('generate/:leadId/linkedin')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Generate LinkedIn message' })
  async generateLinkedIn(
    @GetUser('sub') userId: string,
    @Param('leadId') leadId: string,
    @Query('provider') provider?: string,
  ) {
    return this.outreachService.generateLinkedIn(leadId, userId, provider);
  }

  @Post('messages')
  @ApiOperation({ summary: 'Save outreach message' })
  async saveMessage(
    @GetUser('sub') userId: string,
    @Body('leadId') leadId: string,
    @Body('type') type: MessageType,
    @Body('content') content: string,
    @Body('subject') subject?: string,
    @Body('isAIGenerated') isAIGenerated?: boolean,
  ) {
    return this.outreachService.saveMessage(leadId, userId, type, content, subject, isAIGenerated);
  }

  @Get('messages/:leadId')
  @ApiOperation({ summary: 'Get messages for lead' })
  async getMessages(
    @Param('leadId') leadId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.outreachService.getMessages(leadId, page, limit);
  }

  @Get('templates')
  @ApiOperation({ summary: 'Get outreach templates' })
  async getTemplates(@Query('type') type?: MessageType) {
    return this.outreachService.getTemplates(type);
  }
}