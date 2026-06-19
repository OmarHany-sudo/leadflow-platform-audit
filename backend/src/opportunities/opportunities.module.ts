import { Module } from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';
import { OpportunitiesController } from './opportunities.controller';
import { PrismaModule } from '../common/prisma/prisma.module';
import { PipelineStagesModule } from '../pipeline-stages/pipeline-stages.module';
import { PipelinesModule } from '../pipelines/pipelines.module';

@Module({
  imports: [PrismaModule, PipelinesModule, PipelineStagesModule],
  controllers: [OpportunitiesController],
  providers: [OpportunitiesService],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}
