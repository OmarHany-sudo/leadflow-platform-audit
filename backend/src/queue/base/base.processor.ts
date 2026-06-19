import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface ProcessorProgress {
  percent: number;
  message: string;
  step: string;
}

export interface DeadLetterEntry {
  queueName: string;
  jobName: string;
  jobId: string;
  data: any;
  error: string;
  errorStack?: string;
  attempts: number;
  maxAttempts: number;
}

export abstract class BaseProcessor<T = any> {
  protected readonly logger: Logger;
  protected readonly maxRetries = 3;
  protected readonly backoffMs = 5000;

  constructor(
    protected readonly processorName: string,
    protected readonly prisma: PrismaService,
  ) {
    this.logger = new Logger(processorName);
  }

  /**
   * Main processing method - must be implemented by concrete processors
   */
  abstract process(job: Job<T>): Promise<any>;

  /**
   * Process wrapper with error handling, progress tracking, and DLQ
   */
  async processWithTracking(job: Job<T>): Promise<any> {
    const startTime = Date.now();
    this.logger.log(`[${this.processorName}] Processing job ${job.id}: ${job.name}`);

    try {
      // Update progress to started
      await this.updateProgress(job, 0, 'Job started');
      await this.logJobStatus(job.id as string, 'PROCESSING', { startedAt: new Date() });

      // Execute the actual processing
      const result = await this.process(job);

      // Mark as completed
      const duration = Date.now() - startTime;
      await this.updateProgress(job, 100, 'Job completed');
      await this.logJobStatus(job.id as string, 'COMPLETED', {
        result,
        durationMs: duration,
        completedAt: new Date(),
      });

      this.logger.log(`[${this.processorName}] Job ${job.id} completed in ${duration}ms`);
      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error(`[${this.processorName}] Job ${job.id} failed after ${duration}ms: ${error.message}`, error.stack);

      // Update progress with error
      await this.updateProgress(job, -1, `Error: ${error.message}`);

      // Log failure
      await this.logJobStatus(job.id as string, 'FAILED', {
        error: error.message,
        stack: error.stack,
        durationMs: duration,
        failedAt: new Date(),
        attempts: job.attemptsMade + 1,
      });

      // Check if we should send to DLQ
      if (job.attemptsMade + 1 >= this.maxRetries) {
        await this.sendToDLQ(job, error);
        this.logger.warn(`[${this.processorName}] Job ${job.id} moved to dead letter queue after ${job.attemptsMade + 1} attempts`);
      }

      throw error;
    }
  }

  /**
   * Update job progress (0-100)
   */
  protected async updateProgress(job: Job<T>, percent: number, message: string): Promise<void> {
    try {
      await job.updateProgress({ percent, message, timestamp: new Date() });
    } catch (error: any) {
      this.logger.warn(`Failed to update progress: ${error.message}`);
    }
  }

  /**
   * Log job status to database
   */
  protected async logJobStatus(jobId: string, status: string, metadata?: any): Promise<void> {
    try {
      await this.prisma.jobLog.updateMany({
        where: { jobId },
        data: {
          status: status as any,
          result: metadata ? (metadata as any) : undefined,
          retryCount: metadata?.attempts || 0,
          startedAt: status === 'PROCESSING' ? new Date() : undefined,
          completedAt: status === 'COMPLETED' ? new Date() : undefined,
          failedAt: status === 'FAILED' ? new Date() : undefined,
        },
      });
    } catch (error: any) {
      this.logger.warn(`Failed to log job status: ${error.message}`);
    }
  }

  /**
   * Send failed job to dead letter queue for manual review
   */
  protected async sendToDLQ(job: Job<T>, error: Error): Promise<void> {
    try {
      const entry: DeadLetterEntry = {
        queueName: this.processorName,
        jobName: job.name,
        jobId: job.id as string,
        data: job.data,
        error: error.message,
        errorStack: error.stack,
        attempts: job.attemptsMade + 1,
        maxAttempts: this.maxRetries,
      };

      await this.prisma.deadLetterJob.create({
        data: {
          queueName: entry.queueName,
          jobName: entry.jobName,
          jobId: entry.jobId,
          data: entry.data as any,
          error: entry.error,
          errorStack: entry.errorStack,
          attempts: entry.attempts,
          maxAttempts: entry.maxAttempts,
          status: 'PENDING',
        },
      });

      this.logger.log(`[${this.processorName}] Job ${job.id} sent to DLQ`);
    } catch (dlqError: any) {
      this.logger.error(`Failed to write to DLQ: ${dlqError.message}`);
    }
  }

  /**
   * Check if error is retryable
   */
  protected isRetryableError(error: Error): boolean {
    const retryablePatterns = [
      'timeout',
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'rate limit',
      'too many requests',
      'temporary',
      'unavailable',
      'timeout',
    ];

    const errorMessage = error.message.toLowerCase();
    return retryablePatterns.some(pattern => errorMessage.includes(pattern));
  }

  /**
   * Sleep utility for delays
   */
  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get queue metrics
   */
  async getMetrics(): Promise<{
    processed: number;
    failed: number;
    avgDuration: number;
    lastProcessedAt: Date | null;
  }> {
    const logs = await this.prisma.jobLog.findMany({
      where: { queueName: this.processorName },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const processed = logs.filter(l => l.status === 'COMPLETED').length;
    const failed = logs.filter(l => l.status === 'FAILED').length;
    const durations = logs
      .filter(l => l.result && (l.result as any).durationMs)
      .map(l => (l.result as any).durationMs as number);

    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    const lastProcessedAt = logs.length > 0 ? logs[0].createdAt : null;

    return {
      processed,
      failed,
      avgDuration,
      lastProcessedAt,
    };
  }
}
