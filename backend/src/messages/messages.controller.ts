import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Messages')
@Controller('messages')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @Get(':leadId')
  @ApiOperation({ summary: 'Get messages for lead' })
  async findAll(
    @Param('leadId') leadId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.messagesService.findAll(leadId, page, limit);
  }

  @Post(':leadId')
  @ApiOperation({ summary: 'Create message' })
  async create(
    @GetUser('sub') userId: string,
    @Param('leadId') leadId: string,
    @Body() data: any,
  ) {
    return this.messagesService.create(leadId, userId, data);
  }
}