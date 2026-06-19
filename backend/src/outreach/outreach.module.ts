import { Module } from '@nestjs/common';
import { OutreachService } from './outreach.service';
import { OutreachController } from './outreach.controller';
import { AiAnalysisModule } from '../ai-analysis/ai-analysis.module';

@Module({
  imports: [AiAnalysisModule],
  controllers: [OutreachController],
  providers: [OutreachService],
  exports: [OutreachService],
})
export class OutreachModule {}