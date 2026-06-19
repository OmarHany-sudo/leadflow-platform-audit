import { Module } from '@nestjs/common';
import { PipelineStagesService } from './pipeline-stages.service';
import { PipelineStagesController } from './pipeline-stages.controller';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PipelineStagesController],
  providers: [PipelineStagesService],
  exports: [PipelineStagesService],
})
export class PipelineStagesModule {}
