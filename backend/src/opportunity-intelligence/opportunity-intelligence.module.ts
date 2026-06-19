import { Module } from '@nestjs/common';
import { OpportunityIntelligenceService } from './opportunity-intelligence.service';
import { OpportunityIntelligenceController } from './opportunity-intelligence.controller';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [OpportunityIntelligenceController],
  providers: [OpportunityIntelligenceService],
  exports: [OpportunityIntelligenceService],
})
export class OpportunityIntelligenceModule {}
