import { Module } from '@nestjs/common';
import { AiWorkflowsService } from './ai-workflows.service';
import { AiWorkflowsController } from './ai-workflows.controller';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AiWorkflowsController],
  providers: [AiWorkflowsService],
  exports: [AiWorkflowsService],
})
export class AiWorkflowsModule {}
