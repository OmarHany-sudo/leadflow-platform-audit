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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PipelineStagesService } from './pipeline-stages.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Pipeline Stages')
@Controller('pipeline-stages')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class PipelineStagesController {
  constructor(private stagesService: PipelineStagesService) {}

  @Post(':pipelineId')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Add stage to pipeline' })
  async create(
    @Param('pipelineId') pipelineId: string,
    @Body() data: {
      name: string;
      description?: string;
      color?: string;
      winProbability?: number;
      expectedDays?: number;
      order?: number;
    },
  ) {
    return this.stagesService.create(pipelineId, data);
  }

  @Get(':pipelineId')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Get stages by pipeline' })
  async findByPipeline(@Param('pipelineId') pipelineId: string) {
    return this.stagesService.findByPipeline(pipelineId);
  }

  @Put(':pipelineId/:stageId')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Update stage' })
  async update(
    @Param('pipelineId') pipelineId: string,
    @Param('stageId') stageId: string,
    @Body() data: {
      name?: string;
      description?: string;
      color?: string;
      winProbability?: number;
      expectedDays?: number;
    },
  ) {
    return this.stagesService.update(pipelineId, stageId, data);
  }

  @Put(':pipelineId/reorder')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Reorder stages' })
  async reorder(
    @Param('pipelineId') pipelineId: string,
    @Body() data: { stages: { id: string; order: number }[] },
  ) {
    return this.stagesService.reorder(pipelineId, data.stages);
  }

  @Delete(':pipelineId/:stageId')
  @Roles(UserRole.ADMIN, UserRole.AGENCY_OWNER, UserRole.SALES_MANAGER)
  @ApiOperation({ summary: 'Delete stage' })
  async delete(
    @Param('pipelineId') pipelineId: string,
    @Param('stageId') stageId: string,
  ) {
    return this.stagesService.delete(pipelineId, stageId);
  }
}
