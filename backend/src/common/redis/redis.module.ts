import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';
export const REDIS_QUEUE_CLIENT = 'REDIS_QUEUE_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        return new Redis(configService.get('redis.url'));
      },
      inject: [ConfigService],
    },
    {
      provide: REDIS_QUEUE_CLIENT,
      useFactory: (configService: ConfigService) => {
        return new Redis(configService.get('redis.url'), {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT, REDIS_QUEUE_CLIENT],
})
export class RedisModule {}