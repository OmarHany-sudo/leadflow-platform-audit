import { Module } from '@nestjs/common';
import { QualificationService } from './qualification.service';
import { QualificationController } from './qualification.controller';
import { PrismaModule } from '../common/prisma/prisma.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { PipelinesModule } from '../pipelines/pipelines.module';

@Module({
  imports: [PrismaModule, OpportunitiesModule, PipelinesModule],
  controllers: [QualificationController],
  providers: [QualificationService],
  exports: [QualificationService],
})
export class QualificationModule {}
