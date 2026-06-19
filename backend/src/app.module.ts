import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

// Config
import { appConfig } from './config/app.config';
import { databaseConfig } from './config/database.config';
import { redisConfig } from './config/redis.config';
import { aiConfig } from './config/ai.config';

// Modules
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LeadsModule } from './leads/leads.module';
import { MessagesModule } from './messages/messages.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { ActivitiesModule } from './activities/activities.module';
import { ScoringModule } from './scoring/scoring.module';
import { WebsiteAuditModule } from './website-audit/website-audit.module';
import { AiAnalysisModule } from './ai-analysis/ai-analysis.module';
import { OutreachModule } from './outreach/outreach.module';
import { FollowUpsModule } from './follow-ups/follow-ups.module';
import { ConnectorsModule } from './connectors/connectors.module';
import { QueueModule } from './queue/queue.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CommonModule } from './common/common.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, aiConfig],
      envFilePath: ['.env', '../docker/.env'],
    }),

    // Rate Limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get('RATE_LIMIT_WINDOW_MS', 60000),
          limit: config.get('RATE_LIMIT_MAX_REQUESTS', 100),
        },
      ],
    }),

    // Scheduler
    ScheduleModule.forRoot(),

    // Core Infrastructure
    PrismaModule,
    RedisModule,
    CommonModule,

    // Feature Modules
    AuthModule,
    UsersModule,
    LeadsModule,
    MessagesModule,
    CampaignsModule,
    ActivitiesModule,
    ScoringModule,
    WebsiteAuditModule,
    AiAnalysisModule,
    OutreachModule,
    FollowUpsModule,
    ConnectorsModule,
    QueueModule,
    AnalyticsModule,
  ],
})
export class AppModule {}