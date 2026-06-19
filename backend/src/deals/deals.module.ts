import { Module } from '@nestjs/common';
import { DealsService } from './deals.service';
import { DealsController } from './deals.controller';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DealsController],
  providers: [DealsService],
  exports: [DealsService],
})
export class DealsModule {}
