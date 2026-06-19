import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FollowUpsService } from './follow-ups.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { FollowUpStatus } from '@prisma/client';

@ApiTags('Follow-ups')
@Controller('follow-ups')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class FollowUpsController {
  constructor(private followUpsService: FollowUpsService) {}

  @Get(':leadId')
  @ApiOperation({ summary: 'Get follow-ups for lead' })
  async findAll(@Param('leadId') leadId: string) {
    return this.followUpsService.findAll(leadId);
  }

  @Post(':leadId')
  @ApiOperation({ summary: 'Create follow-up' })
  async create(
    @GetUser('sub') userId: string,
    @Param('leadId') leadId: string,
    @Body() data: any,
  ) {
    return this.followUpsService.create(leadId, userId, data);
  }

  @Post(':leadId/generate')
  @ApiOperation({ summary: 'Generate AI follow-up sequence' })
  async generateSequence(
    @GetUser('sub') userId: string,
    @Param('leadId') leadId: string,
    @Query('count') count?: number,
    @Query('provider') provider?: string,
  ) {
    return this.followUpsService.generateSequence(leadId, userId, count, provider);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Update follow-up status' })
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: FollowUpStatus,
  ) {
    return this.followUpsService.updateStatus(id, status);
  }
}