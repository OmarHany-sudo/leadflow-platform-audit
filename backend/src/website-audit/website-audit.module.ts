import { Module } from '@nestjs/common';
import { WebsiteAuditService } from './website-audit.service';
import { WebsiteAuditController } from './website-audit.controller';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [WebsiteAuditController],
  providers: [WebsiteAuditService],
  exports: [WebsiteAuditService],
})
export class WebsiteAuditModule {}